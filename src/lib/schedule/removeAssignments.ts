import type { Prisma } from '@prisma/client'
import { outputFallsWithinSchedule, scheduleOutputBounds } from './importSafety'

// [FB 15/10 #2] Caller keeps these locks until its transaction commits.
export async function lockForAssignmentRemoval(tx: Prisma.TransactionClient): Promise<void> {
  await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '5s'")
  await tx.$executeRawUnsafe('LOCK TABLE "production_orders", "machine_assignments", "knitting_daily_output" IN SHARE ROW EXCLUSIVE MODE')
}

export async function removeAssignments(
  tx: Prisma.TransactionClient,
  ids: string[],
  opts: { keepWholeOrderIfAnyProtected?: boolean } = {},
) {
  const uniqueIds = Array.from(new Set(ids))
  const assignments = uniqueIds.length ? await tx.machineAssignment.findMany({
    where: { id: { in: uniqueIds } }, include: { order: { select: { piNumber: true } } },
  }) : []
  const found = new Set(assignments.map(row => row.id))
  const missing = uniqueIds.filter(id => !found.has(id))
  const bounds = assignments.map(scheduleOutputBounds)
  const outputs = assignments.length ? await tx.knittingDailyOutput.findMany({
    where: {
      machineId: { in: Array.from(new Set(assignments.map(row => row.machineId))) },
      dailyMeters: { gt: 0 },
      reportDate: { gte: new Date(Math.min(...bounds.map(row => row.gte.getTime()))), lte: new Date(Math.max(...bounds.map(row => row.lte.getTime()))) },
    },
    select: { machineId: true, reportDate: true, dailyMeters: true },
  }) : []
  const protectedIds = new Set(assignments.filter(assignment => outputs.some(output =>
    Number(output.dailyMeters) > 0 && output.machineId === assignment.machineId && outputFallsWithinSchedule(output.reportDate, assignment),
  )).map(row => row.id))
  if (opts.keepWholeOrderIfAnyProtected) {
    const protectedOrders = new Set(assignments.filter(row => protectedIds.has(row.id)).map(row => row.orderId))
    assignments.forEach(row => { if (protectedOrders.has(row.orderId)) protectedIds.add(row.id) })
  }
  const protectedRows = assignments.filter(row => protectedIds.has(row.id)).map(row => ({ id: row.id, machineId: row.machineId, piNumber: row.order.piNumber }))
  const removable = assignments.filter(row => !protectedIds.has(row.id))
  const removed = removable.map(row => row.id)
  // A missing ID invalidates the selection: even direct callers cannot partly delete it.
  if (missing.length || !removed.length) return { removed: [] as string[], protected: protectedRows, missing, logId: null as string | null }
  const log = await tx.scheduleImportLog.create({ data: {
    backupData: removable.map(row => ({
      id: row.id, machineId: row.machineId, orderId: row.orderId, piNumber: row.order.piNumber,
      startDate: row.startDate.toISOString(), endDate: row.endDate.toISOString(),
      allocatedMeters: row.allocatedMeters?.toString() ?? null,
      estimatedDailyOutput: row.estimatedDailyOutput?.toString() ?? null,
      isPlaceholder: row.isPlaceholder, endDateSource: row.endDateSource,
    })),
    summary: { action: 'bulk-remove', removed, protected: protectedRows },
  }, select: { id: true } })
  await tx.machineAssignment.deleteMany({ where: { id: { in: removed } } })
  return { removed, protected: protectedRows, missing, logId: log.id }
}
