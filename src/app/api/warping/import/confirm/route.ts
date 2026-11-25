import { authError } from '@/lib/auth/session'
// src/app/api/warping/import/confirm/route.ts
// POST /api/warping/import/confirm
// Idempotent (Option B): xóa records cũ theo [machineId, reportDate] rồi insert mới.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { preserveOrderLinks, OutputLinkConflict } from '@/lib/excel/preserveOrderLinks'
import { assertHandoffsCoveredAfterImport, HandoffImportConflict } from '@/lib/production/handoffs'
import { invalidReportOutputRows } from '@/lib/production/reportRowValidation'
import { assertProductionImportAttempt, markProductionImportAttemptCommitted, ProductionImportAttemptError, ProductionImportAttemptReplayError } from '@/lib/production/importAttempt'
import { z } from 'zod'

export const maxDuration = 60  // Matches the 60s transaction timeout below

const warpingRowSchema = z.object({
  machineId:         z.string().min(1),
  reportDate:        z.string(), // ISO string
  shift:             z.enum(['D', 'N']),
  weavingMachineRef: z.string().nullable(),
  color:             z.string(),
  denier:            z.number().nullable(),
  strand:            z.number().nullable(),
  beamCount1:        z.number().nullable(),
  mPerEa:            z.number().nullable(),
  weigValue:         z.number().nullable(),
  beamCount2:        z.number().nullable(),
  quantity:          z.number().nullable(),
  weightKgs:         z.number(),
  sourceWeight:      z.string().optional(),
  sourceRow:          z.number().int().positive().optional(),
  isValid:            z.boolean().optional(),
  validationErrors:   z.array(z.string()).optional(),
  orderRef:          z.string().nullable(),
  sourceOrderRefs: z.array(z.string()).max(2).optional(),
})

const confirmBodySchema = z.object({
  rows: z.array(warpingRowSchema).min(1, 'Cần ít nhất 1 dòng dữ liệu.'),
  sourceFileName: z.string().trim().min(1).max(255).optional(),
  importAttempt: z.object({ batchId: z.string().min(1), token: z.string().min(1).max(64) }).optional(),
})

export async function POST(req: NextRequest) {
  const accessError = await authError('POST', req)
  if (accessError) return accessError

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
  const invalidRows = invalidReportOutputRows(rows)
  if (invalidRows.length) return NextResponse.json({ success: false, error: 'Có dòng Warping không hợp lệ; chưa thay dữ liệu cũ.', invalidRows }, { status: 422 })


  const groupKeys = new Set<string>()
  for (const row of rows) {
    groupKeys.add(`${row.machineId}::${row.reportDate}`)
  }

  let insertedCount = 0
  try {
    await prisma.$transaction(async (tx) => {
      const attempt = parsed.data.importAttempt ? { ...parsed.data.importAttempt, sheet: 'WARPING' as const } : undefined
      await assertProductionImportAttempt(tx, attempt)
      await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '5s'")
      await tx.$executeRawUnsafe('LOCK TABLE "warping_daily_output" IN SHARE ROW EXCLUSIVE MODE')
      const groups = { OR: Array.from(groupKeys).map(key => {
        const [machineId, date] = key.split('::')
        return { machineId, reportDate: new Date(date) }
      }) }
      const existingRows = await tx.warpingDailyOutput.findMany({ where: groups })
      const orderRows = await tx.productionOrder.findMany({ select: { id: true, piNumber: true } })
      const linkedRows = preserveOrderLinks(rows, existingRows, orderRows)
      await assertHandoffsCoveredAfterImport(tx, 'warping', existingRows, linkedRows)
      // Rule B: Delete existing records for [machineId, reportDate] pairs in the file —
      // one statement; a delete per group exceeded the transaction timeout on Neon (N13).
      await tx.warpingDailyOutput.deleteMany({ where: groups })

      // Insert new rows
      const data = linkedRows.map(row => ({
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
        orderId: row.orderId,
        dataSource:        parsed.data.sourceFileName ?? 'import',
      }))

      await tx.warpingDailyOutput.createMany({ data })
      insertedCount = data.length
      await markProductionImportAttemptCommitted(tx, attempt, { recordsDeleted: groupKeys.size, recordsInserted: insertedCount })
    }, { timeout: 60_000, maxWait: 5_000 })
  } catch (err) {
    if (err instanceof ProductionImportAttemptReplayError) return NextResponse.json({ success: true, ...err.receipt, replayed: true })
    if (err instanceof ProductionImportAttemptError) return NextResponse.json({ success: false, code: 'IMPORT_ATTEMPT_EXPIRED', error: err.message }, { status: 409 })
    if (err instanceof HandoffImportConflict) return NextResponse.json({ success: false, code: 'HANDOFF_ACTUAL_CONFLICT', error: err.message }, { status: 409 })
    if (err instanceof OutputLinkConflict) {
      return NextResponse.json({ success: false, code: 'OUTPUT_LINK_CONFLICT', error: err.message }, { status: 409 })
    }
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
