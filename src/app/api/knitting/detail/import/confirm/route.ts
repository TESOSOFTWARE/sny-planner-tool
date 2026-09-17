// src/app/api/knitting/detail/import/confirm/route.ts
// POST /api/knitting/detail/import/confirm
// Idempotent (Option B): xóa records cũ theo [machineId, reportDate] trong knitting_daily_detail rồi insert mới.
// KHÔNG ĐỤNG CHẠM KnittingDailyOutput.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { z } from 'zod'

const knittingDetailRowSchema = z.object({
  machineId:      z.string().min(1),
  reportDate:     z.string(),
  shift:          z.enum(['D', 'N']),
  width:          z.number().nullable(),
  color:          z.string().min(1),
  weightSpec:     z.number().nullable(),
  lengthM:        z.number().nullable(),
  tapeRoll:       z.number().nullable(),
  mValue:         z.number().nullable(),
  avgPerRoll:     z.number().nullable(),
  quantity:       z.number().nullable(),
  weightKgs:      z.number().min(0),
  orderRef:       z.string().nullable(),
  machineNote:    z.string().nullable(),
  machineSizeM:   z.number().nullable(),
  cmPerMin:       z.number().nullable(),
  meterPerDay:    z.number().nullable(),
  operatingGrade: z.string().nullable(),
  totalPct:       z.number().nullable(),
})

const confirmBodySchema = z.object({
  rows: z.array(knittingDetailRowSchema).min(1, 'Cần ít nhất 1 dòng dữ liệu.'),
})

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON.' }, { status: 400 })
  }

  const parsed = confirmBodySchema.safeParse(body)
  if (!parsed.success) {
    const msg = parsed.error.issues.map(e => e.message).join('; ')
    return NextResponse.json({ success: false, error: `Validation failed: ${msg}` }, { status: 422 })
  }

  const { rows } = parsed.data

  const groupKeys = new Set<string>()
  for (const row of rows) {
    groupKeys.add(`${row.machineId}::${row.reportDate}`)
  }

  let insertedCount = 0
  try {
    await prisma.$transaction(async (tx) => {
      // Rule B: Delete existing records in knitting_daily_detail for [machineId, reportDate] pairs in the file
      for (const key of Array.from(groupKeys)) {
        const [machineId, reportDateStr] = key.split('::')
        await tx.knittingDailyDetail.deleteMany({
          where: {
            machineId,
            reportDate: new Date(reportDateStr),
          },
        })
      }

      // Insert new rows into knitting_daily_detail
      const data = rows.map(row => ({
        machineId:      row.machineId,
        reportDate:     new Date(row.reportDate),
        shift:          row.shift,
        width:          row.width !== null ? row.width : undefined,
        color:          row.color,
        weightSpec:     row.weightSpec !== null ? row.weightSpec : undefined,
        lengthM:        row.lengthM !== null ? row.lengthM : undefined,
        tapeRoll:       row.tapeRoll !== null ? row.tapeRoll : undefined,
        mValue:         row.mValue !== null ? row.mValue : undefined,
        avgPerRoll:     row.avgPerRoll !== null ? row.avgPerRoll : undefined,
        quantity:       row.quantity !== null ? row.quantity : undefined,
        weightKgs:      row.weightKgs,
        orderRef:       row.orderRef,
        machineNote:    row.machineNote,
        machineSizeM:   row.machineSizeM !== null ? row.machineSizeM : undefined,
        cmPerMin:       row.cmPerMin !== null ? row.cmPerMin : undefined,
        meterPerDay:    row.meterPerDay !== null ? row.meterPerDay : undefined,
        operatingGrade: row.operatingGrade,
        totalPct:       row.totalPct !== null ? row.totalPct : undefined,
        dataSource:     'import' as const,
      }))

      await tx.knittingDailyDetail.createMany({ data })
      insertedCount = data.length
    })
  } catch (err) {
    console.error('[POST /api/knitting/detail/import/confirm]', err)
    return NextResponse.json(
      { success: false, error: 'Lỗi lưu dữ liệu Knitting Detail vào DB.' },
      { status: 500 }
    )
  }

  return NextResponse.json({
    success:         true,
    recordsDeleted:  groupKeys.size,
    recordsInserted: insertedCount,
  })
}
