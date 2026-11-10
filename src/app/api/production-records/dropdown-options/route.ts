import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { authError } from '@/lib/auth/session'

const stages = ['extruder', 'warping', 'knitting', 'rolling', 'packing'] as const
type Stage = typeof stages[number]
const baseMetrics: Record<Stage, string[]> = {
  extruder: ['Sản lượng kéo sợi'], warping: ['Sản lượng mắc sợi'], knitting: ['Sản lượng dệt'],
  rolling: ['Số lượng cuộn', 'Trọng lượng', 'Chiều dài'], packing: ['Số lượng đóng gói', 'Trọng lượng', 'Chiều dài'],
}
const baseUnits: Record<Stage, string[]> = {
  extruder: ['kg', 'm'], warping: ['kg', 'm'], knitting: ['m', 'kg', 'cuộn'],
  rolling: ['cuộn', 'm', 'kg', 'giá trị'], packing: ['cuộn', 'm', 'kg', 'thùng'],
}

export async function GET(request: NextRequest) {
  const denied = await authError('GET', request, 'output.read')
  if (denied) return denied
  const parsed = z.enum(stages).safeParse(request.nextUrl.searchParams.get('stage'))
  if (!parsed.success) return NextResponse.json({ success: false, error: 'Công đoạn không hợp lệ.' }, { status: 422 })
  const stage: Stage = parsed.data
  try {
    const [plans, manual, orders, source] = await Promise.all([
      prisma.productionOutputPlan.findMany({ where: { stage }, select: { machineId: true, orderRef: true, color: true, metricLabel: true, unit: true }, take: 1000 }),
      prisma.manualProductionEntry.findMany({ where: { stage }, select: { machineId: true, orderRef: true, color: true, metricLabel: true, unit: true }, take: 1000 }),
      prisma.productionOrder.findMany({ where: { isPlaceholder: false }, orderBy: [{ orderDate: 'desc' }, { piNumber: 'asc' }], select: { piNumber: true, orderDate: true, color: true }, take: 2000 }),
      readStageOptions(stage),
    ])
    const orderRefs = Array.from(new Set([...orders.map(order => order.piNumber.trim()), ...plans.map(row => row.orderRef?.trim() ?? ''), ...manual.map(row => row.orderRef?.trim() ?? '')].filter(Boolean))).slice(0, 1000)
    const colors = Array.from(new Set([...source.colors, ...orders.map(order => order.color?.trim() ?? ''), ...plans.map(row => row.color?.trim() ?? ''), ...manual.map(row => row.color?.trim() ?? '')].filter(Boolean))).sort((a,b) => a.localeCompare(b))
    const machines = Array.from(new Set([...source.machines, ...plans.map(row => row.machineId?.trim() ?? ''), ...manual.map(row => row.machineId?.trim() ?? '')].filter(Boolean))).sort((a,b) => a.localeCompare(b))
    const metrics = Array.from(new Set([...baseMetrics[stage], ...source.metrics, ...plans.map(row => row.metricLabel.trim()), ...manual.map(row => row.metricLabel.trim())].filter(Boolean))).sort((a,b) => a.localeCompare(b))
    const units = Array.from(new Set([...baseUnits[stage], ...plans.map(row => row.unit.trim()), ...manual.map(row => row.unit.trim())].filter(Boolean))).sort((a,b) => a.localeCompare(b))
    return NextResponse.json({ success: true, options: { machines, colors, orderRefs, metrics, units } })
  } catch {
    return NextResponse.json({ success: false, error: 'Không tải được danh mục lựa chọn.' }, { status: 503 })
  }
}

async function readStageOptions(stage: Stage) {
  switch (stage) {
    case 'extruder': {
      const rows = await prisma.extruderDailyOutput.findMany({ distinct: ['machineId', 'color'], select: { machineId: true, color: true }, orderBy: { reportDate: 'desc' }, take: 1000 })
      return { machines: rows.map(r => r.machineId), colors: rows.map(r => r.color), metrics: [], }
    }
    case 'warping': {
      const rows = await prisma.warpingDailyOutput.findMany({ distinct: ['machineId', 'color'], select: { machineId: true, color: true }, orderBy: { reportDate: 'desc' }, take: 1000 })
      return { machines: rows.map(r => r.machineId), colors: rows.map(r => r.color), metrics: [] }
    }
    case 'knitting': {
      const rows = await prisma.knittingDailyDetail.findMany({ distinct: ['machineId', 'color'], select: { machineId: true, color: true }, orderBy: { reportDate: 'desc' }, take: 1000 })
      const schedules = await prisma.machineAssignment.findMany({ distinct: ['machineId'], select: { machineId: true }, orderBy: { machineId: 'asc' }, take: 100 })
      return { machines: [...rows.map(r => r.machineId), ...schedules.map(r => r.machineId)], colors: rows.map(r => r.color), metrics: [] }
    }
    case 'rolling': {
      const rows = await prisma.rollingDailyMetric.findMany({ distinct: ['color', 'metricLabel'], select: { color: true, metricLabel: true }, orderBy: { date: 'desc' }, take: 1000 })
      return { machines: [], colors: rows.map(r => r.color ?? ''), metrics: rows.map(r => r.metricLabel) }
    }
    case 'packing':
      return { machines: [], colors: [], metrics: [] }
  }
}
