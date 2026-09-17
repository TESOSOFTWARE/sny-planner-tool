// src/app/api/extruder/import/confirm/route.ts
// POST /api/extruder/import/confirm
// Idempotent (Option B): xóa records cũ theo [machineId, reportDate] rồi insert mới.
// Nhận rows từ client (đã parse xong ở bước preview).

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { z } from 'zod'

// ── Zod schema cho từng row ──────────────────────────────────────────────────

const extruderRowSchema = z.object({
  machineId:  z.string().min(1),
  reportDate: z.string(), // ISO string từ JSON
  shift:      z.enum(['D', 'N']),
  color:      z.string().min(1),
  denier:     z.number().nullable(),
  weightKgs:  z.number().min(0),
  beamNote:   z.string().nullable(),
  orderRef:   z.string().nullable(),
})

const confirmBodySchema = z.object({
  rows: z.array(extruderRowSchema).min(1, 'Cần ít nhất 1 dòng dữ liệu.'),
})

export async function POST(req: NextRequest) {
  // ── 1. Parse body ──────────────────────────────────────────────────────────
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

  // ── 2. Group rows by [machineId, reportDate] for idempotent delete ─────────
  const groupKeys = new Set<string>()
  for (const row of rows) {
    groupKeys.add(`${row.machineId}::${row.reportDate}`)
  }

  // ── 3. Prisma transaction: delete old → insert new ─────────────────────────
  let insertedCount = 0
  try {
    await prisma.$transaction(async (tx) => {
      // Delete existing records cho các [machineId, reportDate] trong file
      for (const key of Array.from(groupKeys)) {
        const [machineId, reportDateStr] = key.split('::')
        await tx.extruderDailyOutput.deleteMany({
          where: {
            machineId,
            reportDate: new Date(reportDateStr),
          },
        })
      }

      // Insert tất cả rows mới
      const data = rows.map(row => ({
        machineId:  row.machineId,
        reportDate: new Date(row.reportDate),
        shift:      row.shift,
        color:      row.color,
        denier:     row.denier !== null ? row.denier : undefined,
        weightKgs:  row.weightKgs,
        beamNote:   row.beamNote,
        orderRef:   row.orderRef,
        dataSource: 'import' as const,
      }))

      await tx.extruderDailyOutput.createMany({ data })
      insertedCount = data.length
    })
  } catch (err) {
    console.error('[POST /api/extruder/import/confirm]', err)
    return NextResponse.json(
      { success: false, error: 'Lỗi lưu dữ liệu vào DB.' },
      { status: 500 }
    )
  }

  return NextResponse.json({
    success:       true,
    recordsDeleted: groupKeys.size,   // số nhóm [machineId,date] đã xóa
    recordsInserted: insertedCount,
  })
}
