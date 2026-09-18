type Range = { machineId: string; startDate: Date | string; endDate: Date | string }
type ExistingRange = Range & { id: string }

export function scheduleDay(value: Date | string): string {
  return new Date(new Date(value).getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

export function scheduleOutputBounds(assignment: Pick<Range, 'startDate' | 'endDate'>) {
  return {
    gte: new Date(`${scheduleDay(assignment.startDate)}T00:00:00Z`),
    lte: new Date(`${scheduleDay(assignment.endDate)}T00:00:00Z`),
  }
}

// Report dates are date-only values stored at UTC midnight. Schedule dates
// represent calendar days in Vietnam; compare their day labels inclusively.
export function outputFallsWithinSchedule(reportDate: Date, assignment: Pick<Range, 'startDate' | 'endDate'>): boolean {
  const day = reportDate.toISOString().slice(0, 10)
  return day >= scheduleDay(assignment.startDate) && day <= scheduleDay(assignment.endDate)
}

function overlaps(a: Range, b: Range): boolean {
  return a.machineId === b.machineId && scheduleDay(a.startDate) <= scheduleDay(b.endDate) &&
    scheduleDay(a.endDate) >= scheduleDay(b.startDate)
}

export function resolveScheduleReplacement<T extends ExistingRange, U extends Range>(
  existing: T[], incoming: U[], requestedDeleteIds: string[], protectedIds: Set<string>,
) {
  const requested = new Set(requestedDeleteIds)
  const retainedIds = new Set(existing.filter(a => !requested.has(a.id) || protectedIds.has(a.id)).map(a => a.id))
  const skipped = new Set<U>()
  // A skipped replacement must not remove any old interval it was replacing.
  // Repeat because keeping that interval can conflict with another new row.
  let changed = true
  while (changed) {
    changed = false
    for (const row of incoming) {
      if (!skipped.has(row) && existing.some(a => retainedIds.has(a.id) && overlaps(row, a))) {
        skipped.add(row)
        changed = true
      }
    }
    for (const old of existing) {
      if (!retainedIds.has(old.id) && Array.from(skipped).some(row => overlaps(old, row))) {
        retainedIds.add(old.id)
        changed = true
      }
    }
  }
  return {
    idsToDelete: existing.filter(a => requested.has(a.id) && !retainedIds.has(a.id)).map(a => a.id),
    safeAssignments: incoming.filter(a => !skipped.has(a)),
    skippedProtected: incoming.filter(a => skipped.has(a)),
    preservedConflict: existing.filter(a => requested.has(a.id) && retainedIds.has(a.id) && !protectedIds.has(a.id)).length,
  }
}
