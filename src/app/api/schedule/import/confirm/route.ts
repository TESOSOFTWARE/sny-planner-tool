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
import { outputFallsWithinSchedule, resolveScheduleReplacement, scheduleOutputBounds } from '@/lib/schedule/importSafety'

export const maxDuration = 60  // Large transaction may take time

interface AssignmentRef {
  id:        string
  machineId: string
  piNumber:  string
  startDate: string
  endDate:   string
  productionMeters?: number
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
  assignmentSnapshot: { id: string; orderId: string; updatedAt: string }[]
  toDelete:             AssignmentRef[]
  deleteBorderline:     boolean
  borderlineAssignment: AssignmentRef | null
  borderlineAssignments?: AssignmentRef[]
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
  ambiguousPiNumbers?: string[]
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
  if (typeof deleteBorderline !== 'boolean' || !Array.isArray(toDelete) || !Array.isArray(machineSpecs) || !Array.isArray(body.assignmentSnapshot) || !Array.isArray(toCreateAssignments) || !Array.isArray(toCreateDraftOrders)) {
    return NextResponse.json({ success: false, error: 'Payload không hợp lệ.' }, { status: 400 })
  }
  if (!Number.isInteger(year) || year < 2020 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) {
    return NextResponse.json({ success: false, error: 'Năm/tháng import không hợp lệ.' }, { status: 400 })
  }
  if (toCreateAssignments.some(a => !a || typeof a.machineId !== 'string' || !a.machineId.trim() ||
    typeof a.piNumber !== 'string' || !a.piNumber.trim() ||
    !Number.isFinite(Date.parse(a.startDate)) || !Number.isFinite(Date.parse(a.endDate)) ||
    Date.parse(a.startDate) > Date.parse(a.endDate))) {
    return NextResponse.json({ success: false, error: 'Khoảng ngày hoặc mã máy/PI không hợp lệ.' }, { status: 400 })
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
    // Block concurrent schedule edits and output writes until the replacement
    // commits. Table locks also cover new rows, unlike locking existing IDs.
    await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '5s'")
    await tx.$executeRawUnsafe('LOCK TABLE "machine_assignments", "knitting_daily_output" IN SHARE ROW EXCLUSIVE MODE')
    const monthStart = new Date(`${year}-${String(month).padStart(2, '0')}-01T00:00:00+07:00`)
    const nextMonthStart = new Date(month === 12
      ? `${year + 1}-01-01T00:00:00+07:00`
      : `${year}-${String(month + 1).padStart(2, '0')}-01T00:00:00+07:00`)
    const monthAssignments = await tx.machineAssignment.findMany({
      where: { startDate: { lt: nextMonthStart }, endDate: { gte: monthStart } },
    })
    const snapshot = new Map(body.assignmentSnapshot.map(a => [a.id, a]))
    if (snapshot.size !== body.assignmentSnapshot.length || monthAssignments.length !== snapshot.size || monthAssignments.some(a => {
      const previous = snapshot.get(a.id)
      return !previous || previous.orderId !== a.orderId || previous.updatedAt !== a.updatedAt.toISOString()
    })) {
      throw new ScheduleConflict('STALE_SCHEDULE_PREVIEW', 'Lịch đã thay đổi sau khi xem trước. Vui lòng tải preview lại.')
    }
    // The client payload is only a preview of the user's decision. Derive the
    // actual delete set from the locked database rows so a caller cannot add a
    // borderline or otherwise unpreviewed assignment to `toDelete`.
    const requestedDeleteIds = monthAssignments
      .filter(assignment => assignment.startDate >= monthStart || (deleteBorderline && assignment.startDate < monthStart))
      .map(assignment => assignment.id)
    // Re-read the database at confirmation time.  A stale preview must not be
    // able to delete a new assignment, and assignments with recorded knitting
    // output are protected until a planner explicitly resolves them.
    const machineIds = Array.from(new Set(monthAssignments.map(a => a.machineId)))
    const outputBounds = monthAssignments.map(assignment => scheduleOutputBounds(assignment))
    const outputStart = outputBounds.length > 0
      ? new Date(Math.min(...outputBounds.map(bounds => bounds.gte.getTime())))
      : null
    const outputEnd = outputBounds.length > 0
      ? new Date(Math.max(...outputBounds.map(bounds => bounds.lte.getTime())))
      : null
    const outputRows = machineIds.length > 0
      ? await tx.knittingDailyOutput.findMany({
          where: {
            machineId: { in: machineIds },
            dailyMeters: { gt: 0 },
            ...(outputStart && outputEnd ? { reportDate: { gte: outputStart, lte: outputEnd } } : {}),
          },
          select: { machineId: true, reportDate: true, dailyMeters: true },
        })
      : []
    const protectedAssignments = monthAssignments.filter(a => {
      return outputRows.some(row => row.machineId === a.machineId && outputFallsWithinSchedule(row.reportDate, a))
    })
    const protectedIds = new Set(protectedAssignments.map(a => a.id))
    const { idsToDelete, skippedProtected, safeAssignments, preservedConflict } = resolveScheduleReplacement(
      monthAssignments, toCreateAssignments, requestedDeleteIds, protectedIds,
    )
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

      // ── STEP 3: Create draft ProductionOrders for new PI numbers ──────────
      // customer = sentinel string (file has no customer data)
      // isDraft = true, dataSource = 'import'
      let createdDrafts: { id: string; piNumber: string }[] = []
      const safePiNumbers = new Set(safeAssignments.map(a => a.piNumber.toLowerCase()))
      const draftsToCreate = toCreateDraftOrders.filter(pi => safePiNumbers.has(pi.toLowerCase()))
      if (draftsToCreate.length > 0) {
        createdDrafts = await tx.productionOrder.createManyAndReturn({
          data: draftsToCreate.map(pi => ({
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
          safeAssignments
            .map(a => a.piNumber)
        )
      )

      for (const pi of existingPiNumbers) {
        // Already resolved from drafts? Skip.

        // Case-insensitive lookup for existing order
        // Pick subLineIndex 0 (only unambiguous single-subline PI are in this list)
        const existing = await tx.productionOrder.findMany({
          where: {
            piNumber: { equals: pi, mode: 'insensitive' },
          },
          select: { id: true },
        })
        if (existing.length === 1) piToId.set(pi.toLowerCase(), existing[0].id)
        else throw new ScheduleConflict('UNRESOLVED_SCHEDULE_PI', `PI ${pi} không có đơn duy nhất. Hãy xử lý liên kết rồi preview lại.`)
      }

      const draftOrderIds = new Set(
        (await tx.productionOrder.findMany({
          where: { id: { in: Array.from(piToId.values()) }, isDraft: true },
          select: { id: true },
        })).map(order => order.id)
      )

      // ── STEP 5: Create MachineAssignments ────────────────────────────────
      // Resolve every replacement before deleting anything; unresolved PI
      // rolls back draft creation and backup as well.
      const deleteResult = await tx.machineAssignment.deleteMany({
        where: { id: { in: idsToDelete } },
      })
      const assignmentRows = safeAssignments
        .filter(a => piToId.has(a.piNumber.toLowerCase()))
        .map(a => ({
          machineId: a.machineId,
          orderId:   piToId.get(a.piNumber.toLowerCase())!,
          startDate: new Date(a.startDate),
          endDate:   new Date(a.endDate),
          isPlaceholder: draftOrderIds.has(piToId.get(a.piNumber.toLowerCase())!),
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
        preserved: protectedAssignments.length,
        preservedConflict,
        skippedProtected,
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
      needsManualAssignment: body.ambiguousPiNumbers ?? [],
      message: `Import thành công: tạo ${result.created} lịch, giữ nguyên ${result.preserved} lịch có sản lượng và ${result.preservedConflict} lịch cũ thuộc phần xung đột, bỏ qua ${result.skippedProtected.length} lịch mới xung đột; tạo ${result.draftsCreated} đơn nháp, cập nhật ${result.specsUpserted} thông số máy.`,
    })
  } catch (err) {
    if (err instanceof ScheduleConflict) {
      return NextResponse.json({ success: false, code: err.code, error: err.message }, { status: 409 })
    }
    console.error('[POST /api/schedule/import/confirm]', err)
    const msg = err instanceof Error ? err.message : 'Lỗi server khi import.'
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}

class ScheduleConflict extends Error {
  constructor(public code: string, message: string) { super(message) }
}
