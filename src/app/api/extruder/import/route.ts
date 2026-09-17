// src/app/api/extruder/import/route.ts
// POST /api/extruder/import
// Preview-only: parse the EXTRUDER report file, return summary.
// Does NOT write to DB. User reviews then calls /api/extruder/import/confirm.

import { NextRequest, NextResponse } from 'next/server'
import { parseExtruderReport, type ExtruderRow } from '@/lib/excel/parseExtruderReport'

const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20 MB

export async function POST(req: NextRequest) {
  // ── 1. Parse multipart ─────────────────────────────────────────────────────
  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ success: false, error: 'Không đọc được form data.' }, { status: 400 })
  }

  const file = formData.get('file')
  if (!(file instanceof Blob)) {
    return NextResponse.json({ success: false, error: 'Chưa tải file lên.' }, { status: 400 })
  }

  const fileName = file instanceof File ? file.name : 'upload'
  if (!fileName.toLowerCase().endsWith('.xlsx')) {
    return NextResponse.json({ success: false, error: 'Chỉ chấp nhận file .xlsx.' }, { status: 422 })
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ success: false, error: 'File phải nhỏ hơn 20 MB.' }, { status: 422 })
  }

  // ── 2. Parse ───────────────────────────────────────────────────────────────
  let parsed: ExtruderRow[]
  try {
    const buf = Buffer.from(await file.arrayBuffer())
    parsed = parseExtruderReport(buf)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Lỗi đọc file Excel.'
    return NextResponse.json({ success: false, error: msg }, { status: 422 })
  }

  if (parsed.length === 0) {
    return NextResponse.json(
      { success: false, error: 'Không tìm thấy dữ liệu Extruder trong file. Kiểm tra sheet tên "EXTRUDER".' },
      { status: 422 }
    )
  }

  // ── 3. Build preview summary ───────────────────────────────────────────────
  const dateSet = new Set<string>()
  const machineSet = new Set<string>()
  let totalWeight = 0

  for (const r of parsed) {
    dateSet.add(r.reportDate.toISOString().slice(0, 10))
    machineSet.add(r.machineId)
    totalWeight += r.weightKgs
  }

  const dates    = Array.from(dateSet).sort()
  const machines = Array.from(machineSet).sort()

  return NextResponse.json({
    success:      true,
    totalRecords: parsed.length,
    dates,          // ["2026-07-20", "2026-07-21"]
    machines,       // ["EXT-01", "EXT-02"]
    totalWeightKgs: Math.round(totalWeight * 100) / 100,
    // Return parsed rows for confirm step (client stores in state)
    rows: parsed.map(r => ({
      ...r,
      reportDate: r.reportDate.toISOString(), // serialize Date for JSON
    })),
  })
}
