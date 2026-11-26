import { authError } from '@/lib/auth/session'
// src/app/api/materials/rolling/import/confirm/route.ts
// POST /api/materials/rolling/import/confirm — Saves parsed RollingDailyMetric records to DB with Scoped Replacement.

import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { parseRollingReport, RollingDateConflictError } from '@/lib/excel/parseRollingReport'
import { prisma } from '@/lib/db'
import { rollingPeriodFromFileName, validateRollingPeriod } from '@/lib/materials/rollingPeriod'
import { rollingImportSnapshot } from '@/lib/materials/rollingImportSnapshot'
import { assertHandoffsCoveredAfterImport, HandoffImportConflict } from '@/lib/production/handoffs'
import { assertProductionImportAttempt, markProductionImportAttemptCommitted, ProductionImportAttemptError, ProductionImportAttemptReplayError } from '@/lib/production/importAttempt'
import { diffProductionReportRows, legacySourceKeyAdoptions, priorConfirmedReportRows, productionReportIdentityKey, productionReportMonthRange, productionReportSourceKey } from '@/lib/production/reportRowDiff'

// In-memory Mutex to prevent overlapping concurrent rolling imports
let isRollingImportInProgress = false

export async function POST(req: NextRequest) {
  const accessError = await authError('POST', req)
  if (accessError) return accessError

  if (isRollingImportInProgress) {
    return NextResponse.json(
      { success: false, error: 'Hệ thống đang xử lý một phiên import Rolling khác. Vui lòng đợi trong giây lát.' },
      { status: 409 }
    )
  }

  isRollingImportInProgress = true
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const importBatchId = String(formData.get('importBatchId') ?? '')
    const importAttemptToken = String(formData.get('importAttemptToken') ?? '')
    if (Boolean(importBatchId) !== Boolean(importAttemptToken)) return NextResponse.json({ success: false, error: 'Thông tin phiên import không đầy đủ.' }, { status: 422 })
    const importAttempt = importBatchId ? { batchId: importBatchId, token: importAttemptToken, sheet: 'ROLLING' as const } : undefined

    if (!(file instanceof Blob) || typeof file.name !== 'string') {
      return NextResponse.json({ success: false, error: 'Vui lòng đính kèm file Excel để xác nhận import.' }, { status: 400 })
    }

    if (!file.name.toLowerCase().endsWith('.xlsx')) return NextResponse.json({ success: false, error: 'Chỉ nhận file .xlsx.' }, { status: 400 })
    const hasSelectedPeriod = formData.has('month') || formData.has('year')
    const period = hasSelectedPeriod ? validateRollingPeriod(formData.get('month'), formData.get('year')) : rollingPeriodFromFileName(file.name)
    if (!hasSelectedPeriod || !period) return NextResponse.json({ success: false, periodRequired: true, error: 'Vui lòng chọn tháng và năm hợp lệ rồi xem trước lại.' }, { status: 400 })
    const reportMonth = `${period.year}-${String(period.month).padStart(2, '0')}`
    const monthRange = productionReportMonthRange(reportMonth)

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    const parseResult = parseRollingReport(buffer, file.name, period)
    const invalidPopulatedBlocks = parseResult.dateBlockMappings.filter(block => !block.isoDate && block.hasData)

    const expectedSnapshot = rollingImportSnapshot(buffer, period)
    if (formData.get('expectedSnapshot') !== expectedSnapshot) return NextResponse.json({ success: false, error: 'File hoặc kỳ đã thay đổi. Vui lòng xem trước lại.' }, { status: 409 })

    // PI Number map lookup
    const dbOrders = await prisma.productionOrder.findMany({
      select: { id: true, piNumber: true },
    })
    // A PI may contain several sub-lines.  Only auto-link a rolling row when
    // the PI resolves to exactly one order; never silently attach it to the
    // last row returned by the database.
    const piMap = new Map<string, string | null>()
    for (const o of dbOrders) {
      const key = o.piNumber.trim().toUpperCase()
      piMap.set(key, piMap.has(key) ? null : o.id)
    }

    let ambiguousOrderCount = 0
    const rollingData = parseResult.metrics.map((m) => {
      const matchedOrderId = m.orderRef ? (piMap.get(m.orderRef.trim().toUpperCase()) ?? null) : null
      if (m.orderRef && piMap.has(m.orderRef.trim().toUpperCase()) && matchedOrderId == null) ambiguousOrderCount++
      return {
        date: new Date(m.date),
        orderRef: m.orderRef,
        orderId: matchedOrderId,
        color: m.color,
        widthM: m.widthM,
        lengthM: m.lengthM,
        weightKgsOrder: m.weightKgsOrder,
        metricLabel: m.metricLabel,
        metricValue: m.metricValue,
        sourceKey: productionReportSourceKey('ROLLING', reportMonth, m.sourceRow, `${m.cellRef}|${m.metricLabel}`),
        dataSource: file.name,
      }
    })
    const protectedSourceKeys = new Set(parseResult.invalidMetrics.flatMap(metric => {
      const sourceKey = productionReportSourceKey('ROLLING', reportMonth, metric.sourceRow, `${metric.cellRef}|${metric.metricLabel}`)
      return sourceKey ? [sourceKey] : []
    }))
    const validSourceDates = new Set(parseResult.dateBlockMappings.flatMap(block => block.isoDate ? [block.isoDate] : []))

    // Scoped Replacement: identify distinct dates strictly present in this payload
    const targetDates = Array.from(new Set(rollingData.map((m) => m.date.getTime()))).map((t) => new Date(t))

    // Execute deletion of exact scope and batch insertion atomically inside transaction
    const result = await prisma.$transaction(async (tx) => {
      await assertProductionImportAttempt(tx, importAttempt)
      await tx.$executeRaw`SET LOCAL lock_timeout = '5s'`
      await tx.$executeRaw`LOCK TABLE "rolling_daily_metrics" IN SHARE ROW EXCLUSIVE MODE`
      const existing = await tx.rollingDailyMetric.findMany({ where: { date: monthRange } })
      const prior = await priorConfirmedReportRows(tx, importAttempt?.batchId, 'ROLLING')
      const priorRows = (prior?.rows ?? []).flatMap((value) => {
        if (!value || typeof value !== 'object') return []
        const row = value as Record<string, unknown>
        const sourceRow = typeof row.sourceRow === 'number' ? row.sourceRow : typeof row.cellRef === 'string' ? Number(row.cellRef.match(/Row (\d+)/)?.[1]) : undefined
        if (!sourceRow || typeof row.metricLabel !== 'string' || typeof row.date !== 'string') return []
        const sourceKey = prior ? productionReportSourceKey('ROLLING', prior.reportMonth, sourceRow, `${row.cellRef ?? `Row ${sourceRow}`}|${row.metricLabel}`) : null
        if (!sourceKey) return []
        return [{ sourceKey, data: {
          date: new Date(row.date), orderRef: row.orderRef, orderId: null, color: row.color,
          widthM: row.widthM, lengthM: row.lengthM, weightKgsOrder: row.weightKgsOrder,
          metricLabel: row.metricLabel, metricValue: row.metricValue, dataSource: 'import',
        } }]
      })
      const existingById = new Map(existing.map(row => [row.id, row]))
      const adoptions = legacySourceKeyAdoptions(existing, priorRows)
      for (const adoption of adoptions) {
        await tx.rollingDailyMetric.update({ where: { id: adoption.id }, data: { sourceKey: adoption.sourceKey } })
        const row = existingById.get(adoption.id)
        if (row) row.sourceKey = adoption.sourceKey
      }
      const diff = diffProductionReportRows(rollingData.map(({ sourceKey, ...data }) => ({ sourceKey, data })), existing, {
        identityKey: row => productionReportIdentityKey([row.date, row.orderRef, row.metricLabel, row.color, row.widthM, row.lengthM, row.weightKgsOrder]),
        legacyCandidateKey: row => productionReportIdentityKey([row.date, row.orderRef, row.metricLabel, row.color, row.widthM, row.lengthM, row.weightKgsOrder]),
        protectedSourceKeys,
        countsScope: row => validSourceDates.has(new Date(row.date as Date | string).toISOString().slice(0, 10)),
      })
      for (const adoption of diff.adoptions) {
        await tx.rollingDailyMetric.update({ where: { id: adoption.id }, data: { sourceKey: adoption.sourceKey } })
        const row = existingById.get(adoption.id)
        if (row) row.sourceKey = adoption.sourceKey
      }
      await assertHandoffsCoveredAfterImport(tx, 'rolling', diff.updates.map(row => existingById.get(row.id)!).filter(Boolean), [...diff.creates, ...diff.updates].map(row => ({ ...row.data, orderId: row.data.orderId as string | null })))

      for (const row of diff.updates) await tx.rollingDailyMetric.update({ where: { id: row.id }, data: { ...row.data, sourceKey: row.sourceKey } })
      let count = 0
      const batchSize = 500
      for (let i = 0; i < diff.creates.length; i += batchSize) {
        const batch = diff.creates.slice(i, i + batchSize)
        const res = await tx.rollingDailyMetric.createMany({ data: batch.map(row => ({ ...row.data, sourceKey: row.sourceKey }) as Prisma.RollingDailyMetricCreateManyInput) })
        count += res.count
      }
      const receipt = { addedCount: count, updatedCount: diff.updates.length, unchangedCount: diff.unchanged, missingInSource: diff.missingInSource, ambiguousSkipped: diff.ambiguous, invalidMetricSkipped: parseResult.invalidMetrics.length, invalidDateBlockSkipped: invalidPopulatedBlocks.length }
      await markProductionImportAttemptCommitted(tx, importAttempt, receipt)
      return receipt
    }, { timeout: 60_000, maxWait: 5_000 })

    return NextResponse.json({
      success: true,
      recordsInserted: result.addedCount,
      recordsDeleted: 0,
      recordsAdded: result.addedCount,
      recordsUpdated: result.updatedCount,
      recordsUnchanged: result.unchangedCount,
      invalidSkipped: result.invalidMetricSkipped + result.invalidDateBlockSkipped,
      ambiguousSkipped: result.ambiguousSkipped,
      missingInSource: result.missingInSource,
      datesScoped: targetDates.length,
      ambiguousOrderCount,
      fileName: file.name,
    })
  } catch (error: any) {
    if (error instanceof ProductionImportAttemptReplayError) return NextResponse.json({ success: true, ...error.receipt, replayed: true })
    if (error instanceof ProductionImportAttemptError) return NextResponse.json({ success: false, code: 'IMPORT_ATTEMPT_EXPIRED', error: error.message }, { status: 409 })
    if (error instanceof RollingDateConflictError) return NextResponse.json({ success: false, error: error.message }, { status: 422 })
    if (error instanceof HandoffImportConflict) return NextResponse.json({ success: false, code: 'HANDOFF_ACTUAL_CONFLICT', error: error.message }, { status: 409 })
    console.error('Error confirming rolling import:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Lỗi khi lưu dữ liệu Rolling vào cơ sở dữ liệu.' },
      { status: 500 }
    )
  } finally {
    isRollingImportInProgress = false
  }
}
