import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { authError, currentUserFromRequest } from '@/lib/auth/session'
import { availableHandoffQuantity, handoffSourceMetricLabel, handoffUnit, lockHandoffSource, nextProductionStage } from '@/lib/production/handoffs'
import { handoffInput } from '@/lib/validations/productionHandoff'
import { utcDay } from '@/lib/validations/productionEntry'

type Context = { params: { id: string } }

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(request: NextRequest, { params }: Context) {
  const denied = await authError('GET', request, 'output.read')
  if (denied) return denied

  try {
    const order = await prisma.productionOrder.findUnique({ where: { id: params.id }, select: { id: true, orderType: true } })
    if (!order) return NextResponse.json({ success: false, error: 'Không tìm thấy dòng đơn hàng.' }, { status: 404 })

    const [handoffs, transitions] = await prisma.$transaction(async tx => {
      const rows = await tx.productionHandoff.findMany({
        where: { orderId: order.id },
        orderBy: [{ transferredAt: 'desc' }, { createdAt: 'desc' }],
        take: 300,
      })
      const capacity = await Promise.all((['extruder', 'warping', 'knitting', 'rolling'] as const).map(async fromStage => {
        const toStage = nextProductionStage(fromStage)!
        const unit = handoffUnit(fromStage, order.orderType)
        const sourceMetricLabel = handoffSourceMetricLabel(fromStage)
        const [available, transferred] = await Promise.all([
          availableHandoffQuantity(tx, order.id, fromStage),
          tx.productionHandoff.aggregate({
            where: { orderId: order.id, fromStage, sourceMetricLabel, unit, voidedAt: null },
            _sum: { quantity: true },
          }),
        ])
        const totalTransferred = transferred._sum.quantity
        return {
          fromStage,
          toStage,
          sourceMetricLabel,
          unit,
          available: available?.toFixed(2) ?? null,
          transferred: totalTransferred?.toFixed(2) ?? '0.00',
          remaining: available?.minus(totalTransferred ?? new Prisma.Decimal(0)).toFixed(2) ?? null,
        }
      }))
      return [rows, capacity] as const
    })

    return NextResponse.json({
      success: true,
      handoffs: handoffs.map(row => ({ ...row, quantity: row.quantity.toString(), transferredAt: row.transferredAt.toISOString(), createdAt: row.createdAt.toISOString(), voidedAt: row.voidedAt?.toISOString() ?? null })),
      transitions,
    })
  } catch (error) {
    console.error('[GET /api/orders/[id]/handoffs]', error)
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2021') {
      return NextResponse.json({ success: false, code: 'HANDOFF_SCHEMA_NOT_READY', error: 'Database này chưa có bảng bàn giao WIP. Cần áp migration 20261116_production_handoffs.sql vào đúng môi trường trước khi tải lịch sử.' }, { status: 503 })
    }
    return NextResponse.json({ success: false, error: 'Không tải được lịch sử bàn giao.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: Context) {
  const denied = await authError('POST', request, 'output.actual.enter')
  if (denied) return denied
  const actor = await currentUserFromRequest(request)
  if (!actor) return NextResponse.json({ success: false, error: 'Vui lòng đăng nhập.' }, { status: 401 })

  const parsed = handoffInput.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues.map(issue => issue.message).join(' ') }, { status: 422 })
  const input = parsed.data
  const transferredAt = utcDay(input.date)
  if (!transferredAt) return NextResponse.json({ success: false, error: 'Ngày không hợp lệ.' }, { status: 422 })
  const toStage = nextProductionStage(input.fromStage)
  if (!toStage) return NextResponse.json({ success: false, error: 'Công đoạn bàn giao không hợp lệ.' }, { status: 422 })

  try {
    const outcome = await prisma.$transaction(async tx => {
      await tx.$executeRaw`SET LOCAL lock_timeout = '5s'`
      // Keep lock order consistent with report imports (source table before PO row),
      // otherwise an import inserting FK-linked rows could deadlock this transfer.
      await lockHandoffSource(tx, input.fromStage)
      const lockedOrders = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "production_orders" WHERE "id" = ${params.id} FOR UPDATE`
      if (!lockedOrders.length) return { kind: 'NOT_FOUND' as const }

      const order = await tx.productionOrder.findUnique({ where: { id: params.id }, select: { id: true, orderType: true, isDraft: true, isPlaceholder: true, lifecycleStatus: true } })
      if (!order) return { kind: 'NOT_FOUND' as const }
      if (order.isDraft || order.isPlaceholder || order.lifecycleStatus !== 'APPROVED') return { kind: 'ORDER_NOT_APPROVED' as const }

      const unit = handoffUnit(input.fromStage, order.orderType)
      const sourceMetricLabel = handoffSourceMetricLabel(input.fromStage)
      const available = await availableHandoffQuantity(tx, order.id, input.fromStage)
      if (available === null) return { kind: 'SOURCE_MISSING' as const, unit }

      const existing = await tx.productionHandoff.aggregate({
        where: { orderId: order.id, fromStage: input.fromStage, toStage, sourceMetricLabel, unit, voidedAt: null },
        _sum: { quantity: true },
      })
      const alreadyTransferred = existing._sum.quantity ?? new Prisma.Decimal(0)
      const requested = new Prisma.Decimal(input.quantity)
      if (alreadyTransferred.plus(requested).greaterThan(available)) {
        return { kind: 'EXCEEDS_AVAILABLE' as const, unit, available: available.toFixed(2), alreadyTransferred: alreadyTransferred.toFixed(2) }
      }

      const handoff = await tx.productionHandoff.create({ data: {
        orderId: order.id,
        fromStage: input.fromStage,
        toStage,
        sourceMetricLabel,
        quantity: requested,
        unit,
        transferredAt,
        shift: input.shift,
        handedOffBy: input.handedOffBy,
        receivedBy: input.receivedBy,
        note: input.note || null,
        createdByEmail: actor.email,
      } })
      return { kind: 'CREATED' as const, handoff: { id: handoff.id, quantity: handoff.quantity.toString(), unit: handoff.unit, fromStage: handoff.fromStage, toStage: handoff.toStage } }
    }, { timeout: 10_000, maxWait: 5_000 })

    if (outcome.kind === 'NOT_FOUND') return NextResponse.json({ success: false, error: 'Không tìm thấy dòng đơn hàng.' }, { status: 404 })
    if (outcome.kind === 'ORDER_NOT_APPROVED') return NextResponse.json({ success: false, error: 'Chỉ bàn giao WIP cho dòng PO đã duyệt.' }, { status: 409 })
    if (outcome.kind === 'SOURCE_MISSING') return NextResponse.json({ success: false, error: `Chưa có actual liên kết theo item để bàn giao (${outcome.unit}).` }, { status: 409 })
    if (outcome.kind === 'EXCEEDS_AVAILABLE') return NextResponse.json({ success: false, error: `Số lượng vượt phần còn khả dụng. Actual: ${outcome.available} ${outcome.unit}; đã bàn giao: ${outcome.alreadyTransferred} ${outcome.unit}.` }, { status: 409 })
    return NextResponse.json({ success: true, handoff: outcome.handoff }, { status: 201 })
  } catch (error) {
    console.error('[POST /api/orders/[id]/handoffs]', error)
    return NextResponse.json({ success: false, error: 'Không lưu được bàn giao WIP. Vui lòng thử lại.' }, { status: 500 })
  }
}
