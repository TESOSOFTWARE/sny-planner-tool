import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { specWhere, type SpecOrder } from './specGroup'

export const ASSIGNMENT_RETRY_MESSAGE = 'Đang có thao tác khác trên lịch máy. Vui lòng thử lại.'

export function withAssignmentLock<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SET LOCAL lock_timeout = '5s'`
    await tx.$executeRaw`LOCK TABLE "machine_assignments" IN SHARE ROW EXCLUSIVE MODE`
    return fn(tx)
  }, { timeout: 15000 })
}

export function isLockRetryable(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) return false
  if (error.code === 'P2028' || error.code === 'P2034' || error.code === '55P03') return true
  // P2010 is Prisma's raw-query error. This SQLSTATE metadata shape is
  // documented/mocked, not yet verified against the approved QA database.
  if (error.code !== 'P2010' || !('meta' in error) || typeof error.meta !== 'object' || error.meta === null) return false
  return 'code' in error.meta && error.meta.code === '55P03'
}

// R-4: lịch đang nằm trong thanh xếp chung = có lịch KHÁC dòng, cùng nhóm quy cách, cùng máy, chồng ngày.
// swap/split chỉ đổi 1 dòng nên sẽ tách nhóm khó hiểu -> chặn, hướng người dùng sang Chuyển máy/Dời ngày (đi cả nhóm).
export async function groupMateCount(tx: Prisma.TransactionClient, row: { id: string; machineId: string; orderId: string; startDate: Date; endDate: Date; order?: SpecOrder | null }): Promise<number> {
  const same = specWhere(row.order)
  if (!same) return 0
  return tx.machineAssignment.count({
    where: {
      id: { not: row.id }, orderId: { not: row.orderId }, machineId: row.machineId, order: same,
      startDate: { lte: row.endDate }, endDate: { gte: row.startDate },
    },
  })
}
export const GROUPED_ASSIGNMENT_MESSAGE = (n: number) => `Lịch đang xếp chung ${n + 1} dòng. Dùng Chuyển máy hoặc Dời ngày (đi cả nhóm), hoặc Gỡ lịch rồi xếp lại.`

// group: lịch của cùng nhóm quy cách (cùng máy) không bị coi là chồng; khác nhóm hoặc thiếu dữ liệu quy cách vẫn chặn.
// R-2: chỉ miễn lịch của dòng KHÁC. ownOrderIds = các dòng đang được lưu; lịch cũ của chính các dòng này vẫn bị chặn (không tạo lịch trùng cùng dòng).
export function overlapWhere(machineId: string, startDay: string, endDay: string, excludeIds: string[] = [], group?: SpecOrder | null, ownOrderIds: string[] = []): Prisma.MachineAssignmentWhereInput {
  const same = specWhere(group)
  return {
    machineId,
    ...(same ? { NOT: { order: same, ...(ownOrderIds.length > 0 ? { orderId: { notIn: ownOrderIds } } : {}) } } : {}),
    ...(excludeIds.length > 0 ? { id: { notIn: excludeIds } } : {}),
    startDate: { lte: new Date(`${endDay}T23:59:59.999+07:00`) },
    endDate: { gte: new Date(`${startDay}T00:00:00+07:00`) },
  }
}
