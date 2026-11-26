import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { authError } from '@/lib/auth/session'
import { prisma } from '@/lib/db'
import { productionPiResolver } from '@/lib/excel/productionPi'
import { aggregateProductionProgress, type ProgressValueInput } from '@/lib/production/progressSummary'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)

function rollingMetric(label: string, orderTypes: Set<string>): { metricLabel: string; unit: string } {
  const normalized = label.trim().toUpperCase().replace(/\s+/g, ' ')
  if (/^TOTAL\s*\(?M\)?(?:\s|$)/.test(normalized)) return { metricLabel: 'Chiều dài', unit: 'm' }
  if (normalized.startsWith('WEIGHT')) return { metricLabel: 'Trọng lượng', unit: 'kg' }
  if (normalized.startsWith('QUANTITY') && orderTypes.size === 1) {
    const orderType = Array.from(orderTypes)[0]
    if (orderType === 'rolls') return { metricLabel: 'Số lượng cuộn', unit: 'cuộn' }
    if (orderType === 'pieces') return { metricLabel: 'Số lượng tấm', unit: 'tấm' }
  }
  return { metricLabel: label, unit: 'chưa xác định' }
}

export async function GET(request: NextRequest) {
  const denied = await authError('GET', request, 'output.read')
  if (denied) return denied

  const month = monthSchema.safeParse(request.nextUrl.searchParams.get('month'))
  if (!month.success) return NextResponse.json({ success: false, error: 'Chọn tháng báo cáo theo dạng YYYY-MM.' }, { status: 422 })

  const [year, monthNumber] = month.data.split('-').map(Number)
  const from = new Date(Date.UTC(year, monthNumber - 1, 1))
  const to = new Date(Date.UTC(year, monthNumber, 1))

  try {
    const [orders, plans, extruder, warping, knitting, rolling] = await Promise.all([
      prisma.productionOrder.findMany({ select: { id: true, piNumber: true, orderType: true } }),
      prisma.productionOutputPlan.findMany({
        where: { planDate: { gte: from, lt: to } },
        select: { orderId: true, orderRef: true, stage: true, metricLabel: true, unit: true, plannedValue: true },
      }),
      prisma.extruderDailyOutput.findMany({
        where: { reportDate: { gte: from, lt: to } },
        select: { orderId: true, orderRef: true, weightKgs: true, reportDate: true },
      }),
      prisma.warpingDailyOutput.findMany({
        where: { reportDate: { gte: from, lt: to } },
        select: { orderId: true, orderRef: true, quantity: true, weightKgs: true, reportDate: true },
      }),
      prisma.knittingDailyDetail.findMany({
        where: { reportDate: { gte: from, lt: to } },
        select: { orderId: true, orderRef: true, mValue: true, weightKgs: true, reportDate: true },
      }),
      prisma.rollingDailyMetric.findMany({
        where: { date: { gte: from, lt: to } },
        select: { orderId: true, orderRef: true, metricLabel: true, metricValue: true, date: true },
      }),
    ])

    const piByOrderId = new Map(orders.map(order => [order.id, order.piNumber]))
    const orderTypesByPi = new Map<string, Set<string>>()
    for (const order of orders) {
      const key = order.piNumber.trim().toUpperCase().replace(/\s+/g, '')
      orderTypesByPi.set(key, new Set(Array.from(orderTypesByPi.get(key) ?? []).concat(order.orderType)))
    }
    const resolvePi = productionPiResolver(orders.map(order => order.piNumber))
    const values: ProgressValueInput[] = []
    let unmatchedActualMetrics = 0
    const add = (row: { orderId: string | null; orderRef: string | null }, input: Omit<ProgressValueInput, 'piNumber'>) => {
      const pi = row.orderId ? piByOrderId.get(row.orderId) ?? null : resolvePi(row.orderRef)
      if (!pi) { if (input.kind === 'actual') unmatchedActualMetrics++; return }
      values.push({ ...input, piNumber: pi })
    }
    const num = (value: unknown) => value == null ? 0 : Number(value)

    for (const row of plans) {
      add(row, { stage: row.stage, metricLabel: row.metricLabel, unit: row.unit, kind: 'plan', value: num(row.plannedValue) })
    }
    for (const row of extruder) add(row, { stage: 'extruder', metricLabel: 'Sản lượng kéo sợi', unit: 'kg', kind: 'actual', value: num(row.weightKgs), reportDate: row.reportDate.toISOString().slice(0, 10) })
    for (const row of warping) {
      add(row, { stage: 'warping', metricLabel: 'Sản lượng mắc sợi', unit: 'kg', kind: 'actual', value: num(row.weightKgs), reportDate: row.reportDate.toISOString().slice(0, 10) })
      if (row.quantity != null) add(row, { stage: 'warping', metricLabel: 'Sản lượng mắc sợi', unit: 'beam', kind: 'actual', value: num(row.quantity), reportDate: row.reportDate.toISOString().slice(0, 10) })
    }
    for (const row of knitting) {
      if (row.mValue != null) add(row, { stage: 'knitting', metricLabel: 'Sản lượng dệt', unit: 'm', kind: 'actual', value: num(row.mValue), reportDate: row.reportDate.toISOString().slice(0, 10) })
      add(row, { stage: 'knitting', metricLabel: 'Sản lượng dệt', unit: 'kg', kind: 'actual', value: num(row.weightKgs), reportDate: row.reportDate.toISOString().slice(0, 10) })
    }
    for (const row of rolling) {
      if (row.metricValue == null) continue
      const pi = row.orderId ? piByOrderId.get(row.orderId) ?? null : resolvePi(row.orderRef)
      const orderKey = pi?.trim().toUpperCase().replace(/\s+/g, '') ?? ''
      const metric = rollingMetric(row.metricLabel, orderTypesByPi.get(orderKey) ?? new Set())
      add(row, { stage: 'rolling', metricLabel: metric.metricLabel, unit: metric.unit, kind: 'actual', value: num(row.metricValue), reportDate: row.date.toISOString().slice(0, 10) })
    }

    const progress = aggregateProductionProgress(values)
    const orderPiSet = new Set(orders.map(order => order.piNumber.trim().toUpperCase().replace(/\s+/g, '')))
    return NextResponse.json({ success: true, month: month.data, progress, piCount: new Set(progress.map(row => row.piNumber)).size, unmatchedActualMetrics, orderCount: orderPiSet.size })
  } catch (error) {
    console.error('[GET /api/orders/progress-summary]', error)
    return NextResponse.json({ success: false, error: 'Không tải được tiến độ kế hoạch và actual.' }, { status: 500 })
  }
}
