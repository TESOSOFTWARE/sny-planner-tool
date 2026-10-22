import { createHash } from 'node:crypto'
import type { BulkEditCommand } from '../validations/bulkEdit'
import { scheduleDay, outputFallsWithinSchedule } from './importSafety'
import { sameSpecGroup, type SpecOrder } from './specGroup'
import { calculateProductionSchedule, countWorkingDays, shiftWorkingDays, type FactoryCalendar } from './productionDuration'

export interface AssignmentLite {
  id: string; machineId: string; startDate: Date; endDate: Date; orderId?: string; order: { piNumber: string } & SpecOrder
}
type Interval = { machineId: string; startDate: string; endDate: string }
export interface BulkEditPlan {
  changes: { id: string; machineId: string; piNumber: string; orderId?: string; spec?: SpecOrder; before: Interval; after: Interval; workingDays: number }[]
  excluded: { id: string; piNumber: string; reason: 'STARTED' | 'HAS_OUTPUT' | 'ALREADY_ON_TARGET' }[]
  warnings: { yearMonth: string; message: string }[]
  conflicts: { id: string; piNumber: string; withId: string; withPiNumber: string; machineId: string; from: string; to: string; reason: 'OVERLAP' | 'PAST' | 'HAS_OUTPUT' }[]
}
export class BulkPlanError extends Error {}
const interval = (row: AssignmentLite): Interval => ({ machineId: row.machineId, startDate: scheduleDay(row.startDate), endDate: scheduleDay(row.endDate) })
const overlapping = (a: Interval, b: Interval) => a.machineId === b.machineId && a.startDate <= b.endDate && a.endDate >= b.startDate

// [FB 15/10 #2b] Pure GĐ1 planner; no writes, no cascade, no production estimates.
export function planBulkEdit(input: {
  command: BulkEditCommand; today: string; selected: AssignmentLite[]; others: AssignmentLite[]
  calendar: FactoryCalendar; outputs: { machineId: string; reportDate: Date }[]
}): BulkEditPlan {
  const { command, today, selected, calendar, outputs } = input
  const plan: BulkEditPlan = { changes: [], excluded: [], conflicts: [], warnings: [] }
  for (const row of [...selected].sort((a, b) => a.id.localeCompare(b.id))) {
    const before = interval(row), piNumber = row.order.piNumber
    if (before.startDate <= today) { plan.excluded.push({ id: row.id, piNumber, reason: 'STARTED' }); continue }
    if (outputs.some(output => output.machineId === row.machineId && outputFallsWithinSchedule(output.reportDate, row))) {
      plan.excluded.push({ id: row.id, piNumber, reason: 'HAS_OUTPUT' }); continue
    }
    if (command.command === 'MOVE_MACHINE' && row.machineId === command.targetMachineId) {
      plan.excluded.push({ id: row.id, piNumber, reason: 'ALREADY_ON_TARGET' }); continue
    }
    const workingDays = countWorkingDays(calendar, before.startDate, before.endDate)
    if (workingDays === null || before.endDate < before.startDate) throw new BulkPlanError('Khoảng ngày lịch không hợp lệ.')
    const after = { ...before }
    if (command.command === 'MOVE_MACHINE') {
      after.machineId = command.targetMachineId
    } else {
      const start = shiftWorkingDays(calendar, before.startDate, command.workingDays)
      const estimate = start && workingDays > 0 ? calculateProductionSchedule(start, workingDays, 1, calendar) : null
      if (!estimate) throw new BulkPlanError('Không tính được ngày làm việc để dời lịch. Kiểm tra cấu hình lịch nhà máy.')
      after.startDate = estimate.effectiveStartDate; after.endDate = estimate.computedEndDate
      if (after.startDate <= today) plan.conflicts.push({ id: row.id, piNumber, withId: row.id, withPiNumber: piNumber, machineId: row.machineId, from: after.startDate, to: after.endDate, reason: 'PAST' })
    }
    plan.changes.push({ id: row.id, machineId: row.machineId, piNumber, orderId: row.orderId, spec: row.order, before, after, workingDays })
  }
  const changedIds = new Set(plan.changes.map(row => row.id))
  // Excluded selected rows remain real obstacles; selected rows moving away do not.
  const stationary = [...input.others, ...selected.filter(row => !changedIds.has(row.id))]
  for (const change of plan.changes) {
    const obstacles = [
      ...stationary.map(row => ({ id: row.id, piNumber: row.order.piNumber, orderId: row.orderId, spec: row.order as SpecOrder, range: interval(row) })),
      ...plan.changes.filter(row => row.id !== change.id).map(row => ({ id: row.id, piNumber: row.piNumber, orderId: row.orderId, spec: row.spec, range: row.after })),
    ]
    for (const obstacle of obstacles) // [FB 22/10 ý 3] Cùng máy + cùng nhóm quy cách được chồng ngày (xếp chung); khác nhóm vẫn là xung đột.
    if (obstacle.id !== change.id && overlapping(change.after, obstacle.range) && !(sameSpecGroup(change.spec, obstacle.spec) && change.orderId !== obstacle.orderId)) {
      plan.conflicts.push({ id: change.id, piNumber: change.piNumber, withId: obstacle.id, withPiNumber: obstacle.piNumber, machineId: change.after.machineId,
        from: change.after.startDate > obstacle.range.startDate ? change.after.startDate : obstacle.range.startDate,
        to: change.after.endDate < obstacle.range.endDate ? change.after.endDate : obstacle.range.endDate, reason: 'OVERLAP' })
    }
    for (const output of outputs) {
      const day = output.reportDate.toISOString().slice(0, 10)
      if (output.machineId === change.after.machineId && day >= change.after.startDate && day <= change.after.endDate) {
        plan.conflicts.push({ id: change.id, piNumber: change.piNumber, withId: `output:${output.machineId}:${day}`, withPiNumber: 'Sản lượng đã nhập', machineId: output.machineId, from: day, to: day, reason: 'HAS_OUTPUT' })
      }
    }
  }
  plan.conflicts = Array.from(new Map(plan.conflicts.map(row => [JSON.stringify(row), row])).values())
    .sort((a, b) => a.id.localeCompare(b.id) || a.withId.localeCompare(b.withId) || a.from.localeCompare(b.from))
  return plan
}

export function planHash(plan: BulkEditPlan): string {
  const canonical = {
    changes: [...plan.changes].sort((a, b) => a.id.localeCompare(b.id)),
    excluded: [...plan.excluded].sort((a, b) => a.id.localeCompare(b.id)),
    conflicts: [...plan.conflicts].sort((a, b) => a.id.localeCompare(b.id) || a.withId.localeCompare(b.withId) || a.from.localeCompare(b.from)),
    warnings: [...plan.warnings].sort((a, b) => a.yearMonth.localeCompare(b.yearMonth)),
  }
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex')
}
