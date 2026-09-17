// src/app/api/knitting/import/route.ts
// POST /api/knitting/import
// Preview-only: parse the KNITTING report file, return dates + machine count.
// Does NOT write to DB. User reviews then calls /api/knitting/import/confirm.

import { NextRequest, NextResponse } from 'next/server'
import { parseKnittingReport, type KnittingDayData } from '@/lib/excel/parseKnittingReport'

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
  let parsed: KnittingDayData[]
  try {
    const buf = Buffer.from(await file.arrayBuffer())
    parsed = parseKnittingReport(buf)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Lỗi đọc file Excel.'
    return NextResponse.json({ success: false, error: msg }, { status: 422 })
  }

  if (parsed.length === 0) {
    return NextResponse.json(
      { success: false, error: 'Không tìm thấy dữ liệu KNITTING trong file.' },
      { status: 422 }
    )
  }

  // ── 3. Build preview summary ───────────────────────────────────────────────
  // Unique dates in the file
  const dateSet = new Set<string>()
  for (const d of parsed) {
    dateSet.add(d.reportDate.toISOString().slice(0, 10))
  }
  const dates = Array.from(dateSet).sort()

  // Machines with non-zero output per date
  const machineCount = new Set(parsed.map((d) => d.machineId)).size

  return NextResponse.json({
    success: true,
    totalRecords: parsed.length,
    dates,               // ["2026-04-28", "2026-04-29"]
    machineCount,        // 40 (or fewer if some machines missing from file)
  })
}
