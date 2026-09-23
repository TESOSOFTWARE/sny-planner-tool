import { createHash } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { parsePackingReport } from '@/lib/excel/parsePackingReport'
import type { PackingDecision } from '@/types'

const MAX_FILE_BYTES = 10 * 1024 * 1024

type PackingFields = {
  qtyDay: number | null
  totalMDay: number | null
  weightDay: number | null
  qtyNight: number | null
  totalMNight: number | null
  weightNight: number | null
}

function canonicalMetric(value: number | null, integer: boolean): string | null {
  if (value == null) return null
  if (integer) return String(value)
  return Number(Math.round((value + Number.EPSILON) * 100) / 100).toString()
}

function canonicalFields(value: PackingFields) {
  return {
    qtyDay: canonicalMetric(value.qtyDay, true),
    totalMDay: canonicalMetric(value.totalMDay, false),
    weightDay: canonicalMetric(value.weightDay, false),
    qtyNight: canonicalMetric(value.qtyNight, true),
    totalMNight: canonicalMetric(value.totalMNight, false),
    weightNight: canonicalMetric(value.weightNight, false),
  }
}

function fieldsFromDb(value: {
  qtyDay: unknown
  totalMDay: unknown
  weightDay: unknown
  qtyNight: unknown
  totalMNight: unknown
  weightNight: unknown
}): PackingFields {
  return {
    qtyDay: value.qtyDay == null ? null : Number(value.qtyDay),
    totalMDay: value.totalMDay == null ? null : Number(value.totalMDay),
    weightDay: value.weightDay == null ? null : Number(value.weightDay),
    qtyNight: value.qtyNight == null ? null : Number(value.qtyNight),
    totalMNight: value.totalMNight == null ? null : Number(value.totalMNight),
    weightNight: value.weightNight == null ? null : Number(value.weightNight),
  }
}

function sameFields(a: PackingFields, b: PackingFields): boolean {
  return JSON.stringify(canonicalFields(a)) === JSON.stringify(canonicalFields(b))
}

function changedFields(a: PackingFields, b: PackingFields): string[] {
  const left = canonicalFields(a)
  const right = canonicalFields(b)
  return (Object.keys(left) as Array<keyof PackingFields>).filter((key) => left[key] !== right[key])
}

function hashSnapshot(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

export async function POST(req: NextRequest) {
  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ success: false, code: 'INVALID_INPUT', error: 'Form upload không hợp lệ.' }, { status: 400 })
  }
  const file = formData.get('file') as File | null
  if (!file) {
    return NextResponse.json({ success: false, error: 'Chưa chọn file Excel' }, { status: 400 })
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ success: false, code: 'INVALID_INPUT', error: 'File Excel vượt quá giới hạn 10 MB.' }, { status: 422 })
  }

  let parseResult
  try {
    const arrayBuffer = await file.arrayBuffer()
    parseResult = parsePackingReport(Buffer.from(arrayBuffer), file.name)
    if (parseResult.outputs.length === 0) {
      return NextResponse.json({ success: false, code: 'INVALID_INPUT', error: 'Không có ngày sản lượng hợp lệ trong file.' }, { status: 422 })
    }
  } catch (error) {
    return NextResponse.json(
      { success: false, code: 'INVALID_INPUT', error: error instanceof Error ? error.message : 'Lỗi khi đọc file Báo cáo Đóng gói Excel' },
      { status: 422 },
    )
  }

  try {
    const dates = parseResult.outputs.map((output) => output.date).sort()
    const existing = await prisma.packingDailyOutput.findMany({
      where: { date: { in: dates.map((date) => new Date(`${date}T00:00:00.000Z`)) } },
      orderBy: { date: 'asc' },
    })
    const existingByDate = new Map(existing.map((row) => [row.date.toISOString().slice(0, 10), row]))
    const decisions: PackingDecision[] = parseResult.outputs.map((output) => {
      const current = existingByDate.get(output.date)
      if (!current) return { date: output.date, status: 'new', changedFields: [] }
      const incoming: PackingFields = output
      const stored = fieldsFromDb(current)
      if (sameFields(incoming, stored)) return { date: output.date, status: 'identical', changedFields: [] }
      return { date: output.date, status: 'replace', changedFields: changedFields(incoming, stored) }
    })
    const state = dates.map((date) => {
      const row = existingByDate.get(date)
      return {
        date,
        existing: row
          ? {
              id: row.id,
              date: row.date.toISOString().slice(0, 10),
              ...canonicalFields(fieldsFromDb(row)),
            }
          : null,
      }
    })
    const expectedSnapshot = hashSnapshot({ dates, state })

    return NextResponse.json({
      success: true,
      outputs: parseResult.outputs,
      totalRowsParsed: parseResult.totalRowsParsed,
      fileName: parseResult.fileName,
      availableSheets: parseResult.availableSheets,
      expectedSnapshot,
      decisions,
    })
  } catch (error) {
    console.error('Error previewing packing report:', error)
    return NextResponse.json({ success: false, code: 'DATABASE_ERROR', error: 'Không thể tải dữ liệu Đóng gói hiện tại.' }, { status: 500 })
  }
}
