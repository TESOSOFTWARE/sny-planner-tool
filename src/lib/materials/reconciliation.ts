// [MoM §3.1] Read-only reconciliation of imported source periods; never updates stock.
export interface StockReport {
  firstStock?: number
  inQty?: number
  outBroken?: number
  outTape?: number
  outReject?: number
  outUsing?: number
  lastStock?: number
  reportPeriodEnd?: string
  missingFields?: readonly string[]
}
export interface SourceReport { reportDate: string; payload: StockReport }
export interface Reconciliation { ac?: number; ad?: number; check?: number; warning: boolean; reason?: string }

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const present = (payload: StockReport, key: keyof StockReport) => !payload.missingFields?.includes(key) && finite(payload[key])

export function reconcileStock(payload: StockReport | undefined, material: { group: string; subGroup?: string | null }): Reconciliation {
  const ad = payload && present(payload, 'lastStock') ? payload.lastStock : undefined
  if (material.group !== 'MB' && (material.group !== 'HDPE' || !['NGUYEN_SINH', 'TAI_CHE'].includes(material.subGroup ?? ''))) {
    return { ad, warning: false, reason: 'Chưa phân loại nhựa nên chưa xác định được công thức AC.' }
  }
  const keys: (keyof StockReport)[] = ['firstStock', 'inQty', 'outUsing', 'outTape']
  if (material.group === 'HDPE' && material.subGroup === 'TAI_CHE') keys.push('outReject')
  if (!payload || keys.some(key => !present(payload, key))) return { ad, warning: false, reason: 'Thiếu số liệu nguồn để tính AC; ô trống không được coi là 0.' }
  const ac = payload.firstStock! + payload.inQty! - payload.outUsing! - payload.outTape!
    - (material.group === 'HDPE' && material.subGroup === 'TAI_CHE' ? payload.outReject! : 0)
  const check = ad === undefined ? undefined : ac - ad
  return { ac, ad, check, warning: check !== undefined && Math.abs(check) > 0.01 + 1e-9,
    ...(ad === undefined ? { reason: 'Thiếu tồn cuối nguồn (AD) để đối chiếu.' } : {}) }
}

/** Opening and closing are boundaries; only known movements across every period are summed. */
export function summarizeSourceReports(reports: readonly SourceReport[]): StockReport {
  const sorted = [...reports].sort((a, b) => a.reportDate.localeCompare(b.reportDate))
  const first = sorted[0]?.payload, last = sorted.at(-1)?.payload
  const result: StockReport = {
    firstStock: first && present(first, 'firstStock') ? first.firstStock : undefined,
    lastStock: last && present(last, 'lastStock') ? last.lastStock : undefined,
  }
  for (const key of ['inQty', 'outBroken', 'outTape', 'outReject', 'outUsing'] as const) {
    result[key] = sorted.length && sorted.every(report => present(report.payload, key))
      ? sorted.reduce((sum, report) => sum + report.payload[key]!, 0) : undefined
  }
  return result
}

export function reconciliationRange(reports: readonly SourceReport[]): string {
  const sorted = [...reports].sort((a, b) => a.reportDate.localeCompare(b.reportDate))
  if (!sorted.length) return 'Chưa có kỳ báo cáo để đối chiếu.'
  const last = sorted.at(-1)!
  const format = (date: string) => date.split('-').reverse().join('/')
  return `Đối chiếu các kỳ đã nhập: ${format(sorted[0].reportDate)} → ${format(last.payload.reportPeriodEnd ?? last.reportDate)}, ${sorted.length} kỳ`
}

/** TOTAL is meaningful only for identical source periods and fully known row values. */
export function totalReconciliation(rows: readonly { latestReport?: SourceReport | null; group: string; subGroup?: string | null }[]): Reconciliation {
  const periods = rows.map(row => row.latestReport ? `${row.latestReport.reportDate}|${row.latestReport.payload.reportPeriodEnd ?? row.latestReport.reportDate}` : '')
  if (!rows.length || periods.some(period => !period || period !== periods[0])) return { warning: false, reason: 'Thiếu hoặc khác khoảng ngày nguồn; không cộng đối chiếu.' }
  const values = rows.map(row => reconcileStock(row.latestReport?.payload, row))
  const total = (key: 'ac' | 'ad' | 'check') => values.every(value => finite(value[key])) ? values.reduce((sum, value) => sum + value[key]!, 0) : undefined
  const ac = total('ac'), ad = total('ad'), check = total('check')
  return { ac, ad, check, warning: check !== undefined && Math.abs(check) > 0.01 + 1e-9,
    ...(ac === undefined || ad === undefined ? { reason: 'Có dòng thiếu số liệu hoặc chưa phân loại; không cộng đối chiếu.' } : {}) }
}
