import { estimateWovenBeforeStop, validSplitPlanningValue } from './estimatedWoven'
import type { FactoryCalendar } from './productionDuration'

export type GroupSplitInput = {
  calendar: FactoryCalendar
  members: readonly { id: string; allocatedMeters: number }[]
  dailyOutput: number
  start: string
  stopDate: string
}

/** [FB 22/10 ý 3; 2610-02] Estimate once for the whole machine, then allocate
 * cents by largest remainder. Target-machine dates are planned by the caller. */
export function planGroupSplit({ calendar, members, dailyOutput, start, stopDate }: GroupSplitInput) {
  if (!members.length || !validSplitPlanningValue(dailyOutput)
    || members.some(member => !member.id || !validSplitPlanningValue(member.allocatedMeters))
    || new Set(members.map(member => member.id)).size !== members.length) return null

  const cents = members.map(member => Math.round(member.allocatedMeters * 100))
  const totalCents = cents.reduce((sum, value) => sum + value, 0)
  const groupTotal = totalCents / 100
  if (!Number.isSafeInteger(totalCents) || !validSplitPlanningValue(groupTotal)) return null

  const estimate = estimateWovenBeforeStop(calendar, start, stopDate, groupTotal, dailyOutput)
  if (!estimate) return null
  const wovenCents = Math.round(estimate.estimatedWovenMeters * 100)
  const denominator = BigInt(totalCents)
  // Each value fits Decimal(10,2); their product may exceed Number's exact range.
  const portions = cents.map((value, index) => {
    const product = BigInt(value) * BigInt(wovenCents)
    return { index, woven: Number(product / denominator), remainder: product % denominator }
  })
  let leftover = wovenCents - portions.reduce((sum, portion) => sum + portion.woven, 0)
  const ranked = portions.slice().sort((a, b) => {
    if (a.remainder !== b.remainder) return a.remainder > b.remainder ? -1 : 1
    const left = members[a.index].id
    const right = members[b.index].id
    return left < right ? -1 : left > right ? 1 : 0
  })
  for (const portion of ranked) {
    if (leftover === 0) break
    portion.woven++
    leftover--
  }
  const perMember = portions.map(({ index, woven }) => ({
    id: members[index].id,
    woven: woven / 100,
    remaining: (cents[index] - woven) / 100,
  }))
  if (leftover !== 0 || perMember.some(member =>
    (member.woven !== 0 && !validSplitPlanningValue(member.woven))
    || (member.remaining !== 0 && !validSplitPlanningValue(member.remaining)))) return null

  return { groupTotal, ...estimate, perMember }
}
