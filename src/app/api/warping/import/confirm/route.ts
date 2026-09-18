// src/app/api/warping/import/confirm/route.ts
// POST /api/warping/import/confirm
// Idempotent (Option B): xóa records cũ theo [machineId, reportDate] rồi insert mới.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { z } from 'zod'

const warpingRowSchema = z.object({
  machineId:         z.string().min(1),
  reportDate:        z.string(), // ISO string
  shift:             z.enum(['D', 'N']),
  weavingMachineRef: z.string().nullable(),
  color:             z.string().min(1),
  denier:            z.number().nullable(),
  strand:            z.number().nullable(),
  beamCount1:        z.number().nullable(),
  mPerEa:            z.number().nullable(),
  weigValue:         z.number().nullable(),
  beamCount2:        z.number().nullable(),
  quantity:          z.number().nullable(),
  weightKgs:         z.number().min(0),
  orderRef:          z.string().nullable(),
})

const confirmBodySchema = z.object({
  rows: z.array(warpingRowSchema).min(1, 'Cần ít nhất 1 dòng dữ liệu.'),
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
      // Rule B: Delete existing records for [machineId, reportDate] pairs in the file
      for (const key of Array.from(groupKeys)) {
        const [machineId, reportDateStr] = key.split('::')
        await tx.warpingDailyOutput.deleteMany({
          where: {
            machineId,
            reportDate: new Date(reportDateStr),
          },
        })
      }

      // Insert new rows
      const data = rows.map(row => ({
        machineId:         row.machineId,
        reportDate:        new Date(row.reportDate),
        shift:             row.shift,
        weavingMachineRef: row.weavingMachineRef,
        color:             row.color,
        denier:            row.denier !== null ? row.denier : undefined,
        strand:            row.strand !== null ? row.strand : undefined,
        beamCount1:        row.beamCount1 !== null ? row.beamCount1 : undefined,
        mPerEa:            row.mPerEa !== null ? row.mPerEa : undefined,
        weigValue:         row.weigValue !== null ? row.weigValue : undefined,
        beamCount2:        row.beamCount2 !== null ? row.beamCount2 : undefined,
        quantity:          row.quantity !== null ? row.quantity : undefined,
        weightKgs:         row.weightKgs,
        orderRef:          row.orderRef,
        dataSource:        'import' as const,
      }))

      await tx.warpingDailyOutput.createMany({ data })
      insertedCount = data.length
    })
  } catch (err) {
    console.error('[POST /api/warping/import/confirm]', err)
    return NextResponse.json(
      { success: false, error: 'Lỗi lưu dữ liệu Warping vào DB.' },
      { status: 500 }
    )
  }

  return NextResponse.json({
    success:         true,
    recordsDeleted:  groupKeys.size,
    recordsInserted: insertedCount,
  })
}
