// src/app/api/schedule/import/route.ts
// POST /api/schedule/import
// Accepts .xlsx upload + sheetName, parses with parseScheduleReport,
// queries DB to determine what to delete / create, returns preview payload.
// DOES NOT WRITE to DB — preview only.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { parseScheduleReport } from '@/lib/excel/parseScheduleReport'

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

  const sheetName = formData.get('sheetName')?.toString() ?? '20.7.2026'

  const fileName = file instanceof File ? file.name : 'upload'
  if (!fileName.toLowerCase().endsWith('.xlsx')) {
    return NextResponse.json({ success: false, error: 'Chỉ chấp nhận file .xlsx.' }, { status: 422 })
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ success: false, error: 'File phải nhỏ hơn 20 MB.' }, { status: 422 })
  }

  // ── 2. Parse Excel ────────────────────────────────────────────────────────
  let parsed
  try {
    const buf = Buffer.from(await file.arrayBuffer())
    parsed = parseScheduleReport(buf, sheetName)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Lỗi đọc file Excel.'
    return NextResponse.json({ success: false, error: msg }, { status: 422 })
  }

  const { assignments, machineSpecs, year, month, daysInMonth, availableSheets } = parsed

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

  // Separate borderline (starts before month) vs fully-within
  const borderlineRaw = existingAssignments.filter(a => a.startDate < startOfMonth)
  const toDeleteRaw   = existingAssignments.filter(a => a.startDate >= startOfMonth)

  const toDelete = toDeleteRaw.map(a => ({
    id:        a.id,
    machineId: a.machineId,
    piNumber:  a.order.piNumber,
    startDate: a.startDate.toISOString(),
    endDate:   a.endDate.toISOString(),
  }))

  const borderlineAssignment = borderlineRaw.length > 0
    ? {
        id:        borderlineRaw[0].id,
        machineId: borderlineRaw[0].machineId,
        piNumber:  borderlineRaw[0].order.piNumber,
        startDate: borderlineRaw[0].startDate.toISOString(),
        endDate:   borderlineRaw[0].endDate.toISOString(),
      }
    : null

  // ── 5. Collect PI numbers from file ───────────────────────────────────────
  const skippedInvalid:   string[] = []
  const skippedAmbiguous: string[] = []
  const validPiSet = new Set<string>()  // PI numbers that will get assignments

  for (const a of assignments) {
    if (a.isInvalid) {
      if (a.rawValue && !skippedInvalid.includes(a.rawValue)) {
        skippedInvalid.push(a.rawValue)
      }
      continue
    }
    if (a.isAmbiguous) {
      for (const pi of a.piNumbers) {
        if (!skippedAmbiguous.includes(pi)) skippedAmbiguous.push(pi)
      }
      continue
    }
    for (const pi of a.piNumbers) validPiSet.add(pi)
  }

  // ── 6. DB lookup: which PI numbers already exist? ─────────────────────────
  // Use case-insensitive matching (Cvellis26-2 in file ↔ CVellis26-2 in DB)
  const allValidPiList = Array.from(validPiSet)
  const dbOrders = await prisma.productionOrder.findMany({
    select: { id: true, piNumber: true, subLineIndex: true },
  })

  // Build case-insensitive map: lowercase → records
  const dbPiMap = new Map<string, { id: string; piNumber: string; subLineIndex: number }[]>()
  for (const o of dbOrders) {
    const key = o.piNumber.toLowerCase()
    if (!dbPiMap.has(key)) dbPiMap.set(key, [])
    dbPiMap.get(key)!.push(o)
  }

  const toCreateDraftOrders: string[] = []  // PI not in DB → create draft
  // PI already in DB with single sub-line → will be linked directly (no new draft needed)

  for (const pi of allValidPiList) {
    const existing = dbPiMap.get(pi.toLowerCase())
    if (!existing || existing.length === 0) {
      toCreateDraftOrders.push(pi)
    }
    // existing.length === 1 → will link to existing order in confirm step
    // existing.length > 1  → would be in skippedAmbiguous (already handled above)
  }

  // ── 7. Build assignments to create ───────────────────────────────────────
  const toCreateAssignments: Array<{
    machineId: string
    piNumber:  string
    startDate: string
    endDate:   string
  }> = []

  for (const a of assignments) {
    if (a.isInvalid || a.isAmbiguous) continue
    for (const pi of a.piNumbers) {
      toCreateAssignments.push({
        machineId: a.machineId,
        piNumber:  pi,
        startDate: a.startDate,
        endDate:   a.endDate,
      })
    }
  }

  // ── 8. Return preview payload ─────────────────────────────────────────────
  return NextResponse.json({
    success: true,
    availableSheets,
    sheetName,
    year,
    month,
    daysInMonth,
    toDelete,
    borderlineAssignment,
    toCreateDraftOrders,
    toCreateAssignments,
    machineSpecs,
    skippedAmbiguous,
    skippedInvalid,
    summary: {
      deleteCount:         toDelete.length,
      borderlineCount:     borderlineRaw.length,
      assignmentsToCreate: toCreateAssignments.length,
      draftsToCreate:      toCreateDraftOrders.length,
      ambiguousCount:      skippedAmbiguous.length,
      invalidCount:        skippedInvalid.length,
    },
  })
}
