export interface ReportOutputRowForValidation {
  sourceRow?: number
  isValid?: boolean
  validationErrors?: string[]
  sourceWeight?: string
  color: string
  weightKgs: number
}

export interface InvalidReportOutputRow {
  sourceRow: number
  reasons: string[]
}

export function invalidReportOutputRows(rows: readonly ReportOutputRowForValidation[]): InvalidReportOutputRow[] {
  return rows.flatMap((row, index) => {
    const reasons = [...(row.validationErrors ?? [])]
    if (row.isValid === false && reasons.length === 0) reasons.push('Dòng nguồn không hợp lệ')
    if (!row.color.trim()) reasons.push('Thiếu COLOR')
    if (!Number.isFinite(row.weightKgs)) reasons.push('WEIGHT thiếu hoặc không phải số')
    else if (row.weightKgs < 0) reasons.push('WEIGHT không được âm')
    if (row.sourceWeight != null && row.sourceWeight.trim() !== '') {
      const sourceValue = Number(row.sourceWeight)
      if (!Number.isFinite(sourceValue)) reasons.push('WEIGHT nguồn không phải số')
      else if (sourceValue < 0) reasons.push('WEIGHT nguồn không được âm')
    }
    const uniqueReasons = Array.from(new Set(reasons))
    return uniqueReasons.length ? [{ sourceRow: row.sourceRow ?? index + 1, reasons: uniqueReasons }] : []
  })
}
