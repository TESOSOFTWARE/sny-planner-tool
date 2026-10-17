import { scheduleDay } from './importSafety'

export type SelectableAssignment = { id: string; machineId: string; startDate: string; endDate: string; order: { piNumber: string; customer: string } }
export type AssignmentFilters = { machines: readonly string[]; status: 'ALL' | 'FUTURE' | 'STARTED'; search: string }
export const canBulkEditAssignment = (row: Pick<SelectableAssignment, 'startDate'>, today: string) => scheduleDay(row.startDate) > today

export function filterAssignments<T extends SelectableAssignment>(rows: readonly T[], filter: AssignmentFilters, today: string): T[] {
  const query = filter.search.trim().toLocaleLowerCase('vi-VN')
  return rows.filter(row => (!filter.machines.length || filter.machines.includes(row.machineId))
    && (filter.status === 'ALL' || (filter.status === 'FUTURE') === canBulkEditAssignment(row, today))
    && (!query || `${row.order.piNumber} ${row.order.customer}`.toLocaleLowerCase('vi-VN').includes(query)))
    .sort((a, b) => a.machineId.localeCompare(b.machineId) || scheduleDay(a.startDate).localeCompare(scheduleDay(b.startDate)) || a.id.localeCompare(b.id))
}

export function selectionState(ids: readonly string[], selected: ReadonlySet<string>) {
  const count = ids.filter(id => selected.has(id)).length
  return { checked: ids.length > 0 && count === ids.length, mixed: count > 0 && count < ids.length }
}

/** Page/machine/filter selection preserves other choices; never silently exceeds the API cap. */
export function selectAssignments(selected: ReadonlySet<string>, ids: readonly string[], checked: boolean) {
  const group = new Set(ids)
  // An explicit "first 500" action must really select the first 500, even
  // when a later page was selected earlier. Never discard outside choices.
  const replaceWithinGroup = checked && group.size > 500 && Array.from(selected).every(id => group.has(id))
  const next = replaceWithinGroup ? new Set<string>() : new Set(selected)
  let limited = false
  for (const id of ids) {
    if (!checked) next.delete(id)
    else if (!next.has(id)) { if (next.size >= 500) limited = true; else next.add(id) }
  }
  return { selected: next, limited }
}
