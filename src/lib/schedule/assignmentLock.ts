import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'

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

export function overlapWhere(machineId: string, startDay: string, endDay: string, excludeIds: string[] = []): Prisma.MachineAssignmentWhereInput {
  return {
    machineId,
    ...(excludeIds.length > 0 ? { id: { notIn: excludeIds } } : {}),
    startDate: { lte: new Date(`${endDay}T23:59:59.999+07:00`) },
    endDate: { gte: new Date(`${startDay}T00:00:00+07:00`) },
  }
}
