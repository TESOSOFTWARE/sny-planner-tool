// [FB 15/10 #1, D4; P1–P8] Explicit selection; no order audit schema in this tranche.
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { lockForAssignmentRemoval, removeAssignments } from '@/lib/schedule/removeAssignments'
import { isLockRetryable, ASSIGNMENT_RETRY_MESSAGE } from '@/lib/schedule/assignmentLock'

export const maxDuration = 60
const schema = z.object({
  ids: z.array(z.string().trim().min(1)).min(1).max(500),
  removeAssignments: z.boolean(),
  expectedAssignments: z.array(z.object({ id: z.string().min(1), updatedAt: z.string().datetime({ offset: true }) }).strict()).max(2000),
}).strict().refine(body => new Set(body.ids).size === body.ids.length && new Set(body.expectedAssignments.map(row => row.id)).size === body.expectedAssignments.length, 'ID không được trùng')

class StaleSelection extends Error {
  constructor(public added: string[], public missing: string[], public changed: string[]) { super('Lịch đã thay đổi, tải lại và chọn lại.') }
}
type Reason = 'NOT_FOUND' | 'HAS_OUTPUT' | 'ASSIGNED' | 'HAS_OUTPUT_ON_SCHEDULE'

export async function POST(request: Request) {
  let body: unknown
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Dữ liệu JSON không hợp lệ.' }, { status: 422 }) }
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Chọn từ 1 đến 500 đơn khác nhau và gửi đủ thông tin lịch đã xác nhận.' }, { status: 422 })
  const { ids, expectedAssignments, removeAssignments: allowRemoval } = parsed.data
  try {
    const result = await prisma.$transaction(async tx => {
      await lockForAssignmentRemoval(tx)
      await tx.$executeRawUnsafe('LOCK TABLE "extruder_daily_output", "warping_daily_output", "knitting_daily_detail", "rolling_daily_metrics", "material_transactions" IN SHARE MODE')
      const assignments = await tx.machineAssignment.findMany({ where: { orderId: { in: ids } } })
      const expected = new Map(expectedAssignments.map(row => [row.id, row.updatedAt]))
      const actual = new Map(assignments.map(row => [row.id, row.updatedAt]))
      const added = assignments.filter(row => !expected.has(row.id)).map(row => row.id)
      const missing = expectedAssignments.filter(row => !actual.has(row.id)).map(row => row.id)
      const changed = assignments.filter(row => expected.has(row.id) && row.updatedAt.getTime() !== new Date(expected.get(row.id)!).getTime()).map(row => row.id)
      if (added.length || missing.length || changed.length) throw new StaleSelection(added, missing, changed)

      const orders = await tx.productionOrder.findMany({ where: { id: { in: ids } }, select: { id: true, piNumber: true, subLineIndex: true } })
      const byId = new Map(orders.map(row => [row.id, row]))
      const outputWhere = { where: { orderId: { in: ids } }, select: { orderId: true } } as const
      const outputRows = [
        ...await tx.extruderDailyOutput.findMany(outputWhere), ...await tx.warpingDailyOutput.findMany(outputWhere),
        ...await tx.knittingDailyDetail.findMany(outputWhere), ...await tx.rollingDailyMetric.findMany(outputWhere),
      ]
      const outputOrderIds = new Set(outputRows.map(row => row.orderId))
      // MaterialTransaction.orderId stores PI TEXT, not a ProductionOrder ID.
      const slips = orders.length ? await tx.materialTransaction.findMany({
        where: { OR: Array.from(new Set(orders.map(row => row.piNumber))).map(pi => ({ orderId: { equals: pi, mode: 'insensitive' as const } })) },
        select: { orderId: true },
      }) : []
      const slipPis = new Set(slips.map(row => row.orderId?.trim().toLowerCase()))
      const skipped: { id: string; piNumber: string | null; reason: Reason; machines?: string[] }[] = []
      const candidates = []
      for (const id of ids) {
        const order = byId.get(id)
        if (!order) { skipped.push({ id, piNumber: null, reason: 'NOT_FOUND' }); continue }
        const assigned = assignments.filter(row => row.orderId === id)
        if (outputOrderIds.has(id) || slipPis.has(order.piNumber.trim().toLowerCase())) { skipped.push({ id, piNumber: order.piNumber, reason: 'HAS_OUTPUT' }); continue }
        if (assigned.length && !allowRemoval) { skipped.push({ id, piNumber: order.piNumber, reason: 'ASSIGNED', machines: Array.from(new Set(assigned.map(row => row.machineId))) }); continue }
        candidates.push(order)
      }
      const candidateIds = new Set(candidates.map(row => row.id))
      const candidateAssignments = assignments.filter(row => candidateIds.has(row.orderId))
      const removal = await removeAssignments(tx, candidateAssignments.map(row => row.id), { keepWholeOrderIfAnyProtected: true })
      if (removal.missing.length) throw new StaleSelection([], removal.missing, [])
      const protectedAssignmentIds = new Set(removal.protected.map(row => row.id))
      const protectedOrders = new Set(candidateAssignments.filter(row => protectedAssignmentIds.has(row.id)).map(row => row.orderId))
      const deleted = candidates.filter(order => !protectedOrders.has(order.id))
      for (const order of candidates.filter(row => protectedOrders.has(row.id))) skipped.push({ id: order.id, piNumber: order.piNumber, reason: 'HAS_OUTPUT_ON_SCHEDULE', machines: Array.from(new Set(candidateAssignments.filter(row => row.orderId === order.id).map(row => row.machineId))) })
      if (deleted.length) await tx.productionOrder.deleteMany({ where: { id: { in: deleted.map(row => row.id) } } })
      return { deleted, removedAssignments: removal.removed.length, skipped, ...(removal.logId ? { logId: removal.logId } : {}) }
    }, { timeout: 60_000, maxWait: 5_000 })
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof StaleSelection) return NextResponse.json({ error: error.message, code: 'STALE_SELECTION', added: error.added, missing: error.missing, changed: error.changed }, { status: 409 })
    if (isLockRetryable(error)) return NextResponse.json({ error: ASSIGNMENT_RETRY_MESSAGE, retryable: true }, { status: 409 })
    console.error('[BULK_DELETE_ORDERS]', error)
    return NextResponse.json({ error: 'Không thể xoá đơn hàng. Vui lòng thử lại.' }, { status: 500 })
  }
}
