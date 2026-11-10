import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authError } from '@/lib/auth/session'
import { productionPlanInput, utcDay, productionStages } from '@/lib/validations/productionEntry'

export async function GET(request: NextRequest) {
  const denied = await authError('GET', request, 'output.read')
  if (denied) return denied
  const stage = request.nextUrl.searchParams.get('stage')
  const date = request.nextUrl.searchParams.get('date')
  if (!stage || !productionStages.includes(stage as typeof productionStages[number]) || !date || !utcDay(date)) return NextResponse.json({ success: false, error: 'Công đoạn hoặc ngày không hợp lệ.' }, { status: 422 })
  try {
    const plans = await prisma.productionOutputPlan.findMany({ where: { stage, planDate: utcDay(date)! }, orderBy: [{ machineId: 'asc' }, { createdAt: 'asc' }], take: 500 })
    return NextResponse.json({ success: true, plans: plans.map(p => ({ ...p, planDate: p.planDate.toISOString(), plannedValue: p.plannedValue.toString() })) })
  } catch {
    return NextResponse.json({ success: false, error: 'Không tải được kế hoạch sản xuất.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const denied = await authError('POST', request, 'output.plan.create')
  if (denied) return denied
  const body = await request.json().catch(() => null)
  const parsed = productionPlanInput.safeParse(body)
  if (!parsed.success) return NextResponse.json({ success: false, error: 'Thông tin kế hoạch chưa hợp lệ.', issues: parsed.error.issues }, { status: 422 })
  const input = parsed.data, planDate = utcDay(input.date)
  if (!planDate) return NextResponse.json({ success: false, error: 'Ngày không hợp lệ.' }, { status: 422 })
  try {
    if (input.orderId) {
      const order = await prisma.productionOrder.findUnique({ where: { id: input.orderId }, select: { piNumber: true } })
      if (!order) return NextResponse.json({ success: false, error: 'Không tìm thấy item được chọn.' }, { status: 422 })
      if (input.orderRef && order.piNumber.trim().toUpperCase() !== input.orderRef.trim().toUpperCase()) return NextResponse.json({ success: false, error: 'PI nguồn không khớp item được chọn.' }, { status: 409 })
    }
    const plan = await prisma.productionOutputPlan.create({ data: {
      stage: input.stage, planDate, machineId: input.machineId || null, shift: input.shift ?? null,
      orderRef: input.orderRef || null, orderId: input.orderId || null, color: input.color || null,
      metricLabel: input.metricLabel, plannedValue: input.value, unit: input.unit, note: input.note || null,
    } })
    return NextResponse.json({ success: true, id: plan.id }, { status: 201 })
  } catch {
    return NextResponse.json({ success: false, error: 'Không lưu được kế hoạch. Vui lòng thử lại.' }, { status: 500 })
  }
}
