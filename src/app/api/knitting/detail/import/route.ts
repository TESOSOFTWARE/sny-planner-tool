// src/app/api/knitting/detail/import/route.ts
// POST /api/knitting/detail/import
// Preview-only: parse the KNITTING sheet for detail data, return summary.
// Does NOT write to DB. User reviews then calls /api/knitting/detail/import/confirm.

import { NextRequest, NextResponse } from 'next/server'
import { parseKnittingDetailReport, type KnittingDetailRow } from '@/lib/excel/parseKnittingDetailReport'

const MAX_FILE_SIZE = 25 * 1024 * 1024 // 25 MB

export async function POST(req: NextRequest) {
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
    return NextResponse.json({ success: false, error: 'File phải nhỏ hơn 25 MB.' }, { status: 422 })
  }

  let parsed: KnittingDetailRow[]
  try {
    const buf = Buffer.from(await file.arrayBuffer())
    parsed = parseKnittingDetailReport(buf)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Lỗi đọc file Excel.'
    return NextResponse.json({ success: false, error: msg }, { status: 422 })
  }

  if (parsed.length === 0) {
    return NextResponse.json(
      { success: false, error: 'Không tìm thấy dữ liệu Knitting Detail trong file. Kiểm tra sheet tên "KNITTING".' },
      { status: 422 }
    )
  }

  const dateSet = new Set<string>()
  const machineSet = new Set<string>()
  let totalWeight = 0
  let totalMeters = 0

  for (const r of parsed) {
    dateSet.add(r.reportDate.toISOString().slice(0, 10))
    machineSet.add(r.machineId)
    totalWeight += r.weightKgs
    if (r.lengthM) totalMeters += r.lengthM
  }

  const dates    = Array.from(dateSet).sort()
  const machines = Array.from(machineSet).sort()

  return NextResponse.json({
    success:        true,
    totalRecords:   parsed.length,
    dates,          // ["2026-07-20", "2026-07-21"]
    machines,       // ["M-001", "M-002", ...]
    totalWeightKgs: Math.round(totalWeight * 100) / 100,
    totalMeters:    Math.round(totalMeters * 100) / 100,
    rows: parsed.map(r => ({
      ...r,
      reportDate: r.reportDate.toISOString(),
    })),
  })
}
