import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authError } from '@/lib/auth/session'
import { productionPlanUpdateInput, utcDay } from '@/lib/validations/productionEntry'

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await authError('PATCH', request, 'output.plan.update')
  if (denied) return denied
  const body = await request.json().catch(() => null)
  const parsed = productionPlanUpdateInput.safeParse(body)
  if (!parsed.success) return NextResponse.json({ success: false, error: 'Thông tin kế hoạch chưa hợp lệ.', issues: parsed.error.issues }, { status: 422 })
  const input = parsed.data, planDate = utcDay(input.date)
  if (!planDate) return NextResponse.json({ success: false, error: 'Ngày không hợp lệ.' }, { status: 422 })
  try {
    if (input.orderId) {
      const order = await prisma.productionOrder.findUnique({ where: { id: input.orderId }, select: { piNumber: true } })
      if (!order) return NextResponse.json({ success: false, error: 'Không tìm thấy item được chọn.' }, { status: 422 })
      if (input.orderRef && order.piNumber.trim().toUpperCase() !== input.orderRef.trim().toUpperCase()) return NextResponse.json({ success: false, error: 'PI nguồn không khớp item được chọn.' }, { status: 409 })
    }
    const saved = await prisma.$transaction(async tx => {
      const current = await tx.productionOutputPlan.findUnique({ where: { id: params.id } })
      if (!current || current.updatedAt.getTime() !== new Date(input.expectedUpdatedAt).getTime()) return false
      const updated = await tx.productionOutputPlan.updateMany({
        where: { id: params.id, updatedAt: current.updatedAt },
        data: {
          stage: input.stage, planDate, machineId: input.machineId || null, shift: input.shift ?? null,
          orderRef: input.orderRef || null, orderId: input.orderId || null, color: input.color || null,
          metricLabel: input.metricLabel, plannedValue: input.value, unit: input.unit, note: input.note || null,
          revision: { increment: 1 }, updatedAt: new Date(),
        },
      })
      if (!updated.count) return false
      await tx.productionPlanRevision.create({ data: { planId: current.id, revision: current.revision, payload: {
        stage: current.stage, planDate: current.planDate.toISOString(), machineId: current.machineId,
        shift: current.shift, orderRef: current.orderRef, orderId: current.orderId, color: current.color,
        metricLabel: current.metricLabel, plannedValue: current.plannedValue.toString(), unit: current.unit, note: current.note,
      } } })
      return true
    })
    if (!saved) return NextResponse.json({ success: false, error: 'Kế hoạch đã được người khác cập nhật hoặc không còn tồn tại. Hãy tải lại trước khi sửa.' }, { status: 409 })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ success: false, error: 'Không cập nhật được kế hoạch.' }, { status: 500 })
  }
}
