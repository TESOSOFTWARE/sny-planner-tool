// [MoM §3.1] Only existing inventory columns are needed for source-report reads.
export const baseMaterialSelect = {
  id: true, name: true, group: true, color: true, brand: true, currentStock: true,
  stockReportDate: true, stockReportDirty: true, minThreshold: true, unit: true,
  note: true, createdAt: true, updatedAt: true,
} as const
export function validReportDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}