// [MoM §3.1] Shared decisions for monthly material report imports.
export interface MonthlyPeriod {
  start: string
  end: string
}

export function periodsOverlap(a: MonthlyPeriod, b: MonthlyPeriod): boolean {
  return a.start <= b.end && b.start <= a.end
}

export type StockKeepReason = 'manual_tx' | 'manual_stock_edit' | 'no_report_baseline'

export function stockKeepReason(input: {
  stockReportDate: string | null
  stockReportDirty: boolean
  lastManualTx: string | null
  newlyCreated: boolean
}): StockKeepReason | null {
  if (input.newlyCreated) return null
  if (input.lastManualTx && (!input.stockReportDate || input.lastManualTx > input.stockReportDate)) return 'manual_tx'
  if (input.stockReportDirty) return 'manual_stock_edit'
  if (!input.stockReportDate) return 'no_report_baseline'
  return null
}
