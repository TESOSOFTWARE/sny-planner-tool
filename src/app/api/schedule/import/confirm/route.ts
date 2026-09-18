// src/app/api/schedule/import/confirm/route.ts
// POST /api/schedule/import/confirm
// Receives the preview payload + user decisions, executes the atomic transaction:
//   1. Backup deleted assignments → ScheduleImportLog
//   2. Delete existing tháng 7 assignments (+ optional borderline)
//   3. Create draft ProductionOrders for new PI numbers
//   4. Create MachineAssignments for all valid PI
//   5. Upsert MachineSpec (40 machines)
// Any failure → full rollback, nothing is written.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const maxDuration = 60  // Large transaction may take time

interface AssignmentRef {
  id:        string
  machineId: string
  piNumber:  string
  startDate: string
  endDate:   string
}

interface AssignmentToCreate {
  machineId: string
  piNumber:  string
  startDate: string
  endDate:   string
}

interface MachineSpecEntry {
  machineId: string
  widthM:    number
}

interface ConfirmBody {
  toDelete:             AssignmentRef[]
  deleteBorderline:     boolean
  borderlineAssignment: AssignmentRef | null
  toCreateDraftOrders:  string[]         // piNumber[]
  toCreateAssignments:  AssignmentToCreate[]
  machineSpecs:         MachineSpecEntry[]
  year:                 number
  month:                number
  summary: {
    deleteCount:         number
    assignmentsToCreate: number
    draftsToCreate:      number
    ambiguousCount:      number
    invalidCount:        number
  }
}

export async function POST(req: NextRequest) {
  let body: ConfirmBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body.' }, { status: 400 })
  }

  const {
    toDelete,
    deleteBorderline,
    borderlineAssignment,
    toCreateDraftOrders,
    toCreateAssignments,
    machineSpecs,
    year,
    month,
    summary,
  } = body

  // Validation
  if (!Array.isArray(toCreateAssignments) || !Array.isArray(toCreateDraftOrders)) {
    return NextResponse.json({ success: false, error: 'Payload không hợp lệ.' }, { status: 400 })
  }

  // Build the list of assignment IDs to delete
  const idsToDelete = [
    ...toDelete.map(a => a.id),
    ...(deleteBorderline && borderlineAssignment ? [borderlineAssignment.id] : []),
  ]

  try {
    const result = await prisma.$transaction(async (tx) => {
      // ── STEP 1: Backup ────────────────────────────────────────────────────
      // Fetch full assignment data for backup (including orderId)
      const assignmentsForBackup = await tx.machineAssignment.findMany({
        where: { id: { in: idsToDelete } },
        include: { order: { select: { piNumber: true } } },
      })

      await tx.scheduleImportLog.create({
        data: {
          backupData: assignmentsForBackup.map(a => ({
            id:        a.id,
            machineId: a.machineId,
            orderId:   a.orderId,
            piNumber:  a.order.piNumber,
            startDate: a.startDate.toISOString(),
            endDate:   a.endDate.toISOString(),
          })),
          summary: {
            ...summary,
            year,
            month,
            deleteBorderline,
            importedAt: new Date().toISOString(),
          },
        },
      })

      // ── STEP 2: Delete existing assignments ───────────────────────────────
      const deleteResult = await tx.machineAssignment.deleteMany({
        where: { id: { in: idsToDelete } },
      })

      // ── STEP 3: Create draft ProductionOrders for new PI numbers ──────────
      // customer = sentinel string (file has no customer data)
      // isDraft = true, dataSource = 'import'
      let createdDrafts: { id: string; piNumber: string }[] = []
      if (toCreateDraftOrders.length > 0) {
        createdDrafts = await tx.productionOrder.createManyAndReturn({
          data: toCreateDraftOrders.map(pi => ({
            piNumber:     pi,
            customer:     'Chưa xác định (import từ lịch máy)',
            isDraft:      true,
            dataSource:   'import',
            subLineIndex: 0,
            orderDate:    new Date(),
          })),
          select: { id: true, piNumber: true },
          skipDuplicates: true,  // safety: skip if PI already exists (race condition)
        })
      }

      // ── STEP 4: Build piNumber → orderId map ──────────────────────────────
      const piToId = new Map<string, string>()

      // From newly created drafts
      for (const o of createdDrafts) {
        piToId.set(o.piNumber.toLowerCase(), o.id)
      }

      // From existing orders (PI in file but not in toCreateDraftOrders)
      const existingPiNumbers = Array.from(
        new Set(
          toCreateAssignments
            .map(a => a.piNumber)
            .filter(pi => !toCreateDraftOrders.some(
              d => d.toLowerCase() === pi.toLowerCase()
            ))
        )
      )

      for (const pi of existingPiNumbers) {
        // Already resolved from drafts? Skip.
        if (piToId.has(pi.toLowerCase())) continue

        // Case-insensitive lookup for existing order
        // Pick subLineIndex 0 (only unambiguous single-subline PI are in this list)
        const existing = await tx.productionOrder.findFirst({
          where: {
            piNumber: { equals: pi, mode: 'insensitive' },
            subLineIndex: 0,
          },
          select: { id: true },
        })
        if (existing) piToId.set(pi.toLowerCase(), existing.id)
      }

      // ── STEP 5: Create MachineAssignments ────────────────────────────────
      const assignmentRows = toCreateAssignments
        .filter(a => piToId.has(a.piNumber.toLowerCase()))
        .map(a => ({
          machineId: a.machineId,
          orderId:   piToId.get(a.piNumber.toLowerCase())!,
          startDate: new Date(a.startDate),
          endDate:   new Date(a.endDate),
        }))

      const createResult = await tx.machineAssignment.createMany({
        data: assignmentRows,
      })

      // ── STEP 6: Upsert MachineSpec (40 machines) ─────────────────────────
      for (const spec of machineSpecs) {
        await tx.machineSpec.upsert({
          where:  { machineId: spec.machineId },
          create: { machineId: spec.machineId, widthM: spec.widthM },
          update: { widthM: spec.widthM },
        })
      }

      return {
        deleted:       deleteResult.count,
        created:       createResult.count,
        draftsCreated: createdDrafts.length,
        specsUpserted: machineSpecs.length,
        piUnresolved:  toCreateAssignments.filter(
          a => !piToId.has(a.piNumber.toLowerCase())
        ).length,
      }
    }, { timeout: 30_000 })

    return NextResponse.json({
      success: true,
      imported: result,
      needsManualAssignment: [
        'JPY26-274', 'BH26-4', 'GBN26-121', 'GBN26-122',
      ],
      message: `Import thành công: đã tạo ${result.created} assignments, ${result.draftsCreated} đơn nháp mới, cập nhật ${result.specsUpserted} thông số máy.`,
    })
  } catch (err) {
    console.error('[POST /api/schedule/import/confirm]', err)
    const msg = err instanceof Error ? err.message : 'Lỗi server khi import.'
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
