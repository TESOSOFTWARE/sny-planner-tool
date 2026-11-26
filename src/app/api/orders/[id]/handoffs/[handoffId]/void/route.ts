import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authError, currentUserFromRequest } from '@/lib/auth/session'
import { handoffVoidInput } from '@/lib/validations/productionHandoff'

type Context = { params: { id: string; handoffId: string } }

export async function POST(request: NextRequest, { params }: Context) {
  const denied = await authError('POST', request, 'output.actual.enter')
  if (denied) return denied
  const actor = await currentUserFromRequest(request)
  if (!actor) return NextResponse.json({ success: false, error: 'Vui lòng đăng nhập.' }, { status: 401 })

  const parsed = handoffVoidInput.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ success: false, error: 'Cần ghi lý do hủy bàn giao.' }, { status: 422 })

  try {
    const outcome = await prisma.$transaction(async tx => {
      const order = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "production_orders" WHERE "id" = ${params.id} FOR UPDATE`
      if (!order.length) return 'NOT_FOUND'
      const handoff = await tx.productionHandoff.findFirst({ where: { id: params.handoffId, orderId: params.id } })
      if (!handoff) return 'HANDOFF_NOT_FOUND'
      if (handoff.voidedAt) return 'ALREADY_VOIDED'
      await tx.productionHandoff.update({ where: { id: handoff.id }, data: { voidedAt: new Date(), voidedByEmail: actor.email, voidReason: parsed.data.reason } })
      return 'VOIDED'
    }, { timeout: 10_000, maxWait: 5_000 })

    if (outcome === 'NOT_FOUND') return NextResponse.json({ success: false, error: 'Không tìm thấy dòng đơn hàng.' }, { status: 404 })
    if (outcome === 'HANDOFF_NOT_FOUND') return NextResponse.json({ success: false, error: 'Không tìm thấy bản ghi bàn giao.' }, { status: 404 })
    if (outcome === 'ALREADY_VOIDED') return NextResponse.json({ success: false, error: 'Bản ghi này đã được hủy.' }, { status: 409 })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[POST /api/orders/[id]/handoffs/[handoffId]/void]', error)
    return NextResponse.json({ success: false, error: 'Không hủy được bản ghi bàn giao.' }, { status: 500 })
  }
}
