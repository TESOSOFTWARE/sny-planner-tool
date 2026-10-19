// [MoM §3.1; D1=B, Q1–Q4=A] Historical reports never change inventory.
import { createHash } from 'node:crypto'
import { materialReportKey, parseMaterialReportHistory, type MaterialGroupInput, type ParsedMaterialReportDay } from '@/lib/excel/parseMaterialReport'
import { materialReportPayload, sameMaterialReport } from './reportPayload'

export async function readHistoryFile(req: Request) {
  const form = await req.formData(), file = form.get('file')
  if (!(file instanceof Blob)) throw new Error('Cần chọn file Excel.')
  const name = file instanceof File ? file.name : 'upload.xlsx'
  if (!name.toLowerCase().endsWith('.xlsx')) throw new Error('Chỉ chấp nhận file .xlsx.')
  if (file.size > 10 * 1024 * 1024) throw new Error('File phải nhỏ hơn hoặc bằng 10 MB.')
  const rows = parseMaterialReportHistory(Buffer.from(await file.arrayBuffer()), 'HDPE')
  return { rows, file: { name, size: file.size }, expectedSnapshot: String(form.get('expectedSnapshot') ?? '') }
}

export type HistoryRowStatus = 'invalid' | 'unknown_material' | 'ambiguous' | 'newer_than_stock' | 'identical' | 'conflict_existing' | 'new'
export type HistoryCounts = Record<HistoryRowStatus, number>
export interface HistoryMaterial { id: string; name: string; group: string; stockReportDate: Date | null }
export interface HistorySnapshot { materialId: string; reportDate: Date; payload: unknown }
export interface HistorySkippedRow {
  rowIndex: number; sourceRow: number; materialName: string; group: MaterialGroupInput
  reportDate: string; reportPeriodEnd?: string; sourceDateLabel?: string
  status: HistoryRowStatus; reasons: string[]
  differences?: Array<{ field: string; stored: unknown; incoming: unknown }>
}
export interface HistoryImportPreview {
  success: true; expectedSnapshot: string; totalRows: number; counts: HistoryCounts
  periods: Array<{ reportDate: string; reportPeriodEnd?: string; sourceDateLabel?: string; totalRows: number; counts: HistoryCounts }>
  skippedRows: HistorySkippedRow[]
}
export function historyCounts(): HistoryCounts { return { invalid: 0, unknown_material: 0, ambiguous: 0, newer_than_stock: 0, identical: 0, conflict_existing: 0, new: 0 } }
export function historyPayload(row: ParsedMaterialReportDay) {
  return { ...materialReportPayload(row), ...(row.missingFields?.length ? { missingFields: row.missingFields } : {}), ...(row.sourceDateLabel ? { sourceDateLabel: row.sourceDateLabel } : {}), ...(row.reportPeriodEnd ? { reportPeriodEnd: row.reportPeriodEnd } : {}) }
}
export function historyHash(value: unknown) { return createHash('sha256').update(JSON.stringify(value)).digest('hex') }
export function planHistoryImport(rows: ParsedMaterialReportDay[], materials: HistoryMaterial[], snapshots: HistorySnapshot[], file: { name: string; size: number }) {
  const byName = new Map<string, HistoryMaterial[]>()
  materials.forEach(material => { const key = materialReportKey(material.group as MaterialGroupInput, material.name); byName.set(key, [...(byName.get(key) ?? []), material]) })
  const stored = new Map(snapshots.map(snapshot => [JSON.stringify([snapshot.materialId, snapshot.reportDate.toISOString().slice(0, 10)]), snapshot]))
  const seen = new Set<string>()
  const counts = historyCounts(), skippedRows: HistorySkippedRow[] = [], periods = new Map<string, HistoryImportPreview['periods'][number]>()
  const writes: Array<{ materialId: string; reportDate: Date; payload: ReturnType<typeof historyPayload>; contentHash: string; version: number }> = []
  rows.forEach((row, rowIndex) => {
    const materialKey = materialReportKey(row.group, row.materialName), unique = JSON.stringify([row.reportDate, materialKey])
    if (seen.has(unique)) throw new Error(`Trùng vật tư ${row.materialName} trong kỳ ${row.reportDate}.`)
    seen.add(unique)
    const matches = byName.get(materialKey) ?? [], material = matches.length === 1 ? matches[0] : undefined
    const snapshot = material ? stored.get(JSON.stringify([material.id, row.reportDate])) : undefined
    let status: HistoryRowStatus = 'new', reasons: string[] = [], differences: HistorySkippedRow['differences']
    if (!row.isValid) { status = 'invalid'; reasons = row.validationErrors }
    else if (!matches.length) { status = 'unknown_material'; reasons = ['Vật tư chưa có trong hệ thống; thêm vật tư rồi nhập lại.'] }
    else if (matches.length > 1) { status = 'ambiguous'; reasons = ['Có nhiều vật tư trùng tên sau chuẩn hóa.'] }
    else if (material?.stockReportDate && row.reportDate > material.stockReportDate.toISOString().slice(0, 10)) { status = 'newer_than_stock'; reasons = ['Kỳ mới hơn ngày tồn hiện tại; dùng import báo cáo một ngày.'] }
    else if (snapshot) {
      const payload = snapshot.payload && typeof snapshot.payload === 'object' && !Array.isArray(snapshot.payload) ? snapshot.payload as Record<string, unknown> : {}
      const snapshotTracksMissingFields = Object.prototype.hasOwnProperty.call(payload, 'missingFields')
      const samePeriod = (payload.reportPeriodEnd ?? null) === (row.reportPeriodEnd ?? null)
        && (!snapshotTracksMissingFields || JSON.stringify(Array.isArray(payload.missingFields) ? [...payload.missingFields].sort() : []) === JSON.stringify([...(row.missingFields ?? [])].sort()))
      status = sameMaterialReport(snapshot.payload, row) && samePeriod ? 'identical' : 'conflict_existing'
      if (status === 'conflict_existing') {
        reasons = ['Giữ báo cáo đã có; dùng import một ngày nếu cần sửa.']
        const incoming = historyPayload(row)
        differences = ['firstStock', 'lastStock', 'inQty', 'outUsing', 'outBroken', 'outTape', 'outReject', 'reportPeriodEnd', ...(snapshotTracksMissingFields ? ['missingFields'] : []), 'color', 'colorName', 'brand', 'itemCode', 'lightFastness', 'subGroup'].flatMap(field => {
          const storedValue = payload[field] ?? null
          const value = (incoming as Record<string, unknown>)[field] ?? null
          const equal = Array.isArray(storedValue) && Array.isArray(value)
            ? JSON.stringify([...storedValue].sort()) === JSON.stringify([...value].sort())
            : storedValue === value
          return equal ? [] : [{ field, stored: storedValue, incoming: value }]
        })
      }
    }
    counts[status]++
    const periodKey = JSON.stringify([row.reportDate, row.reportPeriodEnd ?? null, row.sourceDateLabel ?? null])
    let period = periods.get(periodKey)
    if (!period) { period = { reportDate: row.reportDate, ...(row.reportPeriodEnd ? { reportPeriodEnd: row.reportPeriodEnd } : {}), ...(row.sourceDateLabel ? { sourceDateLabel: row.sourceDateLabel } : {}), totalRows: 0, counts: historyCounts() }; periods.set(periodKey, period) }
    period.totalRows++; period.counts[status]++
    if (status === 'new' && material) { const payload = historyPayload(row); writes.push({ materialId: material.id, reportDate: new Date(`${row.reportDate}T00:00:00.000Z`), payload, contentHash: historyHash(payload), version: 1 }) }
    else skippedRows.push({ rowIndex, sourceRow: row.sourceRow, materialName: row.materialName, group: row.group, reportDate: row.reportDate, ...(row.reportPeriodEnd ? { reportPeriodEnd: row.reportPeriodEnd } : {}), ...(row.sourceDateLabel ? { sourceDateLabel: row.sourceDateLabel } : {}), status, reasons, ...(differences ? { differences } : {}) })
  })
  const planned = writes.map(write => ({ ...write, reportDate: write.reportDate.toISOString() })).sort((a, b) => a.materialId.localeCompare(b.materialId) || a.reportDate.localeCompare(b.reportDate))
  const preview: HistoryImportPreview = { success: true, expectedSnapshot: historyHash({ file, writes: planned }), totalRows: rows.length, counts, periods: Array.from(periods.values()).sort((a, b) => a.reportDate.localeCompare(b.reportDate)), skippedRows }
  return { preview, writes }
}
