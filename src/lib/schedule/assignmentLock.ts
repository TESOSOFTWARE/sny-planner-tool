import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { specWhere, type SpecOrder } from './specGroup'
import { scheduleDay } from './importSafety'

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

// R-5: cùng máy/quy cách và cùng ngày bắt đầu/kết thúc ở múi giờ VN.
type GroupRow = { id: string; machineId: string; orderId: string; startDate: Date; endDate: Date; order?: SpecOrder | null }

function groupWhere(row: GroupRow) {
  const same = specWhere(row.order)
  if (!same) return null
  return {
    machineId: row.machineId, order: same,
    startDate: {
      gte: new Date(`${scheduleDay(row.startDate)}T00:00:00+07:00`),
      lte: new Date(`${scheduleDay(row.startDate)}T23:59:59.999+07:00`),
    },
    endDate: {
      gte: new Date(`${scheduleDay(row.endDate)}T00:00:00+07:00`),
      lte: new Date(`${scheduleDay(row.endDate)}T23:59:59.999+07:00`),
    },
  }
}

// Đếm bạn KHÁC dòng cho các thao tác chỉ đổi một dòng (swap).
export async function groupMateCount(tx: Prisma.TransactionClient, row: GroupRow): Promise<number> {
  const where = groupWhere(row)
  if (!where) return 0
  return tx.machineAssignment.count({
    where: { ...where, id: { not: row.id }, orderId: { not: row.orderId } },
  })
}

// Nạp cả nguồn và các lịch trùng dòng để split phát hiện dữ liệu cũ không hợp lệ.
export async function groupMembers(tx: Prisma.TransactionClient, row: GroupRow) {
  const where = groupWhere(row)
  if (!where) return null
  return tx.machineAssignment.findMany({ where, include: { order: true }, orderBy: { id: 'asc' } })
}

export const GROUPED_ASSIGNMENT_MESSAGE = (n: number, notStarted = false) => notStarted
  ? `Lịch đang xếp chung ${n + 1} dòng và chưa bắt đầu: tick thanh nhóm rồi dùng Chuyển máy/Dời ngày (đi cả nhóm).`
  : `Lịch đang xếp chung ${n + 1} dòng. Dùng Chuyển máy hoặc Dời ngày (đi cả nhóm), hoặc Gỡ lịch rồi xếp lại.`

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
