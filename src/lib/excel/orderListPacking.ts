type PackingType = 'ROLL' | 'BALE' | 'CARTON' | 'HEMMED'
const normalized = (value: unknown) => typeof value === 'string'
  ? value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/Đ/g, 'D').replace(/đ/g, 'd').toUpperCase().trim()
  : ''

export function explicitOrderListPacking(value: unknown): PackingType | null {
  const text = normalized(value)
  if (/\b(HEMMED|HEM)\b|WEBBING HEM|MAY VIEN|DONG KHUY/.test(text)) return 'HEMMED'
  if (/\b(CARTONS?|THUNG)\b/.test(text)) return 'CARTON'
  if (/\b(BALES?|KIEN)\b/.test(text)) return 'BALE'
  if (/\b(ROLLS?|CUON)\b/.test(text)) return 'ROLL'
  return null
}
export function unitOrderListPacking(value: unknown): PackingType | null {
  const text = normalized(value)
  if (/\b(BOX|PACK|PCS|PANEL)\b/.test(text)) return 'CARTON'
  if (/\bBALES?\b/.test(text)) return 'BALE'
  if (/\bROLLS?\b/.test(text)) return 'ROLL'
  return null
}
type PackingRow = {
  rawPacking?: string | null; rawUnit?: string | null; primaryPackingType?: string
  piecesPerCarton?: number | null; piecesPerBale?: number | null
}
export function missingInferredPacking(row: PackingRow): 'CARTON' | 'BALE' | null {
  if (explicitOrderListPacking(row.rawPacking)) return null
  const inferred = unitOrderListPacking(row.rawUnit)
  if (inferred !== row.primaryPackingType) return null
  if (inferred === 'CARTON' && row.piecesPerCarton == null) return 'CARTON'
  if (inferred === 'BALE' && row.piecesPerBale == null) return 'BALE'
  return null
}
export function orderListPackingWarnings(row: PackingRow): string[] {
  const missing = missingInferredPacking(row)
  return missing ? [`Thiếu số tấm/${missing === 'CARTON' ? 'thùng' : 'kiện'}; vẫn nhập để lập lịch, chưa đủ quy cách đóng gói.`] : []
}
