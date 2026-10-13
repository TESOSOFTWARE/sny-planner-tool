import { countWorkingDays, isWorkingDay, type FactoryCalendar } from './productionDuration'

/** Match the existing Decimal(10,2) columns before computing or saving dates. */
export function validSplitPlanningValue(value: number): boolean {
  return Number.isFinite(value) && value > 0 && value <= 99999999.99
    && Math.abs(value * 100 - Math.round(value * 100)) < 0.000001
}

/** Planned estimate only; daily production reports are not used here. Stop day
 * is excluded: all work before D stays on the old machine. */
export function estimateWovenBeforeStop(calendar: FactoryCalendar, start: string, stopDate: string, allocatedMeters: number, estimatedDailyOutput: number) {
  if (!validSplitPlanningValue(allocatedMeters) || !validSplitPlanningValue(estimatedDailyOutput)
    || countWorkingDays(calendar, start, stopDate) === null || stopDate < start) return null
  const previous = new Date(`${stopDate}T00:00:00Z`)
  previous.setUTCDate(previous.getUTCDate() - 1)
  const beforeStop = previous.toISOString().slice(0, 10)
  const workedDays = countWorkingDays(calendar, start, beforeStop)
  if (workedDays === null) return null
  const estimatedWovenMeters = Math.min(allocatedMeters, Number((estimatedDailyOutput * workedDays).toFixed(2)))
  const remainingMeters = Number((allocatedMeters - estimatedWovenMeters).toFixed(2))
  let lastWorkingDate: string | null = null
  while (previous.toISOString().slice(0, 10) >= start) {
    const label = previous.toISOString().slice(0, 10)
    if (isWorkingDay(calendar, label)) { lastWorkingDate = label; break }
    previous.setUTCDate(previous.getUTCDate() - 1)
  }
  return { workedDays, estimatedWovenMeters, remainingMeters, lastWorkingDate }
}
