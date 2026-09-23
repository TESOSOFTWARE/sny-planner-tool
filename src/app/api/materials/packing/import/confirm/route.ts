import { createHash } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import type { PackingDecision } from '@/types'

const bodySchema = z.object({
  outputs: z.array(z.unknown()).min(1).max(366),
  fileName: z.string(),
  expectedSnapshot: z.string().min(1),
  replaceDates: z.array(z.string()),
})

type PackingFields = {
  qtyDay: number | null
  totalMDay: number | null
  weightDay: number | null
  qtyNight: number | null
  totalMNight: number | null
  weightNight: number | null
}

type NormalizedOutput = PackingFields & {
  date: string
}

function dateFromParts(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    !Number.isFinite(date.getTime()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) return null
  return date.toISOString().slice(0, 10)
}

function validDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  return Boolean(match && dateFromParts(Number(match[1]), Number(match[2]), Number(match[3])))
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

function numericField(value: unknown, key: keyof PackingFields, rowIndex: number): number | null {
  if (value == null) return null
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`Dòng ${rowIndex}: ${key} phải là số không âm hữu hạn.`)
  }
  if ((key === 'qtyDay' || key === 'qtyNight') && !Number.isInteger(value)) {
    throw new Error(`Dòng ${rowIndex}: ${key} phải là số nguyên không âm.`)
  }
  return value
}

function normalizeOutputs(values: unknown[]): NormalizedOutput[] {
  const byDate = new Map<string, NormalizedOutput>()
  const keys: Array<keyof PackingFields> = [
    'qtyDay',
    'totalMDay',
    'weightDay',
    'qtyNight',
    'totalMNight',
    'weightNight',
  ]
  values.forEach((value, index) => {
    const source = value && typeof value === 'object' ? value as Record<string, unknown> : {}
    const date = typeof source.date === 'string' ? source.date : ''
    if (!validDate(date)) throw new Error(`Dòng ${index + 1}: ngày không hợp lệ.`)
    const output = { date } as NormalizedOutput
    for (const key of keys) output[key] = numericField(source[key], key, index + 1)
    const previous = byDate.get(date)
    if (previous) {
      if (!sameFields(previous, output)) throw new Error(`Ngày ${date} xuất hiện nhiều lần với số liệu khác nhau.`)
      return
    }
    byDate.set(date, output)
  })
  if (byDate.size === 0) throw new Error('Không có dữ liệu Đóng gói hợp lệ để lưu.')
  if (byDate.size > 366) throw new Error('Báo cáo Đóng gói không được vượt quá 366 ngày.')
  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date))
}

function classify(
  outputs: NormalizedOutput[],
  existing: Array<{ id: string; date: Date } & PackingFields>,
): PackingDecision[] {
  const byDate = new Map(existing.map((row) => [row.date.toISOString().slice(0, 10), row]))
  return outputs.map((output) => {
    const row = byDate.get(output.date)
    if (!row) return { date: output.date, status: 'new', changedFields: [] }
    if (sameFields(output, fieldsFromDb(row))) return { date: output.date, status: 'identical', changedFields: [] }
    return { date: output.date, status: 'replace', changedFields: changedFields(output, fieldsFromDb(row)) }
  })
}

function canonicalState(dates: string[], existing: Array<{ id: string; date: Date } & PackingFields>) {
  const byDate = new Map(existing.map((row) => [row.date.toISOString().slice(0, 10), row]))
  return dates.map((date) => {
    const row = byDate.get(date)
    return {
      date,
      existing: row
        ? { id: row.id, date: row.date.toISOString().slice(0, 10), ...canonicalFields(fieldsFromDb(row)) }
        : null,
    }
  })
}

function retryable(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && ['P2028', 'P2034'].includes(String((error as { code?: unknown }).code)))
}

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ success: false, code: 'INVALID_INPUT', error: 'JSON không hợp lệ.' }, { status: 400 })
  }
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ success: false, code: 'INVALID_INPUT', error: 'Payload Đóng gói không hợp lệ.' }, { status: 422 })
  }

  let outputs: NormalizedOutput[]
  try {
    outputs = normalizeOutputs(parsed.data.outputs)
  } catch (error) {
    return NextResponse.json({ success: false, code: 'INVALID_INPUT', error: error instanceof Error ? error.message : 'Dữ liệu Đóng gói không hợp lệ.' }, { status: 422 })
  }
  const dates = outputs.map((output) => output.date)
  const requestedReplaceDates = [...parsed.data.replaceDates].sort()
  if (new Set(requestedReplaceDates).size !== requestedReplaceDates.length) {
    return NextResponse.json({ success: false, code: 'INVALID_INPUT', error: 'Danh sách ngày thay thế bị lặp.' }, { status: 422 })
  }
  if (requestedReplaceDates.some((date) => !validDate(date))) {
    return NextResponse.json({ success: false, code: 'INVALID_INPUT', error: 'Danh sách ngày thay thế không hợp lệ.' }, { status: 422 })
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '5s'")
      await tx.$executeRawUnsafe('LOCK TABLE "packing_daily_outputs" IN SHARE ROW EXCLUSIVE MODE')
      const existing = await tx.packingDailyOutput.findMany({
        where: { date: { in: dates.map((date) => new Date(`${date}T00:00:00.000Z`)) } },
        orderBy: { date: 'asc' },
      })
      const decisions = classify(outputs, existing as Array<{ id: string; date: Date } & PackingFields>)
      const actualSnapshot = hashSnapshot({ dates, state: canonicalState(dates, existing as Array<{ id: string; date: Date } & PackingFields>) })
      const allIdentical = decisions.every((decision) => decision.status === 'identical')
      if (actualSnapshot !== parsed.data.expectedSnapshot && !allIdentical) {
        return { stale: true as const, decisions }
      }

      const requiredReplaceDates = decisions.filter((decision) => decision.status === 'replace').map((decision) => decision.date).sort()
      if (
        requestedReplaceDates.length !== requiredReplaceDates.length ||
        requestedReplaceDates.some((date, index) => date !== requiredReplaceDates[index])
      ) {
        return { replacement: true as const, decisions }
      }

      if (allIdentical) {
        return { insertedCount: 0, updatedCount: 0, unchangedCount: outputs.length, decisions }
      }

      const byDate = new Map(existing.map((row) => [row.date.toISOString().slice(0, 10), row]))
      let insertedCount = 0
      let updatedCount = 0
      let unchangedCount = 0
      for (const output of outputs) {
        const current = byDate.get(output.date)
        if (current && sameFields(output, fieldsFromDb(current))) {
          unchangedCount += 1
          continue
        }
        const data = {
          date: new Date(`${output.date}T00:00:00.000Z`),
          qtyDay: output.qtyDay,
          totalMDay: output.totalMDay,
          weightDay: output.weightDay,
          qtyNight: output.qtyNight,
          totalMNight: output.totalMNight,
          weightNight: output.weightNight,
          dataSource: parsed.data.fileName || 'Import Excel',
        }
        if (current) {
          await tx.packingDailyOutput.update({ where: { id: current.id }, data })
          updatedCount += 1
        } else {
          await tx.packingDailyOutput.create({ data })
          insertedCount += 1
        }
      }
      return { insertedCount, updatedCount, unchangedCount, decisions }
    }, { timeout: 30_000, maxWait: 5_000 })

    if ('stale' in result && result.stale) {
      return NextResponse.json({ success: false, code: 'STALE_PREVIEW', error: 'Dữ liệu Đóng gói đã thay đổi sau khi xem trước. Vui lòng xem trước lại.', decisions: result.decisions }, { status: 409 })
    }
    if ('replacement' in result && result.replacement) {
      return NextResponse.json({ success: false, code: 'REPLACEMENT_REQUIRED', error: 'Cần xác nhận thay thế các ngày đã có dữ liệu.', decisions: result.decisions }, { status: 409 })
    }
    return NextResponse.json({
      success: true,
      insertedCount: result.insertedCount,
      updatedCount: result.updatedCount,
      unchangedCount: result.unchangedCount,
      fileName: parsed.data.fileName,
    })
  } catch (error) {
    if (retryable(error)) {
      return NextResponse.json({ success: false, code: 'STALE_PREVIEW', error: 'Dữ liệu đã thay đổi. Vui lòng xem trước lại.' }, { status: 409 })
    }
    console.error('[POST /api/materials/packing/import/confirm]', error)
    return NextResponse.json({ success: false, code: 'DATABASE_ERROR', error: 'Không thể lưu dữ liệu Đóng gói.' }, { status: 500 })
  }
}
