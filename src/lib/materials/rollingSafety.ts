// src/lib/materials/rollingSafety.ts
// Utility for deterministic Scoped Replacement and concurrency safety for Rolling report import.

export interface RollingMetricItem {
  date: Date
  orderRef?: string | null
  metricLabel: string
  metricValue?: number | null
}

/**
 * Extracts unique valid dates present in a rolling metrics payload.
 * Used to define the exact replacement scope.
 */
export function extractRollingScopedDates(metrics: { date: Date }[]): Date[] {
  const timeSet = new Set<number>()
  for (const m of metrics) {
    if (m.date instanceof Date && !isNaN(m.date.getTime())) {
      timeSet.add(m.date.getTime())
    }
  }
  return Array.from(timeSet).sort((a, b) => a - b).map((t) => new Date(t))
}

/**
 * Simulates the database scoped replacement behavior for unit testing and audit:
 * - Records outside target dates are 100% preserved.
 * - Records matching target dates are deleted and replaced by incoming records.
 */
export function simulateScopedReplacement<T extends { id: string; date: Date }>(
  existing: T[],
  incoming: T[],
  targetDates: Date[]
): {
  result: T[]
  deletedCount: number
  insertedCount: number
} {
  const targetTimeSet = new Set(targetDates.map((d) => d.getTime()))
  const preserved = existing.filter((item) => !targetTimeSet.has(item.date.getTime()))
  const deletedCount = existing.length - preserved.length

  return {
    result: [...preserved, ...incoming],
    deletedCount,
    insertedCount: incoming.length,
  }
}
