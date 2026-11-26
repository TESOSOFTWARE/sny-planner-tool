export type ProgressValueKind = 'plan' | 'actual'

export interface ProgressValueInput {
  piNumber: string
  stage: string
  metricLabel: string
  unit: string
  kind: ProgressValueKind
  value: number
  reportDate?: string | null
}

export interface ProductionProgressRow {
  piNumber: string
  stage: string
  metricLabel: string
  unit: string
  planned: number | null
  actual: number | null
  achievedPercent: number | null
  state: 'NO_PLAN' | 'NO_ACTUAL' | 'IN_PROGRESS' | 'PLAN_REACHED' | 'ZERO_PLAN'
  lastActualDate: string | null
}

const norm = (value: string) => value.trim().replace(/\s+/g, ' ').toUpperCase()
const keyOf = (entry: ProgressValueInput) => JSON.stringify([
  norm(entry.piNumber), entry.stage.trim().toLowerCase(), norm(entry.metricLabel), norm(entry.unit),
])

export function aggregateProductionProgress(entries: ProgressValueInput[]): ProductionProgressRow[] {
  const groups = new Map<string, {
    piNumber: string; stage: string; metricLabel: string; unit: string
    planned: number | null; actual: number | null; lastActualDate: string | null
  }>()

  for (const entry of entries) {
    if (!entry.piNumber.trim() || !entry.stage.trim() || !entry.metricLabel.trim() || !entry.unit.trim() || !Number.isFinite(entry.value) || entry.value < 0) continue
    const key = keyOf(entry)
    const group = groups.get(key) ?? {
      piNumber: entry.piNumber.trim(), stage: entry.stage.trim().toLowerCase(),
      metricLabel: entry.metricLabel.trim(), unit: entry.unit.trim(), planned: null, actual: null, lastActualDate: null,
    }
    if (entry.kind === 'plan') group.planned = (group.planned ?? 0) + entry.value
    else {
      group.actual = (group.actual ?? 0) + entry.value
      if (entry.reportDate && (!group.lastActualDate || entry.reportDate > group.lastActualDate)) group.lastActualDate = entry.reportDate
    }
    groups.set(key, group)
  }

  return Array.from(groups.values()).map(group => {
    const achievedPercent = group.planned != null && group.planned > 0 && group.actual != null
      ? (group.actual / group.planned) * 100
      : null
    const state: ProductionProgressRow['state'] = group.planned == null ? 'NO_PLAN'
      : group.actual == null ? 'NO_ACTUAL'
        : group.planned === 0 ? 'ZERO_PLAN'
          : group.actual >= group.planned ? 'PLAN_REACHED' : 'IN_PROGRESS'
    return { ...group, achievedPercent, state }
  }).sort((a, b) => a.piNumber.localeCompare(b.piNumber) || a.stage.localeCompare(b.stage) || a.metricLabel.localeCompare(b.metricLabel) || a.unit.localeCompare(b.unit))
}
