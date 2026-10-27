// [MoM §3.1; D1=B, Q1–Q4=A] Historical reports never change inventory.
import { createHash } from 'node:crypto'
import { materialReportKey, parseMaterialReportHistory, type MaterialGroupInput, type ParsedMaterialReportDay } from '@/lib/excel/parseMaterialReport'
import { materialReportPayload, sameMaterialReport } from './reportPayload'
import { stockKeepReason } from './monthlyImportRules'

export type Resolution = { action: 'skip' } | { action: 'create' } | { action: 'map'; materialId: string }
export type Resolutions = Record<string, Resolution>

export function parseResolutions(raw: FormDataEntryValue | null): Resolutions {
  let parsed: unknown
  try { parsed = JSON.parse(String(raw ?? '{}')) } catch { throw new Error('Lựa chọn vật tư không hợp lệ.') }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Lựa chọn vật tư không hợp lệ.')
  const entries = Object.entries(parsed as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))
  const result: Resolutions = {}
  for (const [key, value] of entries) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Lựa chọn vật tư không hợp lệ.')
    const v = value as Record<string, unknown>
    if (v.action === 'skip' || v.action === 'create') result[key] = { action: v.action }
    else if (v.action === 'map' && typeof v.materialId === 'string' && v.materialId) result[key] = { action: 'map', materialId: v.materialId }
    else throw new Error('Lựa chọn vật tư không hợp lệ.')
  }
  return result
}

export async function readHistoryFile(req: Request) {
  const form = await req.formData(), file = form.get('file')
  if (!(file instanceof Blob)) throw new Error('Cần chọn file Excel.')
  const name = file instanceof File ? file.name : 'upload.xlsx'
  if (!name.toLowerCase().endsWith('.xlsx')) throw new Error('Chỉ chấp nhận file .xlsx.')
  if (file.size > 10 * 1024 * 1024) throw new Error('File phải nhỏ hơn hoặc bằng 10 MB.')
  const rows = parseMaterialReportHistory(Buffer.from(await file.arrayBuffer()), 'HDPE')
  return { rows, file: { name, size: file.size }, expectedSnapshot: String(form.get('expectedSnapshot') ?? ''), resolutions: parseResolutions(form.get('resolutions')) }
}

export type HistoryRowStatus = 'invalid' | 'unknown_material' | 'ambiguous' | 'identical' | 'conflict_existing' | 'new'
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
  unknownMaterials: Array<{ materialKey: string; name: string; group: string; periods: number; firstStock: number; lastStock: number; candidates: Array<{ id: string; name: string; currentStock: string }> }>
  stockUpdates: StockChange[]
  stockKept: StockKept[]
  materials: Array<{ id: string; name: string; group: string }>
}
export function historyCounts(): HistoryCounts { return { invalid: 0, unknown_material: 0, ambiguous: 0, identical: 0, conflict_existing: 0, new: 0 } }
export function historyPayload(row: ParsedMaterialReportDay) {
  return { ...materialReportPayload(row), ...(row.missingFields?.length ? { missingFields: row.missingFields } : {}), ...(row.sourceDateLabel ? { sourceDateLabel: row.sourceDateLabel } : {}), ...(row.reportPeriodEnd ? { reportPeriodEnd: row.reportPeriodEnd } : {}) }
}
export function historyHash(value: unknown) { return createHash('sha256').update(JSON.stringify(value)).digest('hex') }
export interface MonthlyHistoryMaterial extends HistoryMaterial {
  currentStock?: { toString(): string } | number | string
  stockReportDirty?: boolean
}
export interface ManualHistoryTransaction { materialId: string; txDate: Date; id: string }
type PlannedWrite = { materialId: string; reportDate: Date; payload: ReturnType<typeof historyPayload>; contentHash: string; version: number }
type StockChange = { materialId: string; name: string; from: { stock: string; date: string | null } | null; to: { stock: number; date: string } }
type StockKept = { materialId: string; name: string; reason: string; reportEnd: string; lastManualTx?: string }
const iso = (date: Date) => date.toISOString().slice(0, 10)
const endOf = (start: string, payload: unknown): string => {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const end = (payload as Record<string, unknown>).reportPeriodEnd
    if (typeof end === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(end)) return end
  }
  return start
}
function similar(a: string, b: string): boolean {
  const x = a.trim().toUpperCase(), y = b.trim().toUpperCase()
  const first = x.match(/^[A-Z0-9-]+/)?.[0]
  if (first && first.length >= 3 && y.startsWith(first)) return true
  if (y.length >= 4 && x.startsWith(y)) return true
  if (Math.abs(x.length - y.length) > 3) return false
  let prev = Array.from({ length: y.length + 1 }, (_, i) => i)
  for (let i = 1; i <= x.length; i++) {
    const next = [i]
    for (let j = 1; j <= y.length; j++) next[j] = Math.min(next[j - 1] + 1, prev[j] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1))
    prev = next
  }
  return prev[y.length] <= 3
}

export function planHistoryImport(rows: ParsedMaterialReportDay[], materials: MonthlyHistoryMaterial[], snapshots: HistorySnapshot[], file: { name: string; size: number }, resolutions: Resolutions = {}, manualTransactions: ManualHistoryTransaction[] = []) {
  const byName = new Map<string, MonthlyHistoryMaterial[]>()
  const byId = new Map(materials.map(m => [m.id, m]))
  for (const m of materials) {
    const key = materialReportKey(m.group as MaterialGroupInput, m.name)
    byName.set(key, [...(byName.get(key) ?? []), m])
  }
  const unknownMaterials = new Map<string, { materialKey: string; name: string; group: string; periods: number; firstStock: number; lastStock: number; candidates: Array<{ id: string; name: string; currentStock: string }> }>()
  const creations = new Map<string, ParsedMaterialReportDay>()
  const resolved = rows.map(row => {
    const key = materialReportKey(row.group, row.materialName)
    const matches = byName.get(key) ?? []
    const action = resolutions[key] ?? { action: 'skip' as const }
    if (matches.length === 0) {
      const existing = unknownMaterials.get(key)
      if (existing) { existing.periods++; existing.lastStock = row.lastStock }
      else unknownMaterials.set(key, { materialKey: key, name: row.materialName, group: row.group, periods: 1, firstStock: row.firstStock, lastStock: row.lastStock, candidates: materials.filter(m => m.group === row.group && similar(row.materialName, m.name)).map(m => ({ id: m.id, name: m.name, currentStock: String(m.currentStock ?? '') })) })
      if (action.action === 'create') { creations.set(key, row); return { key, id: 'new:' + key, material: undefined, status: '' } }
      if (action.action === 'map') {
        const m = byId.get(action.materialId)
        if (!m || m.group !== row.group) return { key, id: '', material: undefined, status: 'invalid' }
        return { key, id: m.id, material: m, status: '' }
      }
      return { key, id: '', material: undefined, status: 'unknown_material' }
    }
    if (matches.length > 1) return { key, id: '', material: undefined, status: 'ambiguous' }
    return { key, id: matches[0].id, material: matches[0], status: '' }
  })
  const seen = new Map<string, string>()
  rows.forEach((row, i) => {
    const id = resolved[i].id
    if (!id) return
    const key = JSON.stringify([id, row.reportDate])
    const old = seen.get(key)
    if (old !== undefined) throw new Error(`Trùng: Tên ${old} và ${row.materialName} cùng trỏ về vật tư ở kỳ ${row.reportDate}; chọn lại.`)
    seen.set(key, row.materialName)
  })
  const periodsById = new Map<string, Array<{ start: string; end: string; index?: number }>>()
  for (const snap of snapshots) {
    const start = iso(snap.reportDate)
    const list = periodsById.get(snap.materialId) ?? []
    list.push({ start, end: endOf(start, snap.payload) }); periodsById.set(snap.materialId, list)
  }
  rows.forEach((row, i) => {
    const id = resolved[i].id
    if (!id || !row.isValid) return
    const list = periodsById.get(id) ?? []
    list.push({ start: row.reportDate, end: row.reportPeriodEnd ?? row.reportDate, index: i }); periodsById.set(id, list)
  })
  const overlaps = new Map<number, string>(), unsafeIds = new Set<string>()
  for (const [id, list] of Array.from(periodsById.entries())) {
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j]
      if (a.start === b.start && a.end === b.end) continue
      if (a.start <= b.end && b.start <= a.end) {
        unsafeIds.add(id)
        const detail = `Kỳ ${a.start} – ${a.end} chồng kỳ ${b.start} – ${b.end}.`
        if (a.index !== undefined) overlaps.set(a.index, detail)
        if (b.index !== undefined) overlaps.set(b.index, detail)
      }
    }
  }
  const counts = historyCounts(), skippedRows: HistorySkippedRow[] = [], periods = new Map<string, HistoryImportPreview['periods'][number]>()
  const writes: PlannedWrite[] = []
  rows.forEach((row, i) => {
    const resolvedRow = resolved[i]
    const snapshot = snapshots.find(s => s.materialId === resolvedRow.id && iso(s.reportDate) === row.reportDate)
    let status: HistoryRowStatus = 'new', reasons: string[] = [], differences: HistorySkippedRow['differences']
    if (!row.isValid) { status = 'invalid'; reasons = row.validationErrors }
    else if (resolvedRow.status) { status = resolvedRow.status as HistoryRowStatus; reasons = [status === 'invalid' ? 'Vật tư ánh xạ không hợp lệ hoặc khác nhóm.' : status === 'ambiguous' ? 'Có nhiều vật tư trùng tên.' : 'Vật tư chưa có trong hệ thống.'] }
    else if (overlaps.has(i)) { status = 'conflict_existing'; reasons = [`overlapping_period: ${overlaps.get(i)}`] }
    else if (snapshot) {
      const payload = snapshot.payload && typeof snapshot.payload === 'object' ? snapshot.payload as Record<string, unknown> : {}
      const missingMatches = !Object.prototype.hasOwnProperty.call(payload, 'missingFields') || JSON.stringify(Array.isArray(payload.missingFields) ? [...payload.missingFields].sort() : []) === JSON.stringify([...(row.missingFields ?? [])].sort())
      status = sameMaterialReport(payload, row) && (payload.reportPeriodEnd ?? null) === (row.reportPeriodEnd ?? null) && missingMatches ? 'identical' : 'conflict_existing'
      if (status === 'conflict_existing') {
        reasons = ['Giữ báo cáo đã có; dùng import một ngày nếu cần sửa.']
        const incoming = historyPayload(row)
        const tracksMissing = Object.prototype.hasOwnProperty.call(payload, 'missingFields')
        differences = ['firstStock', 'lastStock', 'inQty', 'outUsing', 'outBroken', 'outTape', 'outReject', 'reportPeriodEnd', ...(tracksMissing ? ['missingFields'] : []), 'color', 'colorName', 'brand', 'itemCode', 'lightFastness', 'subGroup'].flatMap(field => {
          const stored = payload[field] ?? null
          const proposed = (incoming as Record<string, unknown>)[field] ?? null
          const equal = Array.isArray(stored) && Array.isArray(proposed) ? JSON.stringify([...stored].sort()) === JSON.stringify([...proposed].sort()) : stored === proposed
          return equal ? [] : [{ field, stored, incoming: proposed }]
        })
      }
    }
    counts[status]++
    const periodKey = JSON.stringify([row.reportDate, row.reportPeriodEnd ?? null, row.sourceDateLabel ?? null])
    let period = periods.get(periodKey)
    if (!period) { period = { reportDate: row.reportDate, ...(row.reportPeriodEnd ? { reportPeriodEnd: row.reportPeriodEnd } : {}), ...(row.sourceDateLabel ? { sourceDateLabel: row.sourceDateLabel } : {}), totalRows: 0, counts: historyCounts() }; periods.set(periodKey, period) }
    period.totalRows++; period.counts[status]++
    if (status === 'new') { const payload = historyPayload(row); writes.push({ materialId: resolvedRow.id, reportDate: new Date(`${row.reportDate}T00:00:00.000Z`), payload, contentHash: historyHash(payload), version: 1 }) }
    else skippedRows.push({ rowIndex: i, sourceRow: row.sourceRow, materialName: row.materialName, group: row.group, reportDate: row.reportDate, ...(row.reportPeriodEnd ? { reportPeriodEnd: row.reportPeriodEnd } : {}), ...(row.sourceDateLabel ? { sourceDateLabel: row.sourceDateLabel } : {}), status, reasons, ...(differences ? { differences } : {}) })
  })
  const stockUpdates: StockChange[] = [], stockKept: StockKept[] = []
  for (const id of Array.from(new Set(writes.map(w => w.materialId)))) {
    if (unsafeIds.has(id)) {
      stockKept.push({ materialId: id, name: byId.get(id)?.name ?? creations.get(id.slice(4))?.materialName ?? '', reason: 'overlapping_period', reportEnd: '' })
      continue
    }
    const candidates = [...snapshots.filter(s => s.materialId === id), ...writes.filter(w => w.materialId === id)]
    candidates.sort((a, b) => endOf(iso(b.reportDate), b.payload).localeCompare(endOf(iso(a.reportDate), a.payload)) || iso(b.reportDate).localeCompare(iso(a.reportDate)))
    const latest = candidates[0]
    if (!latest) continue
    const end = endOf(iso(latest.reportDate), latest.payload)
    const payload = latest.payload as Record<string, unknown>
    const stock = Number(payload.lastStock)
    if (!Number.isFinite(stock) || stock < 0) throw new Error('Tồn cuối kỳ không hợp lệ.')
    const material = byId.get(id), created = id.startsWith('new:')
    const last = manualTransactions.filter(t => t.materialId === id).map(t => iso(t.txDate)).sort().at(-1) ?? null
    const baseline = material?.stockReportDate ? iso(material.stockReportDate) : null
    const reason = stockKeepReason({ stockReportDate: baseline, stockReportDirty: material?.stockReportDirty ?? false, lastManualTx: last, newlyCreated: created })
    const name = material?.name ?? creations.get(id.slice(4))?.materialName ?? ''
    if (reason) { stockKept.push({ materialId: id, name, reason, reportEnd: end, ...(last ? { lastManualTx: last } : {}) }); continue }
    if (baseline && end < baseline) { stockKept.push({ materialId: id, name, reason: 'newer_stock_baseline', reportEnd: end }); continue }
    stockUpdates.push({ materialId: id, name, from: material ? { stock: String(material.currentStock ?? ''), date: baseline } : null, to: { stock, date: end } })
  }
  const snapshotState = [...snapshots].map(s => ({ materialId: s.materialId, date: iso(s.reportDate), payload: s.payload })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
  const materialState = [...materials].map(m => ({ id: m.id, name: m.name, group: m.group, stock: String(m.currentStock ?? ''), date: m.stockReportDate ? iso(m.stockReportDate) : null, dirty: m.stockReportDirty ?? false })).sort((a, b) => a.id.localeCompare(b.id))
  const txState = [...manualTransactions].map(t => ({ id: t.id, materialId: t.materialId, date: iso(t.txDate) })).sort((a, b) => a.id.localeCompare(b.id))
  const preview = { success: true as const, expectedSnapshot: historyHash({ file, rows, resolutions: Object.fromEntries(Object.entries(resolutions).sort(([a], [b]) => a.localeCompare(b))), snapshotState, materialState, txState }), totalRows: rows.length, counts, periods: Array.from(periods.values()).sort((a, b) => a.reportDate.localeCompare(b.reportDate)), skippedRows, unknownMaterials: Array.from(unknownMaterials.values()), stockUpdates, stockKept, materials: materials.map(m => ({ id: m.id, name: m.name, group: m.group })) }
  return { preview, writes, creations, stockUpdates, stockKept }
}
