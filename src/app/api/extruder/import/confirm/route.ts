import { authError } from '@/lib/auth/session'
// src/app/api/extruder/import/confirm/route.ts
// POST /api/extruder/import/confirm
// Idempotent (Option B): xóa records cũ theo [machineId, reportDate] rồi insert mới.
// Nhận rows từ client (đã parse xong ở bước preview).

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { OutputLinkConflict } from '@/lib/excel/preserveOrderLinks'
import { assertHandoffsCoveredAfterImport, HandoffImportConflict } from '@/lib/production/handoffs'
import { invalidReportOutputRows } from '@/lib/production/reportRowValidation'
import { diffProductionReportRows, legacySourceKeyAdoptions, linkReportRowsBySourceKey, priorConfirmedReportRows, productionReportIdentityKey, productionReportMonthRange, productionReportSourceKey } from '@/lib/production/reportRowDiff'
import { assertProductionImportAttempt, assertProductionImportRowsMatchSnapshot, markProductionImportAttemptCommitted, ProductionImportAttemptError, ProductionImportAttemptReplayError, ProductionImportSnapshotMismatchError } from '@/lib/production/importAttempt'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'

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
  reportMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
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
  const invalidRows = [...invalidReportOutputRows(rows), ...rows.flatMap((row, index) => Number.isFinite(new Date(row.reportDate).getTime()) ? [] : [{ sourceRow: row.sourceRow ?? index + 1, reasons: ['Ngày không hợp lệ'] }])]
  const invalidSourceRows = new Set(invalidRows.map(row => row.sourceRow))
  const validRows = rows.filter((row, index) => row.isValid !== false && !(row.validationErrors?.length) && !invalidSourceRows.has(row.sourceRow ?? index + 1))
  const monthDate = new Date((validRows[0] ?? rows[0]).reportDate)
  const reportMonth = parsed.data.reportMonth ?? (Number.isFinite(monthDate.getTime()) ? monthDate.toISOString().slice(0, 7) : '')
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(reportMonth)) return NextResponse.json({ success: false, error: 'Không xác định được tháng báo cáo.' }, { status: 422 })
  const outOfPeriod = validRows.filter(row => new Date(row.reportDate).toISOString().slice(0, 7) !== reportMonth)
  if (outOfPeriod.length) return NextResponse.json({ success: false, error: 'Có dòng hợp lệ nằm ngoài tháng báo cáo đã chọn.', invalidRows: outOfPeriod.map(row => ({ sourceRow: row.sourceRow, reportDate: row.reportDate })) }, { status: 422 })
  const monthRange = productionReportMonthRange(reportMonth)
  const identifiedRows = validRows.map(row => ({ ...row, sourceKey: productionReportSourceKey('EXTRUDER', reportMonth, row.sourceRow) }))
  const protectedSourceKeys = new Set(rows.flatMap((row, index) => row.isValid === false || Boolean(row.validationErrors?.length) || invalidSourceRows.has(row.sourceRow ?? index + 1) ? [productionReportSourceKey('EXTRUDER', reportMonth, row.sourceRow)].filter((key): key is string => Boolean(key)) : []))

  // ── 3. Prisma transaction: delete old → insert new ─────────────────────────
  let insertedCount = 0
  let updatedCount = 0
  let unchangedCount = 0
  let ambiguousCount = 0
  let missingInSourceCount = 0
  try {
    await prisma.$transaction(async (tx) => {
      const attempt = parsed.data.importAttempt ? { ...parsed.data.importAttempt, sheet: 'EXTRUDER' as const } : undefined
      await assertProductionImportAttempt(tx, attempt)
      await assertProductionImportRowsMatchSnapshot(tx, attempt, rows)
      await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '5s'")
      await tx.$executeRawUnsafe('LOCK TABLE "extruder_daily_output" IN SHARE ROW EXCLUSIVE MODE')
      if (validRows.length === 0) {
        await markProductionImportAttemptCommitted(tx, attempt, { recordsAdded: 0, recordsUpdated: 0, recordsUnchanged: 0, invalidSkipped: invalidRows.length, missingInSource: 0, ambiguousSkipped: 0 })
        return
      }
      const existingRows = await tx.extruderDailyOutput.findMany({ where: { reportDate: monthRange } })
      const prior = await priorConfirmedReportRows(tx, attempt?.batchId, 'EXTRUDER')
      const priorRows = (prior?.rows ?? []).flatMap((value) => {
        if (!value || typeof value !== 'object') return []
        const row = value as Record<string, unknown>
        const sourceRow = typeof row.sourceRow === 'number' ? row.sourceRow : undefined
        const sourceKey = prior ? productionReportSourceKey('EXTRUDER', prior.reportMonth, sourceRow) : null
        if (!sourceKey || typeof row.machineId !== 'string' || typeof row.reportDate !== 'string') return []
        return [{ sourceKey, data: { machineId: row.machineId, reportDate: new Date(row.reportDate), shift: row.shift, color: row.color, denier: row.denier, weightKgs: row.weightKgs, beamNote: row.beamNote, orderRef: row.orderRef, orderId: null, dataSource: 'import' } }]
      })
      const existingById = new Map(existingRows.map(row => [row.id, row]))
      const adoptions = legacySourceKeyAdoptions(existingRows, priorRows)
      for (const adoption of adoptions) {
        await tx.extruderDailyOutput.update({ where: { id: adoption.id }, data: { sourceKey: adoption.sourceKey } })
        const row = existingById.get(adoption.id)
        if (row) row.sourceKey = adoption.sourceKey
      }
      const orderRows = await tx.productionOrder.findMany({ select: { id: true, piNumber: true } })
      const linked = linkReportRowsBySourceKey(identifiedRows, existingRows, orderRows)
      const linkedRows = linked.rows
      ambiguousCount = linked.ambiguousRows.length
      const incoming = linkedRows.map(row => ({
        sourceKey: row.sourceKey,
        data: {
        machineId:  row.machineId,
        reportDate: new Date(row.reportDate),
        shift:      row.shift,
        color:      row.color,
        denier:     row.denier,
        weightKgs:  row.weightKgs,
        beamNote:   row.beamNote,
        orderRef:   row.orderRef,
        orderId: row.orderId,
        dataSource: parsed.data.sourceFileName ?? 'import',
        },
      }))
      const diff = diffProductionReportRows(incoming, existingRows, {
        identityKey: row => productionReportIdentityKey([row.machineId, row.reportDate, row.shift, row.orderRef, row.color, row.denier]),
        legacyCandidateKey: row => productionReportIdentityKey([row.machineId, row.reportDate, row.shift]),
        protectedSourceKeys,
      })
      for (const adoption of diff.adoptions) {
        await tx.extruderDailyOutput.update({ where: { id: adoption.id }, data: { sourceKey: adoption.sourceKey } })
        const row = existingById.get(adoption.id)
        if (row) row.sourceKey = adoption.sourceKey
      }
      await assertHandoffsCoveredAfterImport(tx, 'extruder', diff.updates.map(row => existingById.get(row.id)!).filter(Boolean), [...diff.creates, ...diff.updates].map(row => ({ ...row.data, orderId: row.data.orderId as string | null })))

      for (const row of diff.updates) await tx.extruderDailyOutput.update({ where: { id: row.id }, data: { ...row.data, sourceKey: row.sourceKey } })
      if (diff.creates.length) await tx.extruderDailyOutput.createMany({ data: diff.creates.map(row => ({ ...row.data, sourceKey: row.sourceKey }) as Prisma.ExtruderDailyOutputCreateManyInput) })
      insertedCount = diff.creates.length
      updatedCount = diff.updates.length
      unchangedCount = diff.unchanged
      ambiguousCount += diff.ambiguous
      missingInSourceCount = diff.missingInSource
      await markProductionImportAttemptCommitted(tx, attempt, { recordsAdded: insertedCount, recordsUpdated: updatedCount, recordsUnchanged: unchangedCount, invalidSkipped: invalidRows.length, missingInSource: missingInSourceCount, ambiguousSkipped: ambiguousCount })
    }, { timeout: 60_000, maxWait: 5_000 })
  } catch (err) {
    if (err instanceof ProductionImportAttemptReplayError) return NextResponse.json({ success: true, ...err.receipt, replayed: true })
    if (err instanceof ProductionImportAttemptError) return NextResponse.json({ success: false, code: 'IMPORT_ATTEMPT_EXPIRED', error: err.message }, { status: 409 })
    if (err instanceof ProductionImportSnapshotMismatchError) return NextResponse.json({ success: false, code: 'STALE_PREVIEW', error: err.message }, { status: 409 })
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
    recordsDeleted: 0,
    recordsInserted: insertedCount,
    recordsAdded: insertedCount,
    recordsUpdated: updatedCount,
    recordsUnchanged: unchangedCount,
    invalidSkipped: invalidRows.length,
    ambiguousSkipped: ambiguousCount,
    missingInSource: missingInSourceCount,
  })
}
