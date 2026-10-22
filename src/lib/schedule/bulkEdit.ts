import type { Prisma } from '@prisma/client'
import type { BulkEditBody } from '../validations/bulkEdit'
import { BulkPlanError, planBulkEdit, planHash } from './bulkPlan'
import { loadFactoryCalendar, monthKeysBetween } from './factoryCalendar'
import { scheduleDay } from './importSafety'
import { overlapWhere } from './assignmentLock'

export class StaleBulkSelection extends Error {
  constructor(public missing: string[], public changed: string[]) { super('Lịch đã thay đổi, tải lại và chọn lại.') }
}
function offsetDay(day: string, amount: number) {
  const date = new Date(day + 'T00:00:00Z'); date.setUTCDate(date.getUTCDate() + amount)
  return date.toISOString().slice(0, 10)
}

// Same server planner used by preview and by commit AFTER acquiring the table locks.
export async function prepareBulkEdit(db: Prisma.TransactionClient, body: BulkEditBody, today: string) {
  const selected = await db.machineAssignment.findMany({ where: { id: { in: body.assignments.map(row => row.id) } }, include: { order: { select: { piNumber: true, widthM: true, gsm: true, color: true, meshType: true } } } })
  const byId = new Map(selected.map(row => [row.id, row]))
  const missing = body.assignments.filter(row => !byId.has(row.id)).map(row => row.id)
  const changed = body.assignments.filter(row => byId.has(row.id) && byId.get(row.id)!.updatedAt.getTime() !== new Date(row.updatedAt).getTime()).map(row => row.id)
  if (missing.length || changed.length) throw new StaleBulkSelection(missing, changed)
  const from = offsetDay(selected.map(row => scheduleDay(row.startDate)).sort()[0], -366)
  const to = offsetDay(selected.map(row => scheduleDay(row.endDate)).sort().at(-1)!, 366)
  const machines = Array.from(new Set([...selected.map(row => row.machineId), ...(body.command === 'MOVE_MACHINE' ? [body.targetMachineId] : [])]))
  const [others, calendar, outputs] = await Promise.all([
    db.machineAssignment.findMany({ where: { id: { notIn: selected.map(row => row.id) }, OR: machines.map(machine => overlapWhere(machine, from, to)) }, include: { order: { select: { piNumber: true, widthM: true, gsm: true, color: true, meshType: true } } } }),
    loadFactoryCalendar(db, from, to),
    db.knittingDailyOutput.findMany({ where: { machineId: { in: machines }, dailyMeters: { gt: 0 }, reportDate: { gte: new Date(from+'T00:00:00Z'), lte: new Date(to+'T00:00:00Z') } }, select: { machineId: true, reportDate: true } }),
  ])
  const plan = planBulkEdit({ command: body, today, selected, others, calendar, outputs })
  // Never calculate outside the calendar loaded. Missing SHIFT months use the
  // existing Sunday default, explicitly disclosed and included in the plan hash.
  const unconfigured = new Set<string>()
  for (const change of plan.changes) {
    const first = [change.before.startDate, change.after.startDate].sort()[0]
    const last = [change.before.endDate, change.after.endDate].sort().at(-1)!
    if (first < from || last > to) throw new BulkPlanError('Khoảng dời vượt phạm vi lịch đã tải. Chọn số ngày nhỏ hơn.')
    if (body.command === 'SHIFT_DAYS') for (const month of monthKeysBetween(first, last)) {
      if (!calendar.monthlyNonWorkingWeekdaysOverride?.[month]) unconfigured.add(month)
    }
  }
  plan.warnings = Array.from(unconfigured).sort().map(yearMonth => ({ yearMonth,
    message: `Tháng ${yearMonth.slice(5)}/${yearMonth.slice(0, 4)} chưa khai báo lịch nghỉ — đang tính chỉ nghỉ Chủ nhật; ngày lễ/làm bù đã khai báo vẫn được áp dụng.`,
  }))
  return { selected, plan, planHash: planHash(plan) }
}
