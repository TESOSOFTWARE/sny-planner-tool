'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ImportOrdersModal from '@/components/orders/ImportOrdersModal'
import { prepareStatisticalReportUpload, ReportUploadError } from '@/lib/excel/uploadTrim'
import { STATISTICAL_REPORT_SHEETS, summarizeImportRows, type ImportReviewRow, type StatisticalReportSheet } from '@/lib/production/importReview'
import { remarkKey, type RemarkValue } from '@/lib/excel/knittingRemark'
import type { RollingDayComparison } from '@/lib/materials/rollingImportSafety'
import type { Resolution, Resolutions } from '@/lib/materials/reportHistoryImport'

type SheetPreview = {
  sheet: StatisticalReportSheet
  rows: ImportReviewRow[]
  payload: Record<string, unknown>
  error?: string
}

type ImportOutcome = { state: 'done' | 'failed' | 'uncertain'; message: string; count?: number; added?: number; updated?: number; unchanged?: number; skipped?: number; needsPreviewRefresh?: boolean }
type ImportBatchSheetResult = { status?: string; result?: Record<string, unknown>; updatedAt?: string }
type ImportBatchSummary = {
  id: string; fileName: string; fileHash: string; decisionHash: string; reportMonth: string
  selectedSheets: string[]; sheetResults: Record<string, ImportBatchSheetResult>; status: string
  decisions?: Record<string, unknown>
  createdAt: string; completedAt: string | null
}
type ImportBatchSheetDetail = { sheetName: StatisticalReportSheet; sourceRows: ImportReviewRow[]; status: string; result: Record<string, unknown> }
type ImportBatchDetail = ImportBatchSummary & { decisions: Record<string, unknown>; sheet: ImportBatchSheetDetail }
type UnknownMaterial = {
  materialKey: string
  name: string
  group: string
  candidates: Array<{ id: string; name: string; currentStock: string }>
}
type HdpeStockUpdate = { materialId: string; name: string; from: { stock: string; date: string | null } | null; to: { stock: number; date: string } }
type HdpeStockKept = { materialId: string; name: string; reason: string; reportEnd: string }
type HdpeSkippedRow = { sourceRow: number; materialName: string; group: string; reportDate: string; status: string; reasons: string[]; differences?: Array<{ field: string; stored: unknown; incoming: unknown }> }
type RollingSkippedDateBlock = { dateLabelRaw: string; note: string | null; blocked?: boolean; hasData?: boolean }
type ImportExecutionContext = { file: File; sourceFile: File; sourceFileHash: string; reportMonth: string; month: string; year: string; previews: SheetPreview[]; resolutions: Resolutions; remarkDecisions: Record<string, 'MESH' | 'NOTE'> }
const LABELS: Record<StatisticalReportSheet, string> = {
  HDPE: 'HDPE',
  EXTRUDER: 'Kéo sợi',
  WARPING: 'Mắc sợi',
  KNITTING: 'Dệt',
  ROLLING: 'Cuộn',
}

const DESTINATION_LABELS: Record<StatisticalReportSheet, string> = {
  HDPE: 'Nguyên liệu / tồn kho',
  EXTRUDER: 'Sản lượng kéo sợi',
  WARPING: 'Sản lượng mắc sợi',
  KNITTING: 'Sản lượng dệt',
  ROLLING: 'Sản lượng cuộn',
}

const FIELD_LABELS: Record<string, string> = {
  reportDate: 'Ngày', date: 'Ngày', sourceRow: 'Dòng nguồn', cellRef: 'Ô nguồn',
  machineId: 'Máy', shift: 'Ca', color: 'Màu', denier: 'Denier', weightKgs: 'Kg',
  sourceWeight: 'WEIGHT nguồn', isValid: 'Hợp lệ', validationErrors: 'Lỗi kiểm tra',
  orderRef: 'PI nguồn', orderId: 'Liên kết item', beamNote: 'Ghi chú beam',
  weavingMachineRef: 'Máy dệt liên quan', strand: 'Số sợi', beamCount1: 'Beam 1',
  beamCount2: 'Beam 2', mPerEa: 'M/EA', weigValue: 'Trọng lượng dàn', quantity: 'Số lượng',
  width: 'Khổ', widthM: 'Khổ (m)', lengthM: 'Chiều dài (m)', mValue: 'Mét',
  tapeRoll: 'Tape/cuộn', avgPerRoll: 'TB/cuộn', weightSpec: 'Định lượng',
  machineNote: 'Ghi chú máy', meshType: 'Loại lưới', machineSizeM: 'Khổ máy',
  cmPerMin: 'Cm/phút', meterPerDay: 'Mét/ngày', operatingGrade: 'Cấp vận hành', totalPct: 'Tỷ lệ %',
  materialName: 'Tên vật tư', group: 'Nhóm', subGroup: 'Phân nhóm', firstStock: 'Tồn đầu',
  inQty: 'Nhập', outUsing: 'Xuất dùng', outBroken: 'Hỏng', outTape: 'Xuất tape',
  outReject: 'Reject', lastStock: 'Tồn cuối', lightFastness: 'Độ bền màu', colorName: 'Tên màu',
  brand: 'Nhà sản xuất', itemCode: 'Mã hàng', metricLabel: 'Chỉ tiêu', metricValue: 'Giá trị',
  weightKgsOrder: 'Kg theo đơn', dataSource: 'Nguồn', reportPeriodEnd: 'Ngày cuối kỳ gộp', sourceDateLabel: 'Ngày nguồn',
}

const inputClass = 'w-full rounded border border-outline px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary'
const buttonClass = 'rounded border border-outline px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50'

function monthFromFileName(fileName: string): { month: string; year: string } | null {
  const match = /(?:^|[^\d])(0[1-9]|1[0-2])-(\d{4})(?!\d)/.exec(fileName)
  return match ? { month: String(Number(match[1])), year: match[2] } : null
}

function displayValue(key: string, value: unknown): string {
  if (key === 'orderId') return value ? 'Đã gắn item' : 'Chưa gắn item'
  if (value == null || value === '') return '—'
  if (value instanceof Date) return value.toISOString().slice(0, 10).split('-').reverse().join('/')
  if ((key === 'reportDate' || key === 'reportPeriodEnd' || key === 'date' || key === 'txDate') && typeof value === 'string') {
    const date = value.slice(0, 10)
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date.split('-').reverse().join('/')
  }
  if (Array.isArray(value)) return value.map(String).join(' · ') || '—'
  if (typeof value === 'object') return JSON.stringify(value)
  if (typeof value === 'number') return value.toLocaleString('vi-VN', { maximumFractionDigits: 2 })
  if (typeof value === 'boolean') return value ? 'Có' : 'Không'
  return String(value)
}

function displayDate(value: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.split('-').reverse().join('/') : value
}

function sumField(rows: ImportReviewRow[], field: string): number {
  return rows.reduce((total, row) => total + (typeof row[field] === 'number' && Number.isFinite(row[field]) ? row[field] as number : 0), 0)
}

function sheetTotals(sheet: StatisticalReportSheet, rows: ImportReviewRow[]): string {
  const number = (value: number) => value.toLocaleString('vi-VN', { maximumFractionDigits: 2 })
  if (sheet === 'HDPE') return `${rows.length.toLocaleString('vi-VN')} vật tư`
  if (sheet === 'EXTRUDER') return `${number(sumField(rows, 'weightKgs'))} kg`
  if (sheet === 'WARPING') return `${number(sumField(rows, 'weightKgs'))} kg · ${number(sumField(rows, 'quantity'))} beam`
  if (sheet === 'KNITTING') return `${number(sumField(rows, 'mValue'))} m · ${number(sumField(rows, 'weightKgs'))} kg`
  const byMetric = new Map<string, number>()
  for (const row of rows) {
    const label = typeof row.metricLabel === 'string' ? row.metricLabel : ''
    if (label && typeof row.metricValue === 'number') byMetric.set(label, (byMetric.get(label) ?? 0) + row.metricValue)
  }
  return Array.from(byMetric.entries()).slice(0, 3).map(([label, value]) => `${label}: ${number(value)}`).join(' · ') || `${rows.length.toLocaleString('vi-VN')} chỉ tiêu`
}

function previewOutcome(sheet: StatisticalReportSheet, payload: Record<string, unknown>): string {
  if (sheet === 'HDPE' && payload.counts && typeof payload.counts === 'object') {
    const counts = payload.counts as Record<string, unknown>
    return `Mới ${Number(counts.new ?? 0)} · sửa ${Number(counts.updated ?? 0)} · giữ nguyên ${Number(counts.identical ?? 0)} · bỏ qua ${Number(counts.invalid ?? 0) + Number(counts.unknown_material ?? 0) + Number(counts.ambiguous ?? 0)}`
  }
  if (sheet === 'ROLLING' && Array.isArray(payload.replacementDays)) {
    const days = payload.replacementDays as RollingDayComparison[]
    return `${days.length} ngày · đối chiếu từng dòng · dòng vắng mặt sẽ được giữ nguyên`
  }
  const rows = Array.isArray(payload.rows) ? payload.rows.length : 0
  return rows ? `${rows.toLocaleString('vi-VN')} dòng · tự thêm mới/cập nhật, không xóa dòng cũ` : 'Sẵn sàng nhập'
}

function fileForm(file: File, extras: Record<string, string> = {}) {
  const form = new FormData()
  form.append('file', file)
  for (const [key, value] of Object.entries(extras)) form.append(key, value)
  return form
}

async function sha256File(file: File): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('Trình duyệt không hỗ trợ tạo mã kiểm tra file.')
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right))
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

export default function ProductionImportWorkspace() {
  const [category, setCategory] = useState<'order' | 'statistical'>('statistical')
  const [file, setFile] = useState<File | null>(null)
  const [sourceFile, setSourceFile] = useState<File | null>(null)
  const [sourceFileHash, setSourceFileHash] = useState('')
  const [month, setMonth] = useState('')
  const [year, setYear] = useState('')
  const [dragging, setDragging] = useState(false)
  const [previews, setPreviews] = useState<SheetPreview[]>([])
  const [previewNeedsRefresh, setPreviewNeedsRefresh] = useState(false)
  const [activeSheet, setActiveSheet] = useState<StatisticalReportSheet>('HDPE')
  const [resolutions, setResolutions] = useState<Resolutions>({})
  const [remarkDecisions, setRemarkDecisions] = useState<Record<string, 'MESH' | 'NOTE'>>({})
  const [page, setPage] = useState(1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [outcomes, setOutcomes] = useState<Partial<Record<StatisticalReportSheet, ImportOutcome>>>({})
  const [batches, setBatches] = useState<ImportBatchSummary[]>([])
  const [historyCursor, setHistoryCursor] = useState<{ createdAt: string; id: string } | null>(null)
  const [historyHasMore, setHistoryHasMore] = useState(false)
  const [historyView, setHistoryView] = useState<ImportBatchDetail | null>(null)
  const [historySheet, setHistorySheet] = useState<StatisticalReportSheet>('EXTRUDER')
  const [activeBatchId, setActiveBatchId] = useState('')
  const [historyPage, setHistoryPage] = useState(1)
  const [historySheetLoading, setHistorySheetLoading] = useState(false)
  const [historySheetError, setHistorySheetError] = useState('')
  const [historyError, setHistoryError] = useState('')
  const [historyLoading, setHistoryLoading] = useState(false)
  const historyRequestId = useRef(0)
  const [message, setMessage] = useState('')

  const reportMonth = month && year ? `${year}-${String(Number(month)).padStart(2, '0')}` : ''
  const previewBySheet = useMemo(() => new Map(previews.map(preview => [preview.sheet, preview])), [previews])
  const current = previewBySheet.get(activeSheet)
  const rows = current?.rows ?? []
  const summary = useMemo(() => summarizeImportRows(rows, reportMonth), [rows, reportMonth])
  const pageSize = 50
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize))
  const visibleRows = rows.slice((page - 1) * pageSize, page * pageSize)
  const columns = Array.from(new Set(rows.flatMap(row => Object.keys(row))))
  const historicalRows = historyView?.sheet.sheetName === historySheet ? historyView.sheet.sourceRows : []
  const historyPageSize = 50
  const historyPageCount = Math.max(1, Math.ceil(historicalRows.length / historyPageSize))
  const visibleHistoryRows = historicalRows.slice((historyPage - 1) * historyPageSize, historyPage * historyPageSize)
  const historyColumns = Array.from(new Set(historicalRows.flatMap(row => Object.keys(row))))
  const hdpePreview = previewBySheet.get('HDPE')?.payload
  const unknownMaterials = Array.isArray(hdpePreview?.unknownMaterials) ? hdpePreview.unknownMaterials as UnknownMaterial[] : []
  const hdpeStockUpdates = Array.isArray(hdpePreview?.stockUpdates) ? hdpePreview.stockUpdates as HdpeStockUpdate[] : []
  const hdpeStockKept = Array.isArray(hdpePreview?.stockKept) ? hdpePreview.stockKept as HdpeStockKept[] : []
  const hdpeSkippedRows = Array.isArray(hdpePreview?.skippedRows) ? hdpePreview.skippedRows as HdpeSkippedRow[] : []
  const knittingPreview = previewBySheet.get('KNITTING')?.payload
  const remarkValues = Array.isArray(knittingPreview?.remarkValues) ? knittingPreview.remarkValues as RemarkValue[] : []
  const unknownRemarks = remarkValues.filter(value => value.status === 'UNKNOWN')
  const invalidRowCount = previews.reduce((total, preview) => total + summarizeImportRows(preview.rows, reportMonth).invalidRows, 0)
  const rollingPreview = previewBySheet.get('ROLLING')?.payload
  const replacementDays = Array.isArray(rollingPreview?.replacementDays) ? rollingPreview.replacementDays as RollingDayComparison[] : []
  const skippedRollingDateBlocks = Array.isArray(rollingPreview?.skippedDateBlocks) ? rollingPreview.skippedDateBlocks as RollingSkippedDateBlock[] : []
  const missingRollingPiCount = new Set(replacementDays.flatMap(day => day.missingPIs)).size
  const rollingInvalidMetricCount = Array.isArray(rollingPreview?.invalidMetrics) ? rollingPreview.invalidMetrics.length : 0
  const allDone = STATISTICAL_REPORT_SHEETS.every(sheet => outcomes[sheet]?.state === 'done')
  const hasUncertainOutcome = Object.values(outcomes).some(outcome => outcome?.state === 'uncertain')
  const hasReadySheet = previews.length === STATISTICAL_REPORT_SHEETS.length && STATISTICAL_REPORT_SHEETS.some(sheet => !previewBySheet.get(sheet)?.error)
  const hasPeriodConflict = previews.some(preview => summarizeImportRows(preview.rows, reportMonth).outOfPeriodDates.length > 0)
  const canConfirm = Boolean(file && hasReadySheet && !busy && !allDone && !hasUncertainOutcome && !previewNeedsRefresh && !hasPeriodConflict)
  const hasPartialOutcome = Object.values(outcomes).some(outcome => outcome?.state === 'done') && !allDone

  const reloadBatchHistory = useCallback(async (append = false, requestedCursor: { createdAt: string; id: string } | null = null) => {
    setHistoryLoading(true); setHistoryError('')
    const params = new URLSearchParams({ limit: '25' })
    if (reportMonth) params.set('month', reportMonth)
    if (append && requestedCursor) { params.set('cursorAt', requestedCursor.createdAt); params.set('cursorId', requestedCursor.id) }
    const requestId = ++historyRequestId.current
    const requestMonth = reportMonth
    try {
      const response = await fetch(`/api/production-imports?${params}`)
      const data = await response.json() as { success?: boolean; batches?: ImportBatchSummary[]; hasMore?: boolean; nextCursor?: { createdAt: string; id: string } | null; error?: string }
      if (!response.ok || !data.success) throw new Error(data.error ?? 'Không tải được lịch sử import.')
      if (requestId !== historyRequestId.current || requestMonth !== reportMonth) return
      setBatches(currentBatches => append ? [...currentBatches, ...(data.batches ?? [])] : data.batches ?? [])
      setHistoryHasMore(Boolean(data.hasMore))
      setHistoryCursor(data.nextCursor ?? null)
    } catch (problem) {
      if (requestId === historyRequestId.current && requestMonth === reportMonth) setHistoryError(problem instanceof Error ? problem.message : 'Không tải được lịch sử import.')
    } finally { if (requestId === historyRequestId.current) setHistoryLoading(false) }
  }, [reportMonth])

  useEffect(() => { if (category === 'statistical') void reloadBatchHistory() }, [category, reloadBatchHistory])

  function acceptFile(next: File | null) {
    if (busy) return
    if (next && !next.name.toLowerCase().endsWith('.xlsx')) { setFile(null); setSourceFile(null); setSourceFileHash(''); setPreviews([]); setOutcomes({}); setError('Chỉ nhận workbook Excel .xlsx.'); return }
    if (next && next.size > 10 * 1024 * 1024) { setFile(null); setSourceFile(null); setSourceFileHash(''); setPreviews([]); setOutcomes({}); setError('File phải nhỏ hơn hoặc bằng 10 MB.'); return }
    setSourceFile(next)
    setSourceFileHash('')
    setFile(next)
    setPreviews([])
    setPreviewNeedsRefresh(false)
    setOutcomes({})
    setActiveBatchId('')
    setHistoryView(null)
    setMessage('')
    setResolutions({})
    setRemarkDecisions({})
    setError('')
    setPage(1)
    const suggested = next ? monthFromFileName(next.name) : null
    if (suggested) {
      setMonth(suggested.month); setYear(suggested.year)
      if (next && category === 'statistical') void previewWorkbook(next, suggested, true)
    }
  }

  async function requestPreview(sheet: StatisticalReportSheet, source: File, selectedMonth: string, selectedYear: string, selectedResolutions: Resolutions = resolutions): Promise<SheetPreview> {
    const query = sheet === 'HDPE'
      ? '/api/materials/import-history'
      : sheet === 'EXTRUDER'
        ? '/api/extruder/import'
        : sheet === 'WARPING'
          ? '/api/warping/import'
          : sheet === 'KNITTING'
            ? '/api/knitting/detail/import'
            : '/api/materials/rolling/import'
    const extra: Record<string, string> = sheet === 'HDPE'
      ? { resolutions: JSON.stringify(selectedResolutions) }
      : sheet === 'ROLLING'
        ? { month: String(Number(selectedMonth)), year: selectedYear }
        : {}
    const response = await fetch(query, { method: 'POST', body: fileForm(source, extra) })
    const payload = await response.json() as Record<string, unknown>
    if (!response.ok || payload.success !== true) {
      return { sheet, rows: [], payload, error: typeof payload.error === 'string' ? payload.error : `Không đọc được sheet ${sheet}.` }
    }
    const parsedRows = Array.isArray(payload.rows) ? payload.rows.filter((row): row is ImportReviewRow => Boolean(row) && typeof row === 'object') : []
    return { sheet, rows: parsedRows, payload }
  }

  async function previewWorkbook(fileOverride?: File, periodOverride?: { month: string; year: string }, autoConfirm = false) {
    const originalFile = fileOverride ?? sourceFile ?? file
    if (!originalFile) { setError('Kéo thả hoặc chọn workbook Excel trước.'); return }
    const selectedMonth = periodOverride?.month ?? month
    const selectedYear = periodOverride?.year ?? year
    const selectedReportMonth = selectedMonth && selectedYear ? `${selectedYear}-${String(Number(selectedMonth)).padStart(2, '0')}` : ''
    if (!/^\d{4}-\d{2}$/.test(selectedReportMonth)) { setError('Chọn tháng và năm báo cáo hợp lệ.'); return }
    if (Number(selectedMonth) < 1 || Number(selectedMonth) > 12 || Number(selectedYear) < 1900 || Number(selectedYear) > 2100) { setError('Chọn tháng và năm trong khoảng hợp lệ.'); return }
    setBusy(true); setError(''); setPreviews([]); setPage(1)
    try {
      const [uploadFile, contentHash] = await Promise.all([prepareStatisticalReportUpload(originalFile), sha256File(originalFile)])
      setFile(uploadFile)
      setSourceFileHash(contentHash)
      const selectedResolutions = fileOverride ? {} : resolutions
      const results = await Promise.all(STATISTICAL_REPORT_SHEETS.map(async sheet => {
        try { return await requestPreview(sheet, uploadFile, selectedMonth, selectedYear, selectedResolutions) }
        catch { return { sheet, rows: [], payload: {}, error: `Không kết nối được khi đọc sheet ${sheet}.` } satisfies SheetPreview }
      }))
      setPreviews(results)
      setPreviewNeedsRefresh(false)
      const firstWithRows = results.find(result => result.rows.length)
      if (firstWithRows) setActiveSheet(firstWithRows.sheet)
      if (autoConfirm) {
        const hasReadySheet = results.length === STATISTICAL_REPORT_SHEETS.length && results.some(result => !result.error)
        const hasOutOfPeriod = results.some(result => summarizeImportRows(result.rows, selectedReportMonth).outOfPeriodDates.length > 0)
        if (!hasReadySheet || hasOutOfPeriod) {
          setError(!hasReadySheet ? 'Không đọc được sheet nào để nhập; xem lỗi theo sheet.' : 'Ngày trong file không khớp tháng đã nhận diện; hãy chọn đúng tháng rồi nhập lại.')
        } else {
          setBusy(false)
          await confirmWorkbook({ file: uploadFile, sourceFile: originalFile, sourceFileHash: contentHash, reportMonth: selectedReportMonth, month: selectedMonth, year: selectedYear, previews: results, resolutions: selectedResolutions, remarkDecisions: fileOverride ? {} : remarkDecisions })
        }
      }
    } catch (problem: unknown) {
      setError(problem instanceof ReportUploadError ? problem.message : 'Không thể kết nối để phân tích workbook. Hãy thử lại.')
    } finally { setBusy(false) }
  }

  async function confirmSheet(sheet: StatisticalReportSheet, batchId: string, attemptToken: string, context?: ImportExecutionContext): Promise<ImportOutcome> {
    const activePreviews = context?.previews ?? previews
    const activePreviewBySheet = new Map(activePreviews.map(preview => [preview.sheet, preview]))
    const activeFile = context?.file ?? file
    const activeMonth = context?.month ?? month
    const activeYear = context?.year ?? year
    const activeReportMonth = context?.reportMonth ?? reportMonth
    const activeResolutions = context?.resolutions ?? resolutions
    const activeRemarkDecisions = context?.remarkDecisions ?? remarkDecisions
    const preview = activePreviewBySheet.get(sheet)
    if (!preview || !activeFile) return { state: 'failed', message: 'Thiếu dữ liệu xem trước.' }
    let response: Response
    if (sheet === 'HDPE') {
      response = await fetch('/api/materials/import-history/confirm', {
        method: 'POST', body: fileForm(activeFile, { resolutions: JSON.stringify(activeResolutions), expectedSnapshot: String(preview.payload.expectedSnapshot ?? ''), importBatchId: batchId, importAttemptToken: attemptToken }),
      })
    } else if (sheet === 'EXTRUDER') {
      response = await fetch('/api/extruder/import/confirm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rows: preview.rows, sourceFileName: activeFile.name, reportMonth: activeReportMonth, importAttempt: { batchId, token: attemptToken } }) })
    } else if (sheet === 'WARPING') {
      response = await fetch('/api/warping/import/confirm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rows: preview.rows, sourceFileName: activeFile.name, reportMonth: activeReportMonth, importAttempt: { batchId, token: attemptToken } }) })
    } else if (sheet === 'KNITTING') {
      response = await fetch('/api/knitting/detail/import/confirm', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: preview.rows, sourceFileName: activeFile.name, reportMonth: activeReportMonth, remarkDecisions: Object.entries(activeRemarkDecisions).map(([value, target]) => ({ value, target })), importAttempt: { batchId, token: attemptToken } }),
      })
    } else {
      const extra: Record<string, string> = {
        month: String(Number(activeMonth)), year: activeYear,
        expectedSnapshot: String(preview.payload.expectedSnapshot ?? ''),
        importBatchId: batchId,
        importAttemptToken: attemptToken,
      }
      response = await fetch('/api/materials/rolling/import/confirm', { method: 'POST', body: fileForm(activeFile, extra) })
    }
    const payload = await response.json() as Record<string, unknown>
    if (!response.ok || payload.success !== true) return {
      state: response.status >= 500 ? 'uncertain' : 'failed',
      message: typeof payload.error === 'string' ? payload.error : `Import ${sheet} thất bại.`,
      needsPreviewRefresh: response.status >= 400,
    }
    const count = Number(payload.recordsAdded ?? payload.recordsInserted ?? payload.created ?? payload.totalRows ?? 0)
    const updated = Number(payload.recordsUpdated ?? payload.updated ?? 0)
    const payloadCounts = payload.counts && typeof payload.counts === 'object' ? payload.counts as Record<string, unknown> : {}
    const unchanged = Number(payload.recordsUnchanged ?? payloadCounts.identical ?? 0)
    const invalidSkipped = Number(payload.invalidSkipped ?? (Number(payloadCounts.invalid ?? 0) + Number(payloadCounts.unknown_material ?? 0) + Number(payloadCounts.ambiguous ?? 0)))
    const missing = Number(payload.missingInSource ?? 0)
    const ambiguous = Number(payload.ambiguousSkipped ?? 0)
    const rowSummary = `Thêm ${count.toLocaleString('vi-VN')} · sửa ${updated.toLocaleString('vi-VN')} · không đổi ${unchanged.toLocaleString('vi-VN')} · bỏ qua ${invalidSkipped.toLocaleString('vi-VN') + ambiguous.toLocaleString('vi-VN')}`
    if (sheet === 'HDPE') {
      return { state: 'done', message: `${rowSummary} snapshot tồn kho.`, count, added: count, updated, unchanged, skipped: invalidSkipped + ambiguous }
    }
    return { state: 'done', message: `${rowSummary}${missing ? ` · giữ nguyên ${missing.toLocaleString('vi-VN')} dòng vắng khỏi file` : ''}.`, count, added: count, updated, unchanged, skipped: invalidSkipped + ambiguous }
  }

  async function createImportBatch(context?: ImportExecutionContext): Promise<{ batch: ImportBatchSummary; existing: boolean }> {
    const activeSourceFile = context?.sourceFile ?? sourceFile
    const activeSourceFileHash = context?.sourceFileHash ?? sourceFileHash
    const activeReportMonth = context?.reportMonth ?? reportMonth
    const activeResolutions = context?.resolutions ?? resolutions
    const activeRemarkDecisions = context?.remarkDecisions ?? remarkDecisions
    if (!activeSourceFileHash || !activeSourceFile) throw new Error('Chưa tính được mã nhận diện file gốc; hãy phân tích lại workbook.')
    const decisions = {
      materials: Object.fromEntries(Object.entries(activeResolutions).sort(([a], [b]) => a.localeCompare(b))),
      knittingRemarks: Object.fromEntries(Object.entries(activeRemarkDecisions).sort(([a], [b]) => a.localeCompare(b))),
      defaults: { unknownMaterial: 'skip', unknownKnittingRemark: 'NOTE' },
    }
    const response = await fetch('/api/production-imports', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName: activeSourceFile.name, fileHash: activeSourceFileHash, reportMonth: activeReportMonth, selectedSheets: STATISTICAL_REPORT_SHEETS, decisions }),
    })
    const data = await response.json() as { success?: boolean; existing?: boolean; batch?: ImportBatchSummary; error?: string }
    if (!response.ok || !data.success || !data.batch) throw new Error(data.error ?? 'Không tạo được phiên lịch sử import.')
    return { batch: data.batch, existing: Boolean(data.existing) }
  }

  async function updateBatchSheet(id: string, sheet: StatisticalReportSheet, state: 'PREPARED' | 'PROCESSING' | 'CONFIRMED' | 'FAILED' | 'UNCERTAIN' | 'RECONCILE_CONFIRMED' | 'RECONCILE_FAILED', sourceRows?: ImportReviewRow[], result: Record<string, unknown> = {}, attemptToken?: string): Promise<{ attemptToken?: string; sheetStatus?: string }> {
    const response = await fetch(`/api/production-imports/${encodeURIComponent(id)}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sheet, state, ...(sourceRows ? { sourceRows } : {}), ...(attemptToken ? { attemptToken } : {}), result }),
    })
    const data = await response.json() as { success?: boolean; attemptToken?: string; sheetStatus?: string; error?: string }
    if (!response.ok || !data.success) throw new Error(data.error ?? `Không lưu được lịch sử sheet ${sheet}.`)
    return { attemptToken: data.attemptToken, sheetStatus: data.sheetStatus }
  }

  async function openHistoricalSheet(importId: string, sheet: StatisticalReportSheet) {
    setHistorySheetLoading(true); setHistorySheetError('')
    try {
      const response = await fetch(`/api/production-imports/${encodeURIComponent(importId)}?sheet=${sheet}`)
      const data = await response.json() as { success?: boolean; batch?: ImportBatchSummary & { decisions: Record<string, unknown> }; sheet?: ImportBatchSheetDetail; error?: string }
      if (!response.ok || !data.success || !data.batch || !data.sheet) throw new Error(data.error ?? 'Không tải được snapshot lịch sử.')
      setHistoryView({ ...data.batch, sheet: data.sheet })
      setHistorySheet(sheet); setHistoryPage(1)
    } catch (problem) { setHistorySheetError(problem instanceof Error ? problem.message : 'Không tải được snapshot lịch sử.') }
    finally { setHistorySheetLoading(false) }
  }

  async function reconcileUncertainSheet(sheet: StatisticalReportSheet, written: boolean) {
    if (!activeBatchId || busy) return
    const instruction = written
      ? `Xác nhận rằng ${sheet} đã được ghi đầy đủ vào dữ liệu hiện hành sau khi bạn đối chiếu với snapshot lịch sử?`
      : `Xác nhận rằng ${sheet} CHƯA được ghi vào dữ liệu hiện hành sau khi bạn đối chiếu với snapshot lịch sử? Sheet sẽ được mở lại để thử import.`
    if (!window.confirm(`${instruction}\n\nChỉ tiếp tục sau khi đối chiếu đúng tháng, ngày và máy.`)) return
    setBusy(true); setError('')
    try {
      await updateBatchSheet(activeBatchId, sheet, written ? 'RECONCILE_CONFIRMED' : 'RECONCILE_FAILED', undefined, { message: written ? 'Quản lý xác nhận đã ghi sau khi đối chiếu snapshot.' : 'Quản lý xác nhận chưa ghi; cho phép thử import lại.' })
      setOutcomes(currentOutcomes => ({ ...currentOutcomes, [sheet]: { state: written ? 'done' : 'failed', message: written ? 'Đã đối soát: dữ liệu hiện hành khớp snapshot.' : 'Đã đối soát: chưa ghi; có thể thử lại sheet này.' } }))
      setMessage(written ? `Đã ghi nhận đối soát ${sheet} là hoàn tất.` : `Đã ghi nhận đối soát ${sheet} chưa được import; có thể thử lại.`)
      await reloadBatchHistory()
    } catch (problem) { setError(problem instanceof Error ? problem.message : 'Không ghi được kết quả đối soát.') }
    finally { setBusy(false) }
  }

  function restoreBatchOutcomes(sheetResults: ImportBatchSummary['sheetResults']): Partial<Record<StatisticalReportSheet, ImportOutcome>> {
    const restored: Partial<Record<StatisticalReportSheet, ImportOutcome>> = {}
    for (const sheet of STATISTICAL_REPORT_SHEETS) {
      const result = sheetResults[sheet]
      if (result?.status === 'CONFIRMED') restored[sheet] = { state: 'done', message: typeof result.result?.message === 'string' ? result.result.message : 'Đã import ở phiên trước.' }
      else if (result?.status === 'FAILED') restored[sheet] = { state: 'failed', message: typeof result.result?.message === 'string' ? result.result.message : 'Sheet cần thử lại.' }
      else if (result?.status === 'PROCESSING' || result?.status === 'UNCERTAIN') restored[sheet] = { state: 'uncertain', message: 'Lần chạy trước bị gián đoạn trong lúc ghi; cần đối soát dữ liệu hiện hành trước khi tiếp tục để tránh ghi đè.' }
    }
    return restored
  }

  async function confirmWorkbook(context?: ImportExecutionContext) {
    const activePreviews = context?.previews ?? previews
    const activePreviewBySheet = new Map(activePreviews.map(preview => [preview.sheet, preview]))
    const activeFile = context?.file ?? file
    const activeReportMonth = context?.reportMonth ?? reportMonth
    const activeResolutions = context?.resolutions ?? resolutions
    const activeRemarkDecisions = context?.remarkDecisions ?? remarkDecisions
    const contextReady = Boolean(context && activeFile && activePreviews.length === STATISTICAL_REPORT_SHEETS.length && activePreviews.some(preview => !preview.error) && !activePreviews.some(preview => summarizeImportRows(preview.rows, activeReportMonth).outOfPeriodDates.length))
    if (context ? !contextReady : !canConfirm) return
    const oversizedSheet = activePreviews.find(preview => new TextEncoder().encode(JSON.stringify(preview.rows)).length > 3_800_000)
    if (oversizedSheet) { setError(`Snapshot ${oversizedSheet.sheet} vượt giới hạn lịch sử phiên bản; chưa ghi dữ liệu công đoạn.`); return }
    setBusy(true); setError(''); setMessage('Đang đối chiếu file và cập nhật sản lượng…')
    try {
      const { batch, existing } = await createImportBatch(context)
      setActiveBatchId(batch.id)
      const priorOutcomes = restoreBatchOutcomes(batch.sheetResults)
      setOutcomes(priorOutcomes)
      if (existing && batch.status === 'CONFIRMED') {
        setMessage('File này đã được nhập; không có dữ liệu trùng được tạo thêm.')
        await reloadBatchHistory()
        return
      }
      if (existing && batch.decisions && stableJson(batch.decisions) !== stableJson({
        materials: Object.fromEntries(Object.entries(activeResolutions).sort(([a], [b]) => a.localeCompare(b))),
        knittingRemarks: Object.fromEntries(Object.entries(activeRemarkDecisions).sort(([a], [b]) => a.localeCompare(b))),
        defaults: { unknownMaterial: 'skip', unknownKnittingRemark: 'NOTE' },
      })) {
        const saved = batch.decisions as { materials?: Record<string, Resolution>; knittingRemarks?: Record<string, 'MESH' | 'NOTE'> }
        setResolutions(saved.materials ?? {})
        setRemarkDecisions(saved.knittingRemarks ?? {})
        setPreviewNeedsRefresh(true)
        setError('Phiên bản này đã lưu lựa chọn ánh xạ trước đó. Mình đã khôi phục các lựa chọn đó; hãy phân tích lại để đảm bảo lần thử tiếp tục dùng đúng dữ liệu đã review.')
        return
      }
      if (Object.values(priorOutcomes).some(outcome => outcome?.state === 'uncertain')) {
        setError('Phiên này có sheet bị gián đoạn khi ghi dữ liệu. Hệ thống đã chặn chạy lại tự động; hãy đối soát dữ liệu hiện hành với snapshot trong Lịch sử import trước khi tạo một phiên bản mới.')
        return
      }
      // Persist every reviewed sheet before the first business write, so the
      // history version remains complete even if the browser closes mid-import.
      for (const sheet of STATISTICAL_REPORT_SHEETS) {
        const priorStatus = batch.sheetResults[sheet]?.status
        if (priorStatus === 'CONFIRMED' || priorStatus === 'PROCESSING' || priorStatus === 'UNCERTAIN') continue
        const preview = activePreviewBySheet.get(sheet)
        if (!preview) { setError(`Thiếu preview của sheet ${sheet}.`); return }
        await updateBatchSheet(batch.id, sheet, 'PREPARED', preview.rows)
      }
      const pending = STATISTICAL_REPORT_SHEETS.filter(sheet => priorOutcomes[sheet]?.state !== 'done')
      const workbookOutcomes: ImportOutcome[] = []
      for (const sheet of pending) {
        const preview = activePreviewBySheet.get(sheet)
        if (!preview) { setError(`Thiếu preview của sheet ${sheet}.`); return }
        let outcome: ImportOutcome
        let attemptToken: string | undefined
        try { attemptToken = (await updateBatchSheet(batch.id, sheet, 'PROCESSING')).attemptToken }
        catch (historyError) {
          outcome = { state: 'uncertain', message: historyError instanceof Error ? historyError.message : `Không xác định được trạng thái claim sheet ${sheet}.` }
          setOutcomes(currentOutcomes => ({ ...currentOutcomes, [sheet]: outcome }))
          setError(outcome.message)
          return
        }
        if (!attemptToken) {
          outcome = { state: 'uncertain', message: `Không nhận được mã lần ghi cho ${sheet}; cần đối soát trước khi tiếp tục.` }
          setOutcomes(currentOutcomes => ({ ...currentOutcomes, [sheet]: outcome }))
          setError(outcome.message)
          return
        }
        if (preview.error) outcome = { state: 'failed', message: `Bỏ qua sheet ${sheet}: ${preview.error}` }
        else {
          try { outcome = await confirmSheet(sheet, batch.id, attemptToken, context) }
          catch { outcome = { state: 'uncertain', message: `Mất kết nối trong lúc import ${sheet}; chưa thể xác định dữ liệu đã được ghi hay chưa.` } }
        }
        try {
          const finalized = await updateBatchSheet(batch.id, sheet, outcome.state === 'done' ? 'CONFIRMED' : outcome.state === 'uncertain' ? 'UNCERTAIN' : 'FAILED', undefined, { message: outcome.message, count: outcome.count ?? null }, attemptToken)
          if (outcome.state === 'uncertain' && finalized.sheetStatus === 'CONFIRMED') outcome = { state: 'done', message: 'Dữ liệu đã được ghi; trạng thái được khôi phục từ receipt của transaction.' }
        } catch (historyError) {
          outcome = { state: 'uncertain', message: `Kết quả ${sheet} chưa được ghi vào lịch sử; cần đối soát trước khi chạy lại.`, needsPreviewRefresh: true }
          setError(historyError instanceof Error ? `${outcome.message} ${historyError.message}` : outcome.message)
        }
        workbookOutcomes.push(outcome)
        setOutcomes(currentOutcomes => ({ ...currentOutcomes, [sheet]: outcome }))
        if (outcome.state === 'uncertain') {
          if (outcome.needsPreviewRefresh) setPreviewNeedsRefresh(true)
          setError(currentError => currentError || `Đã dừng tại sheet ${sheet}; trạng thái ghi chưa xác định nên hệ thống chặn chạy lặp.`)
          await reloadBatchHistory()
          return
        }
        if (outcome.state === 'failed') setMessage(current => current ? `${current} · ${outcome.message}` : outcome.message)
      }
      const totals = workbookOutcomes.reduce((sum, outcome) => ({
        added: sum.added + (outcome.added ?? 0), updated: sum.updated + (outcome.updated ?? 0),
        unchanged: sum.unchanged + (outcome.unchanged ?? 0), skipped: sum.skipped + (outcome.skipped ?? 0),
      }), { added: 0, updated: 0, unchanged: 0, skipped: 0 })
      const priorCount = STATISTICAL_REPORT_SHEETS.filter(sheet => priorOutcomes[sheet]?.state === 'done').length
      const completedCount = priorCount + workbookOutcomes.filter(outcome => outcome.state === 'done').length
      setMessage(`${completedCount}/5 sheet xử lý · thêm ${totals.added} · cập nhật ${totals.updated} · không đổi ${totals.unchanged} · bỏ qua ${totals.skipped}${completedCount < 5 ? ' · một số sheet cần xử lý lại' : ''}`)
      await reloadBatchHistory()
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Không thể tạo hoặc cập nhật lịch sử phiên import; chưa thể xác nhận workbook. Hãy thử lại.')
    } finally { setBusy(false) }
  }

  if (category === 'order') {
    return <section className="space-y-4 px-4 py-6 md:px-8">
      <div><h2 className="text-xl font-semibold text-primary">Nhập đơn hàng</h2><p className="mt-1 text-sm text-secondary">Dùng luồng import Order List hiện có để xem trước và xác nhận đơn.</p></div>
      <label className="block max-w-md text-sm">Loại file<select disabled={busy} className={`${inputClass} mt-1`} value={category} onChange={event => setCategory(event.target.value as 'order' | 'statistical')}><option value="order">Đơn hàng (ORDER LIST / PO)</option><option value="statistical">Báo cáo sản lượng (STATISTICAL REPORT)</option></select></label>
      <ImportOrdersModal />
    </section>
  }

  const control = inputClass
  return <section className="space-y-5 px-4 py-6 md:px-8">
    <header><h2 className="text-xl font-semibold text-primary">Import báo cáo nhà xưởng</h2><p className="mt-1 text-sm text-secondary">Thả file để tự đối chiếu và nhập dòng mới/đã sửa. Dòng lỗi được bỏ qua riêng; dòng cũ không tự xóa.</p></header>
    <div className="grid gap-3 md:grid-cols-2">
      <label className="text-sm">Loại file
        <select disabled={busy} className={`${control} mt-1`} value={category} onChange={event => setCategory(event.target.value as 'order' | 'statistical')}>
          <option value="order">Đơn hàng (ORDER LIST / PO)</option><option value="statistical">Báo cáo sản lượng (STATISTICAL REPORT)</option>
        </select>
      </label>
      <div className="text-sm"><span className="font-medium">Sheet sẽ đọc</span><div className="mt-2 flex flex-wrap gap-2">{STATISTICAL_REPORT_SHEETS.map(sheet => <span key={sheet} className="rounded border border-outline-variant bg-surface-container px-2 py-1">{sheet}</span>)}</div></div>
    </div>
    {error && <p role="alert" className="rounded border border-error/40 bg-error-container/30 p-3 text-sm text-error">{error}</p>}
    {message && !Object.keys(outcomes).length && <p role="status" className="rounded border border-primary/30 bg-primary/5 p-3 text-sm text-primary">{message}</p>}
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm">Tháng báo cáo<select disabled={busy} className={`${control} mt-1`} value={month} onChange={event => { setMonth(event.target.value); setPreviews([]); setOutcomes({}) }}><option value="">Chọn tháng</option>{Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={String(index + 1)}>{index + 1}</option>)}</select></label>
      <label className="text-sm">Năm báo cáo<input disabled={busy} className={`${control} mt-1`} type="number" min="2000" max="2100" value={year} onChange={event => { setYear(event.target.value); setPreviews([]); setOutcomes({}) }} placeholder="2026" /></label>
    </div>
    <div
      className={`rounded border-2 border-dashed p-6 text-center transition-colors ${dragging ? 'border-primary bg-primary/5' : 'border-outline-variant'}`}
      onDragOver={event => { event.preventDefault(); if (!busy) setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={event => { event.preventDefault(); setDragging(false); if (!busy) acceptFile(event.dataTransfer.files?.[0] ?? null) }}
    >
      <input id="production-report-file" className="sr-only focus:not-sr-only focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary" type="file" accept=".xlsx" disabled={busy} onChange={event => { acceptFile(event.target.files?.[0] ?? null); event.currentTarget.value = '' }} />
      <label htmlFor="production-report-file" className="cursor-pointer">
        <span aria-hidden="true" className="material-symbols-outlined text-3xl text-primary">upload_file</span>
        <span className="mt-2 block text-sm font-medium">{file ? file.name : 'Kéo thả file .xlsx vào đây hoặc bấm để chọn'}</span>
        <span className="mt-1 block text-xs text-secondary">Tối đa 10 MB · Tên file có tháng/năm sẽ tự nhập ngay sau khi phân tích</span>
      </label>
    </div>
    <div className="flex flex-wrap gap-2">
      <button type="button" className="rounded bg-primary px-4 py-2 text-sm text-white disabled:opacity-50" disabled={busy || !file || !month || !year} onClick={() => { void previewWorkbook(undefined, undefined, true) }}>{busy ? 'Đang phân tích và nhập…' : previews.length ? 'Phân tích và nhập lại file' : 'Nhập file'}</button>
      {previews.length > 0 && hasPartialOutcome && <button type="button" className={buttonClass} disabled={!canConfirm} onClick={() => { void confirmWorkbook() }}>{busy ? 'Đang nhập…' : 'Thử lại sheet chưa hoàn tất'}</button>}
    </div>

    {previews.length > 0 && <>
      {Object.keys(outcomes).length > 0 && <section aria-label="Kết quả nhập theo sheet" className="rounded border border-outline-variant bg-surface-container-low p-4"><h3 className="font-semibold text-primary">Kết quả nhập</h3><p className="mt-1 text-sm">{message}</p><ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{STATISTICAL_REPORT_SHEETS.filter(sheet => outcomes[sheet]).map(sheet => <li key={sheet} className="rounded border border-outline-variant bg-surface-container-lowest p-3 text-sm"><span className="font-medium">{LABELS[sheet]}</span><span className="mt-1 block text-secondary">{outcomes[sheet]?.message}</span></li>)}</ul></section>}
      <details open={hasUncertainOutcome} className="rounded border border-outline-variant bg-surface-container-low p-3">
      <summary className="cursor-pointer font-medium text-primary">Xem chi tiết các sheet, dòng bị bỏ qua và dữ liệu nguồn</summary>
      <nav role="tablist" aria-label="Sheet xem trước" className="flex gap-2 overflow-x-auto border-b border-outline-variant">
        {STATISTICAL_REPORT_SHEETS.map(sheet => {
          const item = previewBySheet.get(sheet)
          return <button key={sheet} type="button" role="tab" aria-selected={activeSheet === sheet} className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm ${activeSheet === sheet ? 'border-primary font-semibold text-primary' : 'border-transparent text-secondary'}`} onClick={() => { setActiveSheet(sheet); setPage(1) }}>
            {LABELS[sheet]}{item?.error ? ' · lỗi' : item ? ` · ${item.rows.length}` : ''}
          </button>
        })}
      </nav>
      <section aria-labelledby="preview-sheet-title" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2"><div><h3 id="preview-sheet-title" className="font-semibold text-primary">Xem trước: {activeSheet}</h3><p className="text-xs text-secondary">{summary.totalRows.toLocaleString('vi-VN')} dòng · {summary.dates.length ? `${displayDate(summary.dates[0])} → ${displayDate(summary.dates.at(-1)!)}` : 'Không có ngày đọc được'}</p></div><p className="text-xs text-secondary">Trang {page}/{pageCount} · {pageSize} dòng/trang</p></div>
        {current?.error ? <p role="alert" className="rounded border border-error/40 p-3 text-sm text-error">{current.error}</p> : !rows.length ? <p role="status" className="text-sm text-secondary">Sheet không có dòng xem trước.</p> : <div className="max-h-[34rem] overflow-auto rounded border border-outline-variant"><table className="w-full min-w-max text-sm"><thead className="sticky top-0 bg-surface-container"><tr>{columns.map(column => <th key={column} className="whitespace-nowrap p-2 text-left">{FIELD_LABELS[column] ?? column}</th>)}</tr></thead><tbody>{visibleRows.map((row, index) => <tr key={`${activeSheet}:${page}:${index}`} className="border-t border-outline-variant">{columns.map(column => <td key={column} className="max-w-[280px] whitespace-nowrap p-2">{displayValue(column, row[column])}</td>)}</tr>)}</tbody></table></div>}
        <div className="flex gap-2"><button type="button" className={buttonClass} disabled={page <= 1} onClick={() => setPage(value => Math.max(1, value - 1))}>Trước</button><button type="button" className={buttonClass} disabled={page >= pageCount} onClick={() => setPage(value => Math.min(pageCount, value + 1))}>Sau</button></div>
      </section>

      <section aria-labelledby="review-import-title" className="space-y-3 rounded border border-outline-variant bg-surface-container-low p-4">
        <div><h3 id="review-import-title" className="font-semibold text-primary">Đối chiếu file đã nhập</h3><p className="text-xs text-secondary">Kỳ {reportMonth}. Dòng hợp lệ trong kỳ được nhập tự động; ngoài kỳ không tự đổi ngày.</p></div>
        <div className="overflow-x-auto rounded border border-outline-variant"><table className="w-full text-sm"><thead className="bg-surface-container"><tr>{['Sheet', 'Đưa vào', 'Dòng', 'Tổng xem trước', 'Lỗi', 'PI nguồn', 'Chưa gắn item', 'PI sẽ đối chiếu', 'Ngoài kỳ', 'Kết quả'].map(label => <th key={label} className="whitespace-nowrap p-2 text-left">{label}</th>)}</tr></thead><tbody>{STATISTICAL_REPORT_SHEETS.map(sheet => {
          const item = previewBySheet.get(sheet)
          const review = summarizeImportRows(item?.rows ?? [], reportMonth)
          const outcome = outcomes[sheet]
          const skippedErrors = sheet === 'ROLLING' ? rollingInvalidMetricCount + skippedRollingDateBlocks.filter(block => block.blocked || block.hasData).length : review.invalidRows
          return <tr key={sheet} className="border-t border-outline-variant"><td className="p-2">{sheet}</td><td className="p-2">{DESTINATION_LABELS[sheet]}</td><td className="p-2">{review.totalRows}</td><td className="max-w-[320px] p-2">{sheetTotals(sheet, item?.rows ?? [])}</td><td className="p-2">{skippedErrors}</td><td className="p-2">{review.sourceRowsWithPI}</td><td className="p-2">{review.rowsNotLinkedToItem}</td><td className="p-2">{review.rowsPendingItemResolution}</td><td className="p-2">{review.outOfPeriodDates.length ? review.outOfPeriodDates.map(displayDate).join(', ') : 0}</td><td className="p-2">{outcome?.message ?? item?.error ?? (item ? previewOutcome(sheet, item.payload) : 'Chưa phân tích')}{outcome?.state === 'uncertain' && activeBatchId && <div className="mt-2 flex flex-wrap gap-1"><button type="button" className={buttonClass} disabled={busy} onClick={() => { void reconcileUncertainSheet(sheet, true) }}>Đã đối chiếu: đã ghi</button><button type="button" className={buttonClass} disabled={busy} onClick={() => { void reconcileUncertainSheet(sheet, false) }}>Đã đối chiếu: chưa ghi</button></div>}</td></tr>
        })}</tbody></table></div>
        {hasPeriodConflict && <p role="alert" className="text-sm text-error">Có ngày nằm ngoài tháng đã chọn. Hãy kiểm tra kỳ báo cáo hoặc file rồi phân tích lại.</p>}
        {skippedRollingDateBlocks.length > 0 && <details className="rounded border border-outline-variant bg-surface-container-lowest p-3 text-sm"><summary className="cursor-pointer font-medium">Khối ngày ROLLING được bỏ qua · {skippedRollingDateBlocks.length}</summary><ul className="mt-2 list-disc space-y-1 pl-5">{skippedRollingDateBlocks.map((block, index) => <li key={`${block.dateLabelRaw}:${index}`} className={block.blocked || block.hasData ? 'text-error' : 'text-secondary'}>{block.dateLabelRaw}: {block.note ?? 'Ngày không hợp lệ'}{block.hasData ? ' · Bỏ qua khối lỗi; dữ liệu đã có được giữ nguyên.' : ' · Khối rỗng, không nhập.'}</li>)}</ul></details>}
        <p className="text-xs text-secondary">Dòng hợp lệ được tự thêm hoặc cập nhật; dòng không đổi được bỏ qua. Dòng lỗi, mã mơ hồ và dòng cũ vắng khỏi file được giữ lại, không tự xóa.</p>
      {unknownMaterials.length > 0 && <details className="rounded border border-outline-variant bg-surface-container-lowest p-3 text-sm"><summary className="cursor-pointer font-medium">Vật tư chưa có trong danh mục — sẽ bỏ qua {unknownMaterials.length}</summary><ul className="mt-2 list-disc space-y-1 pl-5">{unknownMaterials.map(material => <li key={material.materialKey}>{material.name} · {material.group}{material.candidates.length ? ` · có thể gần với: ${material.candidates.map(candidate => candidate.name).join(', ')}` : ''}</li>)}</ul></details>}
        {hdpePreview && <div className="space-y-2 rounded border border-outline-variant bg-surface-container-lowest p-3 text-sm">
          <p className="font-medium">Tác động tồn kho HDPE: {hdpeStockUpdates.length} vật tư sẽ cập nhật · {hdpeStockKept.length} vật tư giữ nguyên.</p>
          {hdpeStockUpdates.slice(0, 5).map(item => <p key={item.materialId}>{item.name}: {item.from?.stock ?? 'mới'} → {item.to.stock.toLocaleString('vi-VN')} kg · {displayDate(item.to.date)}</p>)}
          {hdpeStockUpdates.length > 5 && <p className="text-xs text-secondary">Còn {hdpeStockUpdates.length - 5} vật tư khác sẽ cập nhật.</p>}
          {hdpeStockKept.slice(0, 5).map(item => <p key={item.materialId} className="text-secondary">{item.name}: giữ tồn ({item.reason})</p>)}
        </div>}
        {hdpeSkippedRows.length > 0 && <details className="rounded border border-outline-variant bg-surface-container-lowest p-3 text-sm"><summary className="cursor-pointer font-medium">HDPE — dòng không ghi hoặc cần xử lý ({hdpeSkippedRows.length})</summary><div className="mt-2 max-h-64 overflow-auto"><table className="w-full min-w-[650px] text-sm"><thead className="sticky top-0 bg-surface-container"><tr>{['Ngày', 'Dòng Excel', 'Vật tư', 'Trạng thái', 'Lý do'].map(label => <th key={label} className="p-2 text-left">{label}</th>)}</tr></thead><tbody>{hdpeSkippedRows.map((row, index) => <tr key={`${row.reportDate}:${row.sourceRow}:${index}`} className="border-t border-outline-variant"><td className="p-2 whitespace-nowrap">{displayDate(row.reportDate)}</td><td className="p-2">{row.sourceRow}</td><td className="p-2">{row.materialName} · {row.group}</td><td className="p-2">{row.status}</td><td className="p-2">{row.reasons.join('; ')}{row.differences?.map(diff => <span key={diff.field} className="block">{diff.field}: đã lưu {displayValue(diff.field, diff.stored)}, file {displayValue(diff.field, diff.incoming)}</span>)}</td></tr>)}</tbody></table></div></details>}
        {unknownRemarks.length > 0 && <details className="rounded border border-outline-variant bg-surface-container-lowest p-3 text-sm"><summary className="cursor-pointer font-medium">REMARK KNITTING chưa nhận diện — giữ dạng ghi chú ({unknownRemarks.length})</summary><ul className="mt-2 list-disc space-y-1 pl-5">{unknownRemarks.map(value => <li key={remarkKey(value.value)}>{value.value} · {value.count} dòng</li>)}</ul></details>}
        {replacementDays.length > 0 && <details className="rounded border border-outline-variant bg-surface-container-lowest p-3 text-sm"><summary className="cursor-pointer font-medium">Đối chiếu ROLLING · {replacementDays.length} ngày</summary><div className="mt-2 overflow-x-auto"><table className="w-full min-w-[520px] text-sm"><thead><tr><th className="p-2 text-left">Ngày</th><th className="p-2 text-right">Đang có</th><th className="p-2 text-right">Trong file</th><th className="p-2 text-left">PI vắng trong file (sẽ giữ)</th></tr></thead><tbody>{replacementDays.map(day => <tr key={day.date} className="border-t border-outline-variant"><td className="p-2">{displayDate(day.date)}</td><td className="p-2 text-right">{day.currentCount}</td><td className="p-2 text-right">{day.incomingCount}</td><td className="p-2">{day.missingPIs.join(', ') || '—'}</td></tr>)}</tbody></table></div></details>}
        {missingRollingPiCount > 0 && <p role="status" className="text-sm text-secondary">Có {missingRollingPiCount.toLocaleString('vi-VN')} mã PI không thấy trong file mới; dữ liệu cũ sẽ được giữ nguyên.</p>}
        {invalidRowCount > 0 && <p role="status" className="text-sm text-secondary">Có {invalidRowCount.toLocaleString('vi-VN')} dòng lỗi; các dòng này sẽ được bỏ qua, dữ liệu hiện có vẫn giữ nguyên.</p>}
        {unknownMaterials.length > 0 && <p role="status" className="text-sm text-secondary">Vật tư chưa khớp sẽ được bỏ qua mặc định; chọn ánh xạ hoặc tạo mới chỉ khi cần.</p>}
        {previewNeedsRefresh && <p role="status" className="text-sm">Lựa chọn hoặc dữ liệu đã thay đổi; hãy phân tích lại workbook trước khi xác nhận.</p>}
        {Object.keys(outcomes).length > 0 && <p role="status" className="text-sm">Import được xử lý theo từng sheet. Sheet bị gián đoạn sẽ chờ đối soát snapshot trước khi cho phép chạy lại.</p>}
        {hasUncertainOutcome && <p role="alert" className="rounded border border-error/40 bg-error-container/30 p-3 text-sm text-error">Có sheet bị gián đoạn. Sau 15 phút, đối chiếu dữ liệu hiện hành với snapshot rồi chọn một trong hai kết quả để tránh ghi lặp hoặc ghi đè phiên mới hơn.</p>}
      </section>
      </details>
    </>}

    <details className="rounded border border-outline-variant bg-surface-container-low p-4"><summary className="cursor-pointer font-semibold text-primary">Lịch sử phiên bản báo cáo</summary><section aria-labelledby="import-history-title" className="mt-3 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 id="import-history-title" className="font-semibold text-primary">Lịch sử phiên bản báo cáo</h3><p className="text-xs text-secondary">Mỗi workbook được giữ như một phiên bản; dữ liệu hiện hành vẫn theo chính sách thay thế của từng sheet.</p></div><button type="button" className={buttonClass} disabled={historyLoading || busy} onClick={() => { void reloadBatchHistory() }}>{historyLoading ? 'Đang tải…' : 'Tải lại'}</button></div>
      {historyError && <p role="alert" className="text-sm text-error">{historyError}</p>}
      {!historyView && historySheetError && <p role="alert" className="text-sm text-error">{historySheetError}</p>}
      {!historyError && batches.length === 0 && <p role="status" className="text-sm text-secondary">Chưa có phiên import báo cáo cho kỳ này.</p>}
      {batches.length > 0 && <div className="overflow-x-auto rounded border border-outline-variant"><table className="w-full min-w-[700px] text-sm"><thead className="bg-surface-container"><tr>{['File', 'Tháng', 'Thời điểm', 'Trạng thái', 'Sheet', ''].map(label => <th key={label} className="whitespace-nowrap p-2 text-left">{label}</th>)}</tr></thead><tbody>{batches.map(batch => <tr key={batch.id} className="border-t border-outline-variant"><td className="p-2">{batch.fileName}</td><td className="p-2">{batch.reportMonth}</td><td className="p-2 whitespace-nowrap">{new Date(batch.createdAt).toLocaleString('vi-VN')}</td><td className="p-2">{batch.status === 'CONFIRMED' ? 'Đã nhập' : batch.status === 'PARTIAL' ? 'Một phần / cần xử lý' : batch.status === 'PREPARED' ? 'Đã lưu review' : 'Đang xử lý'}</td><td className="p-2">{STATISTICAL_REPORT_SHEETS.map(sheet => `${sheet}: ${batch.sheetResults[sheet]?.status ?? 'PENDING'}`).join(' · ')}</td><td className="p-2"><button type="button" className="text-primary underline" disabled={historySheetLoading} onClick={() => { void openHistoricalSheet(batch.id, 'EXTRUDER') }}>Xem bản ghi</button></td></tr>)}</tbody></table><div className="flex items-center justify-between gap-2 border-t border-outline-variant p-2 text-xs"><span>Đang hiển thị {batches.length} phiên</span>{historyHasMore && <button type="button" className={buttonClass} disabled={historyLoading} onClick={() => { void reloadBatchHistory(true, historyCursor) }}>{historyLoading ? 'Đang tải…' : 'Tải thêm phiên cũ'}</button>}</div></div>}
      {historyView && <div className="space-y-3 rounded border border-outline-variant bg-surface-container-lowest p-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-medium">{historyView.fileName} · {historyView.reportMonth} · sheet {historyView.sheet.sheetName} · {historyView.sheet.sourceRows.length.toLocaleString('vi-VN')} dòng</p><button type="button" className={buttonClass} onClick={() => setHistoryView(null)}>Đóng snapshot</button></div>
        <nav role="tablist" aria-label="Sheet trong phiên bản lịch sử" className="flex gap-2 overflow-x-auto border-b border-outline-variant">{STATISTICAL_REPORT_SHEETS.map(sheet => <button key={sheet} type="button" role="tab" aria-selected={historySheet === sheet} disabled={historySheetLoading} className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm ${historySheet === sheet ? 'border-primary font-semibold text-primary' : 'border-transparent text-secondary'}`} onClick={() => { setHistorySheet(sheet); void openHistoricalSheet(historyView.id, sheet) }}>{LABELS[sheet]} · {historyView.sheetResults[sheet]?.status ?? 'PENDING'}</button>)}</nav>
        {historySheetError && <p role="alert" className="text-sm text-error">{historySheetError}</p>}
        {historySheetLoading ? <p role="status" className="text-sm">Đang tải snapshot…</p> : historicalRows.length === 0 ? <p role="status" className="text-sm text-secondary">Không có dòng được lưu cho sheet này.</p> : <><div className="max-h-80 overflow-auto rounded border border-outline-variant"><table className="w-full min-w-max text-sm"><thead className="sticky top-0 bg-surface-container"><tr>{historyColumns.map(column => <th key={column} className="whitespace-nowrap p-2 text-left">{FIELD_LABELS[column] ?? column}</th>)}</tr></thead><tbody>{visibleHistoryRows.map((row, index) => <tr key={`${historySheet}:${historyPage}:${index}`} className="border-t border-outline-variant">{historyColumns.map(column => <td key={column} className="max-w-[280px] whitespace-nowrap p-2">{displayValue(column, row[column])}</td>)}</tr>)}</tbody></table></div><div className="flex items-center gap-2 text-xs"><span>Trang {historyPage}/{historyPageCount}</span><button type="button" className={buttonClass} disabled={historyPage <= 1} onClick={() => setHistoryPage(value => Math.max(1, value - 1))}>Trước</button><button type="button" className={buttonClass} disabled={historyPage >= historyPageCount} onClick={() => setHistoryPage(value => Math.min(historyPageCount, value + 1))}>Sau</button></div></>}</div>}
    </section></details>
  </section>
}
