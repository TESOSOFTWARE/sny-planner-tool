// src/app/api/schedule/import/route.ts
// POST /api/schedule/import
// Accepts .xlsx upload + sheetName, parses with parseScheduleReport,
// queries DB to determine what to delete / create, returns preview payload.
// DOES NOT WRITE to DB — preview only.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { outputFallsWithinSchedule, scheduleOutputBounds } from '@/lib/schedule/importSafety'
import { buildScheduleImportPlan, schedulePlanSnapshot } from '@/lib/schedule/importPlan'
import { parseScheduleReport } from '@/lib/excel/parseScheduleReport'
import { getSchedulePeriodConfirmation, schedulePeriodKey } from '@/lib/schedule/importPeriod'
import { loadFactoryCalendar } from '@/lib/schedule/factoryCalendar'
import { isWorkingDay } from '@/lib/schedule/productionDuration'

export const maxDuration = 30

const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20 MB

export async function POST(req: NextRequest) {
  // ── 1. Parse multipart ────────────────────────────────────────────────────
  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ success: false, error: 'Không đọc được form data.' }, { status: 400 })
  }

  const file = formData.get('file')
  if (!(file instanceof Blob)) {
    return NextResponse.json({ success: false, error: 'Chưa tải file lên. Gửi file trong field "file".' }, { status: 400 })
  }

  const sheetName = formData.get('sheetName')?.toString() ?? ''
  if (!sheetName.trim()) {
    return NextResponse.json({ success: false, error: 'Vui lòng chọn một sheet trong file Excel.' }, { status: 400 })
  }

  const fileName = file instanceof File ? file.name : 'upload'
  if (!fileName.toLowerCase().endsWith('.xlsx')) {
    return NextResponse.json({ success: false, error: 'Chỉ chấp nhận file .xlsx.' }, { status: 422 })
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ success: false, error: 'File phải nhỏ hơn 20 MB.' }, { status: 422 })
  }

  // ── 2. Parse Excel ────────────────────────────────────────────────────────
  let parsed
  let buf: Buffer
  try {
    buf = Buffer.from(await file.arrayBuffer())
    parsed = parseScheduleReport(buf, sheetName)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Lỗi đọc file Excel.'
    return NextResponse.json({ success: false, error: msg }, { status: 422 })
  }

  const periodConfirmation = getSchedulePeriodConfirmation(parsed)
  if (periodConfirmation && formData.get('acknowledgedPeriod') !== schedulePeriodKey(periodConfirmation.importPeriod)) {
    return NextResponse.json({
      success: false,
      error: 'Kỳ trong tên sheet khác tiêu đề bên trong. Vui lòng kiểm tra và xác nhận kỳ muốn import.',
      periodConfirmation,
    }, { status: 422 })
  }

  const dbOrders = await prisma.productionOrder.findMany({ select: { id: true, piNumber: true, subLineIndex: true, isPlaceholder: true } })
  const plan = buildScheduleImportPlan(parsed, dbOrders)

  const { assignments, machineSpecs, year, month, daysInMonth, availableSheets, sheetTitle, titlePeriod } = parsed

  // ── 3. Build month overlap filter ─────────────────────────────────────────
  // Use Vietnam timezone for start/end of month boundaries
  const monthStr   = String(month).padStart(2, '0')
  const lastDayStr = String(daysInMonth).padStart(2, '0')
  const startOfMonth = new Date(`${year}-${monthStr}-01T00:00:00+07:00`)
  const endOfMonth   = new Date(`${year}-${monthStr}-${lastDayStr}T23:59:59+07:00`)

  // ── 4. Query existing MachineAssignment overlapping this month ────────────
  const existingAssignments = await prisma.machineAssignment.findMany({
    where: {
      startDate: { lte: endOfMonth },
      endDate:   { gte: startOfMonth },
    },
    include: {
      order: { select: { piNumber: true } },
    },
    orderBy: { startDate: 'asc' },
  })

  // A schedule refresh must never silently remove a machine assignment that
  // already has knitted output attached to it.  Include this signal in the
  // preview so the user can resolve it before confirming the import.
  const assignmentMachineIds = Array.from(new Set(existingAssignments.map(a => a.machineId)))
  const outputBounds = existingAssignments.map((assignment) => scheduleOutputBounds(assignment))
  const outputStart = outputBounds.length > 0
    ? new Date(Math.min(...outputBounds.map(bounds => bounds.gte.getTime())))
    : null
  const outputEnd = outputBounds.length > 0
    ? new Date(Math.max(...outputBounds.map(bounds => bounds.lte.getTime())))
    : null
  const outputRows = assignmentMachineIds.length > 0
    ? await prisma.knittingDailyOutput.findMany({
        where: {
          machineId: { in: assignmentMachineIds },
          dailyMeters: { gt: 0 },
          ...(outputStart && outputEnd ? { reportDate: { gte: outputStart, lte: outputEnd } } : {}),
        },
        select: { machineId: true, reportDate: true, dailyMeters: true },
      })
    : []
  const outputByMachine = new Map<string, { date: Date; meters: number }[]>()
  for (const row of outputRows) {
    const list = outputByMachine.get(row.machineId) ?? []
    list.push({ date: row.reportDate, meters: Number(row.dailyMeters) })
    outputByMachine.set(row.machineId, list)
  }
  const productionFor = (assignment: { machineId: string; startDate: Date; endDate: Date }) =>
    (outputByMachine.get(assignment.machineId) ?? [])
      .filter(row => outputFallsWithinSchedule(row.date, assignment))
      .reduce((sum, row) => sum + row.meters, 0)

  // Separate borderline (starts before month) vs fully-within
  const borderlineRaw = existingAssignments.filter(a => a.startDate < startOfMonth)
  const toDeleteRaw   = existingAssignments.filter(a => a.startDate >= startOfMonth)

  const toDelete = toDeleteRaw.map(a => ({
    id:        a.id,
    machineId: a.machineId,
    piNumber:  a.order.piNumber,
    startDate: a.startDate.toISOString(),
    endDate:   a.endDate.toISOString(),
    productionMeters: productionFor(a),
  }))

  const borderlineAssignments = borderlineRaw.map(a => ({
        id:        a.id,
        machineId: a.machineId,
        piNumber:  a.order.piNumber,
        startDate: a.startDate.toISOString(),
        endDate:   a.endDate.toISOString(),
        productionMeters: productionFor(a),
      }))

  const { toCreateDraftOrders, toCreateAssignments, skippedInvalid, firstLineLinks, needsManual } = plan
  const skippedAmbiguous = needsManual.map(row => row.rawValue)

  const storedSpecs = machineSpecs.length > 0
    ? await prisma.machineSpec.findMany({ where: { machineId: { in: machineSpecs.map(spec => spec.machineId) } }, select: { machineId: true, widthM: true } })
    : []
  const widths = new Map(storedSpecs.map(spec => [spec.machineId, Number(spec.widthM)]))
  const specChanges = machineSpecs.filter(spec => widths.get(spec.machineId) !== spec.widthM)
    .map(spec => ({ machineId: spec.machineId, oldWidthM: widths.get(spec.machineId) ?? null, newWidthM: spec.widthM }))

  // ── 8. Return preview payload ─────────────────────────────────────────────
  const calendar = parsed.yellowDayDates.length > 0
    ? await loadFactoryCalendar(prisma, `${year}-${monthStr}-01`, `${year}-${monthStr}-${lastDayStr}`)
    : null
  const yellowDaySuggestions = parsed.yellowDayDates.map(date => ({
    date,
    matches: calendar ? isWorkingDay(calendar, date) === false : false,
    hasException: Object.prototype.hasOwnProperty.call(calendar?.workingDateOverrides ?? {}, date),
  }))
  return NextResponse.json({
    success: true,
    availableSheets,
    sheetName: parsed.sheetName,
    sheetTitle,
    titlePeriod,
    year,
    month,
    daysInMonth,
    yellowDaySuggestions,
    assignmentSnapshot: existingAssignments.map(a => ({ id: a.id, orderId: a.orderId, updatedAt: a.updatedAt.toISOString() })),
    toDelete,
    borderlineAssignments,
    // Kept for old clients; new clients use the complete list above.
    borderlineAssignment: borderlineAssignments[0] ?? null,
    planSnapshot: schedulePlanSnapshot(buf, parsed.sheetName, dbOrders),
    firstLineLinks,
    supersededDrafts: plan.supersededDrafts,
    needsManual,
    toCreateDraftOrders,
    toCreateAssignments,
    machineSpecs,
    specChanges,
    skippedAmbiguous,
    skippedInvalid,
    summary: {
      singleCount: plan.singleCount,
      multiCount: plan.multiCount,
      draftCellCount: plan.draftCellCount,
      manualCount: needsManual.length,
      deleteCount:         toDelete.length,
      borderlineCount:     borderlineAssignments.length,
      protectedCount:      [...toDelete, ...borderlineAssignments].filter(a => a.productionMeters > 0).length,
      assignmentsToCreate: toCreateAssignments.length,
      draftsToCreate:      toCreateDraftOrders.length,
      ambiguousCount:      skippedAmbiguous.length,
      invalidCount:        plan.invalidCellCount,
    },
  })
}
