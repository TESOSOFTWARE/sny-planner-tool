export interface RollingImportRow { date: Date | string; orderRef: string | null }
export interface RollingDayComparison { date: string; currentCount: number; incomingCount: number; currentPIs: string[]; incomingPIs: string[]; missingPIs: string[] }
export interface RollingLoss { date: string; piNumber: string }

// Same normalization used by parseRollingReport for Column B.
export const normalizeRollingPI = (value: string | null) => (value ?? '').trim().toUpperCase().replace(/\s+/g, ' ')
const day = (value: Date | string) => value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10)

export function compareRollingDays(current: RollingImportRow[], incoming: RollingImportRow[]): RollingDayComparison[] {
  const dates = Array.from(new Set(incoming.map(row => day(row.date)))).sort()
  return dates.map(date => {
    const oldRows = current.filter(row => day(row.date) === date), newRows = incoming.filter(row => day(row.date) === date)
    const pis = (rows: RollingImportRow[]) => Array.from(new Set(rows.map(row => normalizeRollingPI(row.orderRef)).filter(Boolean))).sort()
    const currentPIs = pis(oldRows), incomingPIs = pis(newRows)
    return { date, currentCount: oldRows.length, incomingCount: newRows.length, currentPIs, incomingPIs, missingPIs: currentPIs.filter(pi => !incomingPIs.includes(pi)) }
  })
}
export const rollingLosses = (days: RollingDayComparison[]): RollingLoss[] => days.flatMap(row => row.missingPIs.map(piNumber => ({ date: row.date, piNumber })))
export function acknowledgesRollingLosses(losses: RollingLoss[], acknowledged: unknown): boolean {
  if (!Array.isArray(acknowledged)) return false
  return losses.every(loss => acknowledged.some(item => item && typeof item === 'object' && item.date === loss.date && typeof item.piNumber === 'string' && normalizeRollingPI(item.piNumber) === loss.piNumber))
}
