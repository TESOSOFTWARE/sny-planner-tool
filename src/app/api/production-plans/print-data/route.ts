import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authError } from '@/lib/auth/session'
import { utcDay } from '@/lib/validations/productionEntry'

function nextUtcDay(day: Date) {
  return new Date(day.getTime() + 24 * 60 * 60 * 1000)
}

export async function GET(request: NextRequest) {
  const denied = await authError('GET', request, 'output.print')
  if (denied) return denied

  const stageValue = request.nextUrl.searchParams.get('stage')
  const stage = stageValue === 'extruder' || stageValue === 'knitting' ? stageValue : null
  const fromValue = request.nextUrl.searchParams.get('from') ?? ''
  const toValue = request.nextUrl.searchParams.get('to') ?? ''
  const from = utcDay(fromValue)
  const to = utcDay(toValue)
  if (!stage || !from || !to || from > to) {
    return NextResponse.json({ success: false, error: 'Công đoạn hoặc khoảng ngày in không hợp lệ.' }, { status: 422 })
  }
  const days = (to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000) + 1
  if (days > 31) return NextResponse.json({ success: false, error: 'Mỗi lần in tối đa 31 ngày.' }, { status: 422 })

  try {
    const plans = await prisma.productionOutputPlan.findMany({
      where: { stage, planDate: { gte: from, lt: nextUtcDay(to) } },
      orderBy: [{ machineId: 'asc' }, { planDate: 'asc' }, { createdAt: 'asc' }],
      take: 2000,
      include: { order: { select: { piNumber: true, subLineIndex: true, customer: true, itemCode: true, color: true, mbCode: true, widthM: true, gsm: true, productionGsm: true } } },
    })
    return NextResponse.json({
      success: true,
      stage,
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
      plans: plans.map(plan => ({
        id: plan.id,
        date: plan.planDate.toISOString().slice(0, 10),
        machineId: plan.machineId,
        shift: plan.shift,
        orderRef: plan.orderRef,
        orderId: plan.orderId,
        color: plan.color,
        metricLabel: plan.metricLabel,
        plannedValue: plan.plannedValue.toString(),
        unit: plan.unit,
        note: plan.note,
        revision: plan.revision,
        order: plan.order,
      })),
    })
  } catch {
    return NextResponse.json({ success: false, error: 'Không tải được dữ liệu in kế hoạch.' }, { status: 500 })
  }
}
