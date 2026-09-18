// src/app/api/knitting/import/confirm/route.ts
// POST /api/knitting/import/confirm
// Accepts the same .xlsx file, reads dailyMeters directly from col I (index 8)
// of each TOTAL row — this is already the daily output, no delta needed.
// Upserts KnittingDailyOutput records (idempotent re-upload).

import { NextRequest, NextResponse } from 'next/server'
import { parseKnittingReport } from '@/lib/excel/parseKnittingReport'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'

const MAX_FILE_SIZE = 20 * 1024 * 1024

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
  let parsed
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

  // ── 3. Upsert each record ──────────────────────────────────────────────────
  // dailyMeters comes directly from col I (index 8) — already daily output.
  // cumulativeMeters stored = same value (field kept for schema audit trail;
  // no longer meaningful as a "cumulative" since source data is already daily).
  let importedCount = 0
  let updatedCount = 0
  const datesImported = new Set<string>()

  for (const record of parsed) {
    const { machineId, reportDate, dailyMeters } = record

    const meters = new Prisma.Decimal(Math.max(0, dailyMeters).toFixed(2))

    const existing = await prisma.knittingDailyOutput.findUnique({
      where: { machineId_reportDate: { machineId, reportDate } },
    })

    await prisma.knittingDailyOutput.upsert({
      where: { machineId_reportDate: { machineId, reportDate } },
      create: {
        machineId,
        reportDate,
        dailyMeters:      meters,
        cumulativeMeters: meters, // same value — stored for schema compatibility
      },
      update: {
        dailyMeters:      meters,
        cumulativeMeters: meters,
      },
    })

    if (existing) {
      updatedCount++
    } else {
      importedCount++
    }

    datesImported.add(reportDate.toISOString().slice(0, 10))
  }

  return NextResponse.json({
    success: true,
    imported: importedCount,
    updated: updatedCount,
    dates: Array.from(datesImported).sort(),
  })
}
