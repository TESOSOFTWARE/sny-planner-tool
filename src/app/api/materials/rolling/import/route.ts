// src/app/api/materials/rolling/import/route.ts
// POST /api/materials/rolling/import — Preview & dry-run parse for uploaded Rolling report file.

import { NextRequest, NextResponse } from 'next/server'
import { parseRollingReport, RollingDateConflictError } from '@/lib/excel/parseRollingReport'
import { prisma } from '@/lib/db'
import { rollingPeriodFromFileName, validateRollingPeriod } from '@/lib/materials/rollingPeriod'
import { rollingImportSnapshot } from '@/lib/materials/rollingImportSnapshot'
import { compareRollingDays } from '@/lib/materials/rollingImportSafety'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null

    if (!(file instanceof Blob) || typeof file.name !== 'string') {
      return NextResponse.json({ success: false, error: 'Vui lòng tải lên file Excel báo cáo sản lượng.' }, { status: 400 })
    }

    if (!file.name.toLowerCase().endsWith('.xlsx')) return NextResponse.json({ success: false, error: 'Chỉ nhận file .xlsx.' }, { status: 400 })
    const hasSelectedPeriod = formData.has('month') || formData.has('year')
    const period = hasSelectedPeriod ? validateRollingPeriod(formData.get('month'), formData.get('year')) : rollingPeriodFromFileName(file.name)
    if (!period) return NextResponse.json({ success: false, periodRequired: true, error: 'Vui lòng chọn tháng và năm hợp lệ để xem trước.' }, { status: 400 })

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    // Dry-run parse sheet ROLLING
    const parseResult = parseRollingReport(buffer, file.name, period)

    const expectedSnapshot = rollingImportSnapshot(buffer, period)

    // Match orderRefs against ProductionOrder in DB
    const dbOrders = await prisma.productionOrder.findMany({
      select: { id: true, piNumber: true },
    })
    const piMap = new Map<string, string | null>()
    for (const o of dbOrders) {
      const key = o.piNumber.trim().toUpperCase()
      piMap.set(key, piMap.has(key) ? null : o.id)
    }

    let matchedOrderCount = 0
    const sampleRows = parseResult.metrics.slice(0, 10).map((m) => {
      const orderId = m.orderRef ? (piMap.get(m.orderRef.trim().toUpperCase()) ?? null) : null
      if (orderId) matchedOrderCount++
      return {
        ...m,
        orderId,
      }
    })

    const uniqueOrders = Array.from(new Set(parseResult.metrics.map((m) => m.orderRef).filter(Boolean)))
    const dates = Array.from(new Set(parseResult.metrics.map((m) => m.date))).sort()
    const existing = dates.length ? await prisma.rollingDailyMetric.findMany({
      where: { date: { in: dates.map(date => new Date(date)) } }, select: { date: true, orderRef: true },
    }) : []
    const replacementDays = compareRollingDays(existing, parseResult.metrics)

    return NextResponse.json({
      success: true,
      fileName: file.name,
      period,
      expectedSnapshot,
      skippedDateBlocks: parseResult.dateBlockMappings.filter(block => !block.isoDate),
      totalMetrics: parseResult.metrics.length,
      totalOrderRows: parseResult.totalOrderRows,
      summarySkipped: parseResult.summarySkipped,
      uniqueOrdersCount: uniqueOrders.length,
      dateRange: dates.length > 0 ? `${dates[0]} → ${dates[dates.length - 1]}` : 'N/A',
      dates,
      replacementDays,
      sampleRows,
    })
  } catch (error: any) {
    if (error instanceof RollingDateConflictError) return NextResponse.json({ success: false, error: error.message }, { status: 422 })
    console.error('Error parsing rolling report:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Không thể đọc file báo cáo Rolling.' },
      { status: 400 }
    )
  }
}
