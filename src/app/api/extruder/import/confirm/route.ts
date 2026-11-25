import { authError } from '@/lib/auth/session'
// src/app/api/extruder/import/confirm/route.ts
// POST /api/extruder/import/confirm
// Idempotent (Option B): xóa records cũ theo [machineId, reportDate] rồi insert mới.
// Nhận rows từ client (đã parse xong ở bước preview).

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { preserveOrderLinks, OutputLinkConflict } from '@/lib/excel/preserveOrderLinks'
import { assertHandoffsCoveredAfterImport, HandoffImportConflict } from '@/lib/production/handoffs'
import { invalidReportOutputRows } from '@/lib/production/reportRowValidation'
import { assertProductionImportAttempt, markProductionImportAttemptCommitted, ProductionImportAttemptError, ProductionImportAttemptReplayError } from '@/lib/production/importAttempt'
import { z } from 'zod'

export const maxDuration = 60  // Matches the 60s transaction timeout below

// ── Zod schema cho từng row ──────────────────────────────────────────────────

const extruderRowSchema = z.object({
  machineId:  z.string().min(1),
  reportDate: z.string(), // ISO string từ JSON
  shift:      z.enum(['D', 'N']),
  color:      z.string(),
  denier:     z.number().nullable(),
  weightKgs:  z.number(),
  sourceWeight: z.string().optional(),
  sourceRow: z.number().int().positive().optional(),
  isValid: z.boolean().optional(),
  validationErrors: z.array(z.string()).optional(),
  beamNote:   z.string().nullable(),
  orderRef:   z.string().nullable(),
  sourceOrderRefs: z.array(z.string()).max(2).optional(),
})

const confirmBodySchema = z.object({
  rows: z.array(extruderRowSchema).min(1, 'Cần ít nhất 1 dòng dữ liệu.'),
  sourceFileName: z.string().trim().min(1).max(255).optional(),
  importAttempt: z.object({ batchId: z.string().min(1), token: z.string().min(1).max(64) }).optional(),
})

export async function POST(req: NextRequest) {
  const accessError = await authError('POST', req)
  if (accessError) return accessError

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
  const invalidRows = invalidReportOutputRows(rows)
  if (invalidRows.length) return NextResponse.json({ success: false, error: 'Có dòng Extruder không hợp lệ; chưa thay dữ liệu cũ.', invalidRows }, { status: 422 })


  // ── 2. Group rows by [machineId, reportDate] for idempotent delete ─────────
  const groupKeys = new Set<string>()
  for (const row of rows) {
    groupKeys.add(`${row.machineId}::${row.reportDate}`)
  }

  // ── 3. Prisma transaction: delete old → insert new ─────────────────────────
  let insertedCount = 0
  try {
    await prisma.$transaction(async (tx) => {
      const attempt = parsed.data.importAttempt ? { ...parsed.data.importAttempt, sheet: 'EXTRUDER' as const } : undefined
      await assertProductionImportAttempt(tx, attempt)
      await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '5s'")
      await tx.$executeRawUnsafe('LOCK TABLE "extruder_daily_output" IN SHARE ROW EXCLUSIVE MODE')
      const groups = { OR: Array.from(groupKeys).map(key => {
        const [machineId, date] = key.split('::')
        return { machineId, reportDate: new Date(date) }
      }) }
      const existingRows = await tx.extruderDailyOutput.findMany({ where: groups })
      const orderRows = await tx.productionOrder.findMany({ select: { id: true, piNumber: true } })
      const linkedRows = preserveOrderLinks(rows, existingRows, orderRows)
      await assertHandoffsCoveredAfterImport(tx, 'extruder', existingRows, linkedRows)
      // Delete existing records cho các [machineId, reportDate] trong file — một lệnh,
      // vì xoá từng nhóm làm vượt timeout transaction trên Neon (N13).
      await tx.extruderDailyOutput.deleteMany({ where: groups })

      // Insert tất cả rows mới
      const data = linkedRows.map(row => ({
        machineId:  row.machineId,
        reportDate: new Date(row.reportDate),
        shift:      row.shift,
        color:      row.color,
        denier:     row.denier !== null ? row.denier : undefined,
        weightKgs:  row.weightKgs,
        beamNote:   row.beamNote,
        orderRef:   row.orderRef,
        orderId: row.orderId,
        dataSource: parsed.data.sourceFileName ?? 'import',
      }))

      await tx.extruderDailyOutput.createMany({ data })
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
