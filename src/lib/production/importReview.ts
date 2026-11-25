export const STATISTICAL_REPORT_SHEETS = ['HDPE', 'EXTRUDER', 'WARPING', 'KNITTING', 'ROLLING'] as const

export type StatisticalReportSheet = typeof STATISTICAL_REPORT_SHEETS[number]
export type ImportReviewRow = Record<string, unknown>

export interface ImportSheetReview {
  totalRows: number
  invalidRows: number
  sourceRowsWithPI: number
  rowsLinkedToItem: number
  rowsNotLinkedToItem: number
  rowsPendingItemResolution: number
  dates: string[]
  outOfPeriodDates: string[]
}

function sourceDate(row: ImportReviewRow): string | null {
  const value = row.reportDate ?? row.date ?? row.txDate
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString().slice(0, 10)
  if (typeof value !== 'string') return null
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim())
  return match?.[1] ?? null
}

function hasPI(row: ImportReviewRow): boolean {
  if (typeof row.orderRef === 'string' && row.orderRef.trim().length > 0) return true
  return Array.isArray(row.sourceOrderRefs) && row.sourceOrderRefs.some(value => typeof value === 'string' && value.trim().length > 0)
}

function isInvalid(row: ImportReviewRow): boolean {
  return row.isValid === false || (Array.isArray(row.validationErrors) && row.validationErrors.length > 0)
}

export function summarizeImportRows(rows: ImportReviewRow[], reportMonth: string): ImportSheetReview {
  const rowDates = rows.filter(row => !isInvalid(row)).flatMap(row => [sourceDate(row), typeof row.reportPeriodEnd === 'string' ? row.reportPeriodEnd.slice(0, 10) : null])
  const dates = Array.from(new Set(rowDates.filter((date): date is string => date !== null))).sort()
  const sourceRowsWithPI = rows.filter(hasPI).length
  const piRows = rows.filter(hasPI)
  const rowsLinkedToItem = piRows.filter(row => typeof row.orderId === 'string' && row.orderId.length > 0).length
  const rowsWithKnownLinkStatus = piRows.filter(row => Object.prototype.hasOwnProperty.call(row, 'orderId'))

  return {
    totalRows: rows.length,
    invalidRows: rows.filter(isInvalid).length,
    sourceRowsWithPI,
    rowsLinkedToItem,
    rowsNotLinkedToItem: rowsWithKnownLinkStatus.length - rowsLinkedToItem,
    rowsPendingItemResolution: sourceRowsWithPI - rowsWithKnownLinkStatus.length,
    dates,
    outOfPeriodDates: dates.filter(date => date.slice(0, 7) !== reportMonth),
  }
}
