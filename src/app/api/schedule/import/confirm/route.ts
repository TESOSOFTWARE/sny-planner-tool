// src/app/api/schedule/import/confirm/route.ts
// POST /api/schedule/import/confirm
// Re-parses the source upload and validates preview/catalogue before the atomic transaction:
//   1. Backup deleted assignments → ScheduleImportLog
//   2. Replace assignments in the acknowledged month (+ optional borderline)
//   3. Resolve approved first-line links and create RESERVED placeholders
//   4. Create MachineAssignments for all valid PI
//   5. Update changed MachineSpec widths only with explicit opt-in
// Any failure → full rollback, nothing is written.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { parseScheduleReport } from '@/lib/excel/parseScheduleReport'
import { buildScheduleImportPlan, schedulePlanSnapshot } from '@/lib/schedule/importPlan'
import { getSchedulePeriodConfirmation, schedulePeriodKey } from '@/lib/schedule/importPeriod'
import { outputFallsWithinSchedule, resolveScheduleReplacement, scheduleOutputBounds } from '@/lib/schedule/importSafety'

export const maxDuration = 60  // Large transaction may take time

interface ConfirmDecisions {
  updateMachineSpecs?: boolean
  deleteBorderline: boolean
  acknowledgedPeriod?: string
  assignmentSnapshot: { id: string; orderId: string; updatedAt: string }[]
}
export async function POST(req: NextRequest) {
  let form: FormData, body: ConfirmDecisions
  try {
    form = await req.formData()
    body = JSON.parse(String(form.get('decisions') ?? ''))
  } catch {
    return NextResponse.json({success: false, error: 'Gửi file và lựa chọn xác nhận hợp lệ.'}, {status: 422})
  }
  const file = form.get('file'), sheetName = String(form.get('sheetName') ?? ''), expectedSnapshot = String(form.get('expectedSnapshot') ?? '')
  if (!(file instanceof Blob) || !(file instanceof File) || !file.name.toLowerCase().endsWith('.xlsx') || file.size > 20 * 1024 * 1024 || !sheetName.trim()) {
    return NextResponse.json({success: false, error: 'File .xlsx hoặc sheet không hợp lệ (tối đa 20 MB).'}, {status: 422})
  }
  if (!body || typeof body.deleteBorderline !== 'boolean' || (body.updateMachineSpecs !== undefined && typeof body.updateMachineSpecs !== 'boolean') ||
      !Array.isArray(body.assignmentSnapshot) || body.assignmentSnapshot.some(row => !row || typeof row.id !== 'string' || typeof row.orderId !== 'string' || typeof row.updatedAt !== 'string') || !/^[a-f0-9]{64}$/.test(expectedSnapshot)) {
    return NextResponse.json({success: false, error: 'Lựa chọn xác nhận không hợp lệ.'}, {status: 400})
  }
  const buffer = Buffer.from(await file.arrayBuffer())
  let parsed
  try { parsed = parseScheduleReport(buffer, sheetName) } catch (error) {
    return NextResponse.json({success: false, error: error instanceof Error ? error.message : 'Không đọc được file Excel.'}, {status: 422})
  }
  const periodConfirmation = getSchedulePeriodConfirmation(parsed)
  if (periodConfirmation && body.acknowledgedPeriod !== schedulePeriodKey(periodConfirmation.importPeriod)) {
    return NextResponse.json({success: false, error: 'Kỳ trong tên sheet khác tiêu đề bên trong. Vui lòng xem trước và xác nhận kỳ.', periodConfirmation}, {status: 422})
  }
  const {machineSpecs, year, month} = parsed
  const {deleteBorderline} = body
  try {
    const result = await prisma.$transaction(async (tx) => {
    // Block concurrent schedule edits and output writes until the replacement
    // commits. Table locks also cover new rows, unlike locking existing IDs.
    await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '5s'")
    await tx.$executeRawUnsafe('LOCK TABLE "production_orders", "machine_assignments", "knitting_daily_output" IN SHARE ROW EXCLUSIVE MODE')
    const catalogue = await tx.productionOrder.findMany({select: {id: true, piNumber: true, subLineIndex: true, isPlaceholder: true}})
    if (schedulePlanSnapshot(buffer, parsed.sheetName, catalogue) !== expectedSnapshot) {
      throw new ScheduleConflict('STALE_ORDER_CATALOGUE', 'Dữ liệu đơn đã thay đổi, xem trước lại.')
    }
    const plan = buildScheduleImportPlan(parsed, catalogue)
    const {toCreateAssignments} = plan
    const summary = {assignmentsToCreate: toCreateAssignments.length, draftsToCreate: plan.toCreateDraftOrders.length, ambiguousCount: plan.needsManual.length, invalidCount: plan.invalidCellCount}
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

      // ── STEP 4: Build piNumber → orderId map ──────────────────────────────
      const piToId = new Map<string, string>()

      const existingPiNumbers = Array.from(
        new Set(
          safeAssignments
            .map(a => a.piNumber)
        )
      )

      const safeDrafts = plan.toCreateDraftOrders.filter(draft => existingPiNumbers.includes(draft.piNumber))
      const createdDrafts = safeDrafts.length > 0 ? await tx.productionOrder.createManyAndReturn({
        data: safeDrafts.map(draft => ({piNumber: draft.piNumber, customer: 'Chưa xác định (import từ lịch máy)', isDraft: false, lifecycleStatus: 'RESERVED', isPlaceholder: true, dataSource: 'import', subLineIndex: 0, orderDate: new Date()})),
        select: {id: true, piNumber: true},
      }) : []
      for (const assignment of safeAssignments) {
        const existing = toCreateAssignments.find(row => row.piNumber === assignment.piNumber)?.orderId
        const orderId = existing ?? createdDrafts.find(row => row.piNumber === assignment.piNumber)?.id
        if (!orderId) throw new ScheduleConflict('UNRESOLVED_SCHEDULE_PI', `PI ${assignment.piNumber} chưa liên kết được. Vui lòng xem trước lại.`)
        piToId.set(assignment.piNumber.toLowerCase(), orderId)
      }

      const draftOrderIds = new Set<string>(createdDrafts.map(row => row.id))
      for (const row of (
        (await tx.productionOrder.findMany({
          where: {
            id: { in: Array.from(piToId.values()) },
            OR: [
              { isDraft: true },
              { lifecycleStatus: 'RESERVED' },
              { lifecycleStatus: 'RESERVE' },
              { lifecycleStatus: 'PLACEHOLDER' },
              { isPlaceholder: true },
            ],
          },
          select: { id: true },
        })))) draftOrderIds.add(row.id)

      // Promote any pure DRAFT orders to RESERVED so they match AC-03 / AC-04 guard
      if (draftOrderIds.size > 0) {
        await tx.productionOrder.updateMany({
          where: { id: { in: Array.from(draftOrderIds) }, lifecycleStatus: 'DRAFT' },
          data: { lifecycleStatus: 'RESERVED', isPlaceholder: true, isDraft: false },
        })
      }

      // ── STEP 5: Create MachineAssignments ────────────────────────────────
      // Resolve every replacement before deleting anything; unresolved PI rolls back the backup.
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
          endDateSource: "IMPORTED" as const,
          isPlaceholder: draftOrderIds.has(piToId.get(a.piNumber.toLowerCase())!),
        }))

      const createResult = await tx.machineAssignment.createMany({
        data: assignmentRows,
      })

      // Count every superseded placeholder separately, including other months
      // and assignments retained because output protects them. Nothing is moved
      // outside this import and no placeholder order is deleted.
      const remainingGroups = plan.supersededDrafts.length > 0 ? await tx.machineAssignment.groupBy({
        by: ['orderId'],
        where: {orderId: {in: plan.supersededDrafts.map(draft => draft.draftOrderId)}},
        _count: true,
      }) : []
      const remainingById = new Map(remainingGroups.map(group => [group.orderId, group._count]))
      const supersededDrafts = plan.supersededDrafts.map(draft => ({
        draftOrderId: draft.draftOrderId,
        draftPiNumber: draft.draftPiNumber,
        realPiNumber: draft.realPiNumber,
        movedCount: safeAssignments.filter(row => row.piNumber === draft.realPiNumber).length,
        remainingAssignments: remainingById.get(draft.draftOrderId) ?? 0,
      }))

      // Widths are independent of scheduling: preserve them unless explicitly selected.
      let specsUpserted = 0
      if (body.updateMachineSpecs === true && machineSpecs.length > 0) {
        const storedSpecs = await tx.machineSpec.findMany({ where: { machineId: { in: machineSpecs.map(spec => spec.machineId) } }, select: { machineId: true, widthM: true } })
        const widths = new Map(storedSpecs.map(spec => [spec.machineId, Number(spec.widthM)]))
        for (const spec of machineSpecs) {
          if (widths.get(spec.machineId) === spec.widthM) continue
          await tx.machineSpec.upsert({ where: { machineId: spec.machineId }, create: spec, update: { widthM: spec.widthM } })
          specsUpserted++
        }
      }

      return {
        preserved: protectedAssignments.length,
        preservedConflict,
        skippedProtected,
        deleted:       deleteResult.count,
        created:       createResult.count,
        draftsCreated: createdDrafts.length,
        supersededDrafts,
        firstLineLinked: plan.firstLineLinks.filter(link => existingPiNumbers.includes(link.piNumber)).map(link => ({...link, cellCount: safeAssignments.filter(row => row.piNumber === link.piNumber).length})),
        draftOrdersCreated: safeDrafts.map(draft => ({...draft, cellCount: safeAssignments.filter(row => row.piNumber === draft.piNumber).length, orderId: createdDrafts.find(row => row.piNumber === draft.piNumber)!.id})),
        needsManual: plan.needsManual,
        specsUpserted,
        piUnresolved:  toCreateAssignments.filter(
          a => !piToId.has(a.piNumber.toLowerCase())
        ).length,
      }
    }, { timeout: 30_000 })

    return NextResponse.json({
      success: true,
      imported: result,
      needsManualAssignment: result.needsManual,
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
