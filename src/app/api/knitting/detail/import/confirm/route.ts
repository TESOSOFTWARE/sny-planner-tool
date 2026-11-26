import { authError } from '@/lib/auth/session'
// src/app/api/knitting/detail/import/confirm/route.ts
// POST /api/knitting/detail/import/confirm
// Idempotent (Option B): xóa records cũ theo [machineId, reportDate] trong knitting_daily_detail rồi insert mới.
// KHÔNG ĐỤNG CHẠM KnittingDailyOutput.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { OutputLinkConflict } from '@/lib/excel/preserveOrderLinks'
import { assertHandoffsCoveredAfterImport, HandoffImportConflict } from '@/lib/production/handoffs'
import { invalidReportOutputRows } from '@/lib/production/reportRowValidation'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { productionPiResolver } from '@/lib/excel/productionPi'
import { applyRemarkDecisions, knownMeshKeys, remarkKey, RemarkDecisionRequired } from '@/lib/excel/knittingRemark'
import { assertProductionImportAttempt, assertProductionImportRowsMatchSnapshot, markProductionImportAttemptCommitted, ProductionImportAttemptError, ProductionImportAttemptReplayError, ProductionImportSnapshotMismatchError } from '@/lib/production/importAttempt'
import { diffProductionReportRows, legacySourceKeyAdoptions, linkReportRowsBySourceKey, priorConfirmedReportRows, productionReportIdentityKey, productionReportMonthRange, productionReportSourceKey } from '@/lib/production/reportRowDiff'

export const maxDuration = 60  // Matches the 60s transaction timeout below

const knittingDetailRowSchema = z.object({
  machineId:      z.string().min(1),
  reportDate:     z.string(),
  shift:          z.enum(['D', 'N']),
  width:          z.number().nullable(),
  color:          z.string(),
  weightSpec:     z.number().nullable(),
  lengthM:        z.number().nullable(),
  tapeRoll:       z.number().nullable(),
  mValue:         z.number().nullable(),
  avgPerRoll:     z.number().nullable(),
  quantity:       z.number().nullable(),
  weightKgs:      z.number(),
  sourceWeight:   z.string().optional(),
  sourceRow:       z.number().int().positive().optional(),
  isValid:         z.boolean().optional(),
  validationErrors: z.array(z.string()).optional(),
  orderRef:       z.string().nullable(),
  sourceOrderRefs: z.array(z.string()).max(2).optional(),
  machineNote:    z.string().nullable(),
  machineSizeM:   z.number().nullable(),
  cmPerMin:       z.number().nullable(),
  meterPerDay:    z.number().nullable(),
  operatingGrade: z.string().nullable(),
  totalPct:       z.number().nullable(),
})

const confirmBodySchema = z.object({
  rows: z.array(knittingDetailRowSchema).min(1, 'Cần ít nhất 1 dòng dữ liệu.'),
  sourceFileName: z.string().trim().min(1).max(255).optional(),
  reportMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
  remarkDecisions: z.array(z.object({
    value: z.string().trim().min(1).max(1000), target: z.enum(['MESH', 'NOTE']),
  }).strict()).max(5000).default([]),
  importAttempt: z.object({ batchId: z.string().min(1), token: z.string().min(1).max(64) }).optional(),
}).refine(body => new Set(body.remarkDecisions.map(row => remarkKey(row.value))).size === body.remarkDecisions.length, {
  message: 'Mỗi giá trị REMARK chỉ được chọn một cột.',
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

  const { rows, remarkDecisions } = parsed.data
  const invalidRows = [...invalidReportOutputRows(rows), ...rows.flatMap((row, index) => Number.isFinite(new Date(row.reportDate).getTime()) ? [] : [{ sourceRow: row.sourceRow ?? index + 1, reasons: ['Ngày không hợp lệ'] }])]
  const invalidSourceRows = new Set(invalidRows.map(row => row.sourceRow))
  const validRows = rows.filter((row, index) => row.isValid !== false && !(row.validationErrors?.length) && !invalidSourceRows.has(row.sourceRow ?? index + 1))
  const monthDate = new Date((validRows[0] ?? rows[0]).reportDate)
  const reportMonth = parsed.data.reportMonth ?? (Number.isFinite(monthDate.getTime()) ? monthDate.toISOString().slice(0, 7) : '')
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(reportMonth)) return NextResponse.json({ success: false, error: 'Không xác định được tháng báo cáo.' }, { status: 422 })
  const outOfPeriod = validRows.filter(row => new Date(row.reportDate).toISOString().slice(0, 7) !== reportMonth)
  if (outOfPeriod.length) return NextResponse.json({ success: false, error: 'Có dòng hợp lệ nằm ngoài tháng báo cáo đã chọn.', invalidRows: outOfPeriod.map(row => ({ sourceRow: row.sourceRow, reportDate: row.reportDate })) }, { status: 422 })
  const monthRange = productionReportMonthRange(reportMonth)
  const identifiedRows = validRows.map(row => ({ ...row, sourceKey: productionReportSourceKey('KNITTING', reportMonth, row.sourceRow) }))
  const protectedSourceKeys = new Set(rows.flatMap((row, index) => row.isValid === false || Boolean(row.validationErrors?.length) || invalidSourceRows.has(row.sourceRow ?? index + 1) ? [productionReportSourceKey('KNITTING', reportMonth, row.sourceRow)].filter((key): key is string => Boolean(key)) : []))

  let insertedCount = 0
  let updatedCount = 0
  let unchangedCount = 0
  let ambiguousCount = 0
  let missingInSourceCount = 0
  try {
    await prisma.$transaction(async (tx) => {
      const attempt = parsed.data.importAttempt ? { ...parsed.data.importAttempt, sheet: 'KNITTING' as const } : undefined
      await assertProductionImportAttempt(tx, attempt)
      await assertProductionImportRowsMatchSnapshot(tx, attempt, rows)
      await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '5s'")
      await tx.$executeRawUnsafe('LOCK TABLE "knitting_daily_detail" IN SHARE ROW EXCLUSIVE MODE')
      if (validRows.length === 0) {
        await markProductionImportAttemptCommitted(tx, attempt, { recordsAdded: 0, recordsUpdated: 0, recordsUnchanged: 0, invalidSkipped: invalidRows.length, missingInSource: 0, ambiguousSkipped: 0 })
        return
      }
      const existingRows = await tx.knittingDailyDetail.findMany({ where: { reportDate: monthRange } })
      const orderRows = await tx.productionOrder.findMany({ select: { id: true, piNumber: true } })
      const saved = await tx.knittingDailyDetail.findMany({ distinct: ['meshType'], select: { meshType: true }, where: { meshType: { not: null } } })
      const remarkContext = {
        knownMeshKeys: knownMeshKeys(saved.map(row => row.meshType)),
        resolvePi: productionPiResolver(orderRows.map(row => row.piNumber)),
      }
      const prior = await priorConfirmedReportRows(tx, attempt?.batchId, 'KNITTING')
      let priorClassified: Array<(typeof validRows)[number] & { meshType: string | null; orderRef: string | null; machineNote: string | null }> = []
      if (prior) {
        const savedDecisions = prior.decisions && typeof prior.decisions === 'object' ? (prior.decisions as { knittingRemarks?: Record<string, 'MESH' | 'NOTE'> }).knittingRemarks ?? {} : {}
        const priorRemarkDecisions = Object.entries(savedDecisions).map(([value, target]) => ({ value, target }))
        try { priorClassified = applyRemarkDecisions(prior.rows as typeof validRows, remarkContext, priorRemarkDecisions, 'NOTE') }
        catch { priorClassified = [] }
      }
      const priorRows = priorClassified.flatMap(row => {
        const sourceKey = prior ? productionReportSourceKey('KNITTING', prior.reportMonth, row.sourceRow) : null
        if (!sourceKey) return []
        return [{ sourceKey, data: {
          machineId: row.machineId, reportDate: new Date(row.reportDate), shift: row.shift,
          width: row.width, color: row.color, weightSpec: row.weightSpec, lengthM: row.lengthM,
          tapeRoll: row.tapeRoll, mValue: row.mValue, avgPerRoll: row.avgPerRoll, quantity: row.quantity,
          weightKgs: row.weightKgs, orderRef: row.orderRef, meshType: row.meshType, machineNote: row.machineNote,
          machineSizeM: row.machineSizeM, cmPerMin: row.cmPerMin, meterPerDay: row.meterPerDay,
          operatingGrade: row.operatingGrade, totalPct: row.totalPct, orderId: null, dataSource: 'import',
        } }]
      })
      const existingById = new Map(existingRows.map(row => [row.id, row]))
      const adoptions = legacySourceKeyAdoptions(existingRows, priorRows)
      for (const adoption of adoptions) {
        await tx.knittingDailyDetail.update({ where: { id: adoption.id }, data: { sourceKey: adoption.sourceKey } })
        const row = existingById.get(adoption.id)
        if (row) row.sourceKey = adoption.sourceKey
      }
      const classified = applyRemarkDecisions(identifiedRows, {
        knownMeshKeys: remarkContext.knownMeshKeys,
        resolvePi: remarkContext.resolvePi,
      }, remarkDecisions, 'NOTE')
      const linked = linkReportRowsBySourceKey(classified, existingRows, orderRows)
      const linkedRows = linked.rows
      ambiguousCount = linked.ambiguousRows.length
      const incoming = linkedRows.map(row => ({
        sourceKey: row.sourceKey,
        data: {
        machineId:      row.machineId,
        reportDate:     new Date(row.reportDate),
        shift:          row.shift,
        width:          row.width,
        color:          row.color,
        weightSpec:     row.weightSpec,
        lengthM:        row.lengthM,
        tapeRoll:       row.tapeRoll,
        mValue:         row.mValue,
        avgPerRoll:     row.avgPerRoll,
        quantity:       row.quantity,
        weightKgs:      row.weightKgs,
        orderRef:       row.orderRef,
        meshType:       row.meshType,
        machineNote:    row.machineNote,
        machineSizeM:   row.machineSizeM,
        cmPerMin:       row.cmPerMin,
        meterPerDay:    row.meterPerDay,
        operatingGrade: row.operatingGrade,
        totalPct:       row.totalPct,
        orderId: row.orderId,
        dataSource:     parsed.data.sourceFileName ?? 'import',
        },
      }))
      const diff = diffProductionReportRows(incoming, existingRows, {
        identityKey: row => productionReportIdentityKey([row.machineId, row.reportDate, row.shift, row.orderRef, row.width, row.color, row.weightSpec, row.lengthM, row.tapeRoll, row.avgPerRoll]),
        legacyCandidateKey: row => productionReportIdentityKey([row.machineId, row.reportDate, row.shift]),
        protectedSourceKeys,
      })
      for (const adoption of diff.adoptions) {
        await tx.knittingDailyDetail.update({ where: { id: adoption.id }, data: { sourceKey: adoption.sourceKey } })
        const row = existingById.get(adoption.id)
        if (row) row.sourceKey = adoption.sourceKey
      }
      await assertHandoffsCoveredAfterImport(tx, 'knitting', diff.updates.map(row => existingById.get(row.id)!).filter(Boolean), [...diff.creates, ...diff.updates].map(row => ({ ...row.data, orderId: row.data.orderId as string | null })))

      for (const row of diff.updates) await tx.knittingDailyDetail.update({ where: { id: row.id }, data: { ...row.data, sourceKey: row.sourceKey } })
      if (diff.creates.length) await tx.knittingDailyDetail.createMany({ data: diff.creates.map(row => ({ ...row.data, sourceKey: row.sourceKey }) as Prisma.KnittingDailyDetailCreateManyInput) })
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
    if (err instanceof RemarkDecisionRequired) return NextResponse.json({ success: false, code: 'REMARK_DECISION_REQUIRED', values: err.values, error: err.message }, { status: 409 })
    if (err instanceof OutputLinkConflict) {
      return NextResponse.json({ success: false, code: 'OUTPUT_LINK_CONFLICT', error: err.message }, { status: 409 })
    }
    console.error('[POST /api/knitting/detail/import/confirm]', err)
    return NextResponse.json(
      { success: false, error: 'Lỗi lưu dữ liệu Knitting Detail vào DB.' },
      { status: 500 }
    )
  }

  return NextResponse.json({
    success:         true,
    recordsDeleted:  0,
    recordsInserted: insertedCount,
    recordsAdded: insertedCount,
    recordsUpdated: updatedCount,
    recordsUnchanged: unchangedCount,
    invalidSkipped: invalidRows.length,
    ambiguousSkipped: ambiguousCount,
    missingInSource: missingInSourceCount,
  })
}
