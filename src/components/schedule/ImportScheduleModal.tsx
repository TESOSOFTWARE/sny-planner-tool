'use client'

// src/components/schedule/ImportScheduleModal.tsx
// 3-step modal for importing monthly production schedule (.xlsx)
// Step 1: File selection & Sheet selection
// Step 2: Full preview (assignments to delete, M-023 decision, assignments to create, drafts, manual list)
// Step 3: Success report

import { useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { lineLabel } from '@/lib/schedule/piDisplay'
import { useScheduleModalFocus } from './useModalFocus'
import { schedulePeriodKey, type SchedulePeriod, type SchedulePeriodConfirmation } from '@/lib/schedule/importPeriod'

interface Props {
  isOpen: boolean
  onClose: () => void
  onImported: () => void
  onCalendarChanged?: () => Promise<void>
}

interface AssignmentRef {
  id: string
  machineId: string
  piNumber: string
  startDate: string
  endDate: string
  productionMeters?: number
}

interface AssignmentToCreate {
  machineId: string
  piNumber: string
  startDate: string
  endDate: string
}

interface MachineSpecEntry {
  machineId: string
  widthM: number
}

interface FirstLineLink {
  piNumber: string
  lineCount: number
  orderId: string
  subLineIndex: number
  isPlaceholder: boolean
  cellCount: number
}

interface DraftOrder {
  piNumber: string
  rawValues: string[]
  cellCount: number
  nonPiName: boolean
}

interface SupersededDraftPreview {
  draftOrderId: string
  draftPiNumber: string
  realPiNumber: string
  cellCount: number
}
interface SupersededDraftResult {
  draftOrderId: string
  draftPiNumber: string
  realPiNumber: string
  movedCount: number
  remainingAssignments: number
}

interface ImportResult {
  supersededDrafts: SupersededDraftResult[]
  firstLineLinked: FirstLineLink[]
  draftOrdersCreated: (DraftOrder & { orderId: string })[]
}

function ClassificationTables({ firstLines, drafts, manual = [], completed = false }: {
  firstLines: FirstLineLink[]; drafts: DraftOrder[]; manual?: { rawValue: string; reason: string }[]; completed?: boolean
}) {
  return <div className="w-full space-y-4 text-left">
    <section aria-label="Gắn dòng đầu — cần kiểm dòng" className="rounded-lg border border-amber-300 bg-amber-50 p-3">
      <h4 className="text-sm font-semibold text-amber-900">Gắn dòng đầu — cần kiểm dòng ({firstLines.length} PI)</h4>
      <p className="mt-1 text-xs text-amber-900">{completed ? 'Đã gắn' : 'Sẽ gắn'} dòng đầu. Kiểm tra lại thông số; mở Chi tiết → Chỉnh sửa để đổi dòng.</p>
      {firstLines.length ? <div className="mt-2 max-h-48 overflow-auto"><table className="w-full text-left text-xs"><thead><tr>{['PI', 'Số dòng', 'Dòng được gắn', 'Số ô'].map(label => <th key={label} className="px-2 py-1">{label}</th>)}</tr></thead><tbody>{firstLines.map(line => <tr key={line.piNumber} className="border-t border-amber-200"><td className="break-words px-2 py-1">{line.piNumber}</td><td className="px-2 py-1">{line.lineCount}</td><td className="px-2 py-1">Dòng {lineLabel(line)}</td><td className="px-2 py-1">{line.cellCount}</td></tr>)}</tbody></table></div> : <p className="mt-2 text-xs text-secondary">Không có PI nhiều dòng.</p>}
    </section>
    <section aria-label={completed ? 'Đơn nháp đã tạo' : 'Đơn nháp sẽ tạo'} className="rounded-lg border border-outline-variant p-3">
      <h4 className="text-sm font-semibold">{completed ? 'Đơn nháp đã tạo' : 'Đơn nháp sẽ tạo'} ({drafts.length} mã)</h4>
      <p className="mt-1 text-xs text-secondary">Lịch của đơn nháp là giữ chỗ; khách hàng chưa xác định.</p>
      {drafts.length ? <div className="mt-2 max-h-48 overflow-auto"><table className="w-full text-left text-xs"><thead><tr>{['Mã nháp', 'Nội dung ô gốc', 'Số ô'].map(label => <th key={label} className="px-2 py-1">{label}</th>)}</tr></thead><tbody>{drafts.map(draft => <tr key={draft.piNumber} className="border-t border-outline-variant"><td className="break-words px-2 py-1">{draft.piNumber}{draft.nonPiName && <span className="mt-1 block text-amber-900">Tên không giống PI</span>}</td><td className="break-words px-2 py-1">{draft.rawValues.map(raw => <div key={raw}>{raw}</div>)}</td><td className="px-2 py-1">{draft.cellCount}</td></tr>)}</tbody></table></div> : <p className="mt-2 text-xs text-secondary">Không có đơn nháp mới.</p>}
    </section>
    {!completed && <section aria-label="Cần gán tay" className="rounded-lg border border-outline-variant p-3">
      <h4 className="text-sm font-semibold">Cần gán tay ({manual.length} ô)</h4>
      {manual.length ? <div className="mt-2 max-h-48 overflow-auto"><table className="w-full text-left text-xs"><thead><tr><th className="px-2 py-1">Nội dung ô gốc</th><th className="px-2 py-1">Lý do</th></tr></thead><tbody>{manual.map((item, index) => <tr key={`${item.rawValue}-${index}`} className="border-t border-outline-variant"><td className="break-words px-2 py-1">{item.rawValue}</td><td className="break-words px-2 py-1">{item.reason}</td></tr>)}</tbody></table></div> : <p className="mt-2 text-xs text-secondary">Không có ô cần gán tay.</p>}
    </section>}
  </div>
}

function SupersededDraftTable({ previewRows, resultRows }: {
  previewRows?: SupersededDraftPreview[]; resultRows?: SupersededDraftResult[]
}) {
  const rows = resultRows ?? previewRows ?? []
  if (!rows.length) return null
  return <section aria-label="Nháp đã có đơn thật" className="w-full rounded-lg border border-outline-variant p-3 text-left">
    <h4 className="text-sm font-semibold">Nháp đã có đơn thật ({rows.length} nháp)</h4>
    {!resultRows && <p className="mt-1 text-xs text-secondary">Dự kiến gắn sang đơn thật khi xác nhận.</p>}
    <div className="mt-2 max-h-48 overflow-auto"><table className="w-full text-left text-xs"><thead><tr>
      {(resultRows ? ['Mã nháp', 'Đơn thật', 'Đã gắn vào đơn thật', 'Còn gắn vào nháp'] : ['Mã nháp', 'Đơn thật', 'Số ô']).map(label => <th key={label} className="px-2 py-1">{label}</th>)}
    </tr></thead><tbody>{rows.map(row => <tr key={row.draftOrderId} className="border-t border-outline-variant">
      <td className="break-words px-2 py-1">{row.draftPiNumber}</td><td className="break-words px-2 py-1">{row.realPiNumber}</td>
      {'movedCount' in row ? <><td className="px-2 py-1">{row.movedCount}</td><td className="px-2 py-1">{row.remainingAssignments}</td></> : <td className="px-2 py-1">{row.cellCount}</td>}
    </tr>)}</tbody></table></div>
    {resultRows?.map(row => <p key={row.draftOrderId} className="mt-2 text-xs text-secondary"><strong>{row.draftPiNumber}:</strong>{' '}
      {row.remainingAssignments === 0 ? 'Nháp không còn phân công, có thể xoá ở trang Đơn hàng.' : `Còn ${row.remainingAssignments} phân công gắn vào nháp; chuyển bằng Chi tiết → Chỉnh sửa trước khi xoá.`}
    </p>)}
  </section>
}

interface PreviewResponse {
  assignmentSnapshot: { id: string; orderId: string; updatedAt: string }[]
  success: boolean
  error?: string
  availableSheets: string[]
  sheetName: string
  sheetTitle: string
  titlePeriod: SchedulePeriod | null
  periodConfirmation?: SchedulePeriodConfirmation
  year: number
  month: number
  daysInMonth: number
  toDelete: AssignmentRef[]
  borderlineAssignment: AssignmentRef | null
  borderlineAssignments?: AssignmentRef[]
  planSnapshot: string
  supersededDrafts: SupersededDraftPreview[]
  firstLineLinks: FirstLineLink[]
  toCreateDraftOrders: DraftOrder[]
  needsManual: { rawValue: string; reason: string }[]
  toCreateAssignments: AssignmentToCreate[]
  specChanges: { machineId: string; oldWidthM: number | null; newWidthM: number }[]
  machineSpecs: MachineSpecEntry[]
  skippedAmbiguous: string[]
  skippedInvalid: string[]
  yellowDaySuggestions?: { date: string; matches: boolean; hasException: boolean }[]
  summary: {
    singleCount: number
    multiCount: number
    draftCellCount: number
    manualCount: number
    deleteCount: number
    borderlineCount: number
    assignmentsToCreate: number
    draftsToCreate: number
    ambiguousCount: number
    invalidCount: number
    protectedCount?: number
  }
}

type Step = 'upload' | 'preview' | 'success'

export default function ImportScheduleModal({ isOpen, onClose, onImported, onCalendarChanged }: Props) {
  const [step, setStep] = useState<Step>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [sheetNames, setSheetNames] = useState<string[]>([])
  const [sheetName, setSheetName] = useState('')
  const [isReadingSheets, setIsReadingSheets] = useState(false)
  const fileReadRequest = useRef(0)
  const [updateMachineSpecs, setUpdateMachineSpecs] = useState(false)
  const [deleteBorderline, setDeleteBorderline] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<PreviewResponse | null>(null)
  const [successMsg, setSuccessMsg] = useState('')
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [periodConfirmation, setPeriodConfirmation] = useState<SchedulePeriodConfirmation | null>(null)
  const [periodAcknowledged, setPeriodAcknowledged] = useState(false)
  const [selectedYellowDates, setSelectedYellowDates] = useState<string[]>([])
  const [isSavingCalendar, setIsSavingCalendar] = useState(false)
  const [calendarResult, setCalendarResult] = useState('')
  const modalRef = useRef<HTMLDivElement>(null)
  useScheduleModalFocus(isOpen, onClose, modalRef)

  if (!isOpen) return null

  const handleFileChange = async (selectedFile: File | null) => {
    const requestId = ++fileReadRequest.current
    setFile(selectedFile)
    setSheetNames([])
    setSheetName('')
    setPreview(null)
    setPeriodConfirmation(null)
    setPeriodAcknowledged(false)
    setError(null)

    if (!selectedFile) {
      setIsReadingSheets(false)
      return
    }

    if (!selectedFile.name.toLowerCase().endsWith('.xlsx')) {
      setIsReadingSheets(false)
      setError('Vui lòng chọn file Excel định dạng .xlsx.')
      return
    }

    setIsReadingSheets(true)
    try {
      const workbook = XLSX.read(await selectedFile.arrayBuffer())
      if (requestId !== fileReadRequest.current) return

      if (workbook.SheetNames.length === 0) {
        setError('File Excel không có sheet nào để chọn.')
        return
      }

      setSheetNames(workbook.SheetNames)
    } catch {
      if (requestId === fileReadRequest.current) {
        setError('Không đọc được danh sách sheet. Vui lòng kiểm tra file Excel rồi chọn lại.')
      }
    } finally {
      if (requestId === fileReadRequest.current) setIsReadingSheets(false)
    }
  }

  // ── Step 1: Preview ────────────────────────────────────────────────────────
  const handlePreview = async () => {
    if (!file) {
      setError('Vui lòng chọn file .xlsx')
      return
    }
    if (!sheetName || !sheetNames.includes(sheetName)) {
      setError('Vui lòng chọn một sheet có trong file Excel.')
      return
    }
    setError(null)
    setIsLoading(true)

    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('sheetName', sheetName)
      if (periodConfirmation && periodAcknowledged) {
        fd.append('acknowledgedPeriod', schedulePeriodKey(periodConfirmation.importPeriod))
      }

      const res = await fetch('/api/schedule/import', {
        method: 'POST',
        body: fd,
      })
      const data = (await res.json()) as PreviewResponse

      if (!res.ok || !data.success) {
        setPeriodConfirmation(data.periodConfirmation ?? null)
        setPeriodAcknowledged(false)
        setError(data.error ?? 'Không thể đọc file Excel.')
        return
      }

      setUpdateMachineSpecs(false)
      setPreview(data)
      setSelectedYellowDates([])
      setCalendarResult('')
      setStep('preview')
    } catch {
      setError('Lỗi kết nối mạng.')
    } finally {
      setIsLoading(false)
    }
  }

  // ── Step 2: Confirm ────────────────────────────────────────────────────────
  const applySelectedDays = async () => {
    if (!preview || selectedYellowDates.length === 0) return
    const dates = selectedYellowDates.filter(date => preview.yellowDaySuggestions?.some(day => day.date === date && !day.matches && !day.hasException))
    if (dates.length === 0) return
    setIsSavingCalendar(true)
    setError(null)
    try {
      const response = await fetch('/api/calendar/batch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ days: dates.map(date => ({ date, kind: 'CLOSURE', note: `Theo file lịch ${preview.sheetName}` })) }) })
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.error ?? 'Không lưu được ngày nghỉ đã chọn')
      const skippedDates = new Set<string>(data.skipped.map((day: { date: string }) => day.date))
      setPreview(current => current ? { ...current, yellowDaySuggestions: current.yellowDaySuggestions?.map(day => dates.includes(day.date) ? { ...day, matches: skippedDates.has(day.date) ? day.matches : true, hasException: true } : day) } : current)
      setSelectedYellowDates([])
      setCalendarResult(`${data.added} thêm · ${data.skipped.length} bỏ qua — ngoại lệ đã có được giữ nguyên`)
      await onCalendarChanged?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không lưu được ngày nghỉ đã chọn')
    } finally { setIsSavingCalendar(false) }
  }

  const handleConfirm = async () => {
    if (!preview || !file) return
    setError(null)
    setIsLoading(true)

    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('sheetName', preview.sheetName)
      fd.append('expectedSnapshot', preview.planSnapshot)
      fd.append('decisions', JSON.stringify({
        assignmentSnapshot: preview.assignmentSnapshot,
        deleteBorderline,
        updateMachineSpecs,
        ...(periodConfirmation && periodAcknowledged
          ? { acknowledgedPeriod: schedulePeriodKey(periodConfirmation.importPeriod) } : {}),
      }))
      const res = await fetch('/api/schedule/import/confirm', { method: 'POST', body: fd })

      const data = await res.json()
      if (!res.ok || !data.success) {
        if (res.status === 409) {
          setPreview(null)
          setImportResult(null)
          setStep('upload')
        }
        setError(data.error ?? 'Không thể lưu dữ liệu.')
        return
      }

      setSuccessMsg(data.message ?? 'Import lịch sản xuất thành công!')
      setImportResult(data.imported)
      setStep('success')
      onImported()
    } catch {
      setError('Lỗi kết nối máy chủ.')
    } finally {
      setIsLoading(false)
    }
  }

  const formatDate = (iso: string) => {
    const d = new Date(iso)
    return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        ref={modalRef} role="dialog" aria-modal="true" aria-label="Import lịch sản xuất"
        className="bg-surface rounded-xl shadow-lg w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden border border-outline-variant"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-outline-variant flex justify-between items-center bg-surface-container-low shrink-0">
          <div>
            <h3 className="text-base font-inter font-semibold text-on-surface">
              Import Lịch Sản Xuất Tháng
            </h3>
            <p className="text-xs text-secondary mt-0.5">
              {step === 'upload' && 'Bước 1: Chọn file Excel và tên Sheet'}
              {step === 'preview' && 'Bước 2: Xem trước và xác nhận dữ liệu import'}
              {step === 'success' && 'Import hoàn tất'}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Đóng"
            className="text-on-surface-variant hover:text-on-surface transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-error-container border border-error/30 text-error text-sm">
              <span className="material-symbols-outlined text-[18px] shrink-0 mt-0.5">error</span>
              <span>{error}</span>
            </div>
          )}

          {/* ── STEP 1: UPLOAD ── */}
          {step === 'upload' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-secondary mb-1">
                  File Excel (.xlsx) <span className="text-error">*</span>
                </label>
                <input
                  type="file"
                  accept=".xlsx"
                  disabled={isLoading}
                  onChange={(e) => {
                    void handleFileChange(e.target.files?.[0] ?? null)
                  }}
                  className="w-full text-sm text-on-surface file:mr-3 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary file:text-on-primary hover:file:bg-primary/90 cursor-pointer"
                />
                {file && (
                  <p className="text-xs text-secondary mt-1 flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px]">description</span>
                    {file.name} ({(file.size / 1024).toFixed(1)} KB)
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-secondary mb-1">
                  Tên Sheet trong file Excel <span className="text-error">*</span>
                </label>
                <select
                  value={sheetName}
                  onChange={(e) => {
                    setSheetName(e.target.value)
                    setPeriodConfirmation(null)
                    setPeriodAcknowledged(false)
                    setError(null)
                  }}
                  disabled={isLoading || !file || isReadingSheets || sheetNames.length === 0}
                  className="w-full max-w-[360px] h-10 px-3 rounded-lg border border-outline bg-surface text-on-surface text-sm focus:outline-none focus:border-primary transition-colors disabled:opacity-60"
                >
                  <option value="">
                    {isReadingSheets
                      ? 'Đang đọc danh sách sheet...'
                      : sheetNames.length > 0
                        ? 'Chọn sheet chứa lịch máy...'
                        : 'Chọn file Excel trước'}
                  </option>
                  {sheetNames.map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
                <p className="text-xs text-outline mt-1">
                  Chọn sheet chứa lịch máy trong danh sách đọc từ file Excel đã chọn.
                </p>
              </div>
            </div>
          )}

          {step === 'upload' && periodConfirmation && (
            <div className="rounded-lg border border-outline bg-surface-container p-3 text-sm space-y-2">
              <p>Tên sheet <strong>{periodConfirmation.sheetName}</strong> cho kỳ {periodConfirmation.importPeriod.month}/{periodConfirmation.importPeriod.year},
                nhưng tiêu đề nguồn ghi <strong>{periodConfirmation.sheetTitle}</strong>.</p>
              <label className="flex items-start gap-2">
                <input type="checkbox" checked={periodAcknowledged}
                  onChange={e => setPeriodAcknowledged(e.target.checked)}
                  className="mt-1 accent-primary" />
                <span>Tôi đã đối chiếu file và xác nhận dùng kỳ {periodConfirmation.importPeriod.month}/{periodConfirmation.importPeriod.year} theo tên sheet.</span>
              </label>
              <p className="text-secondary">Nếu kỳ này không đúng, hãy chọn sheet khác hoặc chỉnh lại file nguồn trước khi tiếp tục.</p>
            </div>
          )}

          {/* ── STEP 2: PREVIEW ── */}
          {step === 'preview' && preview && (
            <div className="space-y-6">
              <div className="rounded-lg border border-outline-variant bg-surface-container p-3 text-sm">
                <p><strong>Sheet:</strong> {preview.sheetName}</p>
                <p><strong>Kỳ import:</strong> {preview.month}/{preview.year}</p>
                <p><strong>Tiêu đề nguồn:</strong> {preview.sheetTitle || 'Chưa đọc được tiêu đề'}</p>
                {preview.sheetTitle && !preview.titlePeriod && (
                  <p className="mt-1 text-secondary">Chưa đọc được kỳ từ tiêu đề. Vui lòng đối chiếu kỳ import với file nguồn.</p>
                )}
              </div>
              {(preview.yellowDaySuggestions?.length ?? 0) > 0 && <section aria-label="Ngày tô vàng trong file" className="rounded-lg border border-amber-300 bg-amber-100 p-3 text-xs">
                <h4 className="font-semibold text-on-surface">Ngày tô vàng trong file — so với lịch nhà máy</h4>
                <p className="mt-1 text-secondary">Màu vàng là gợi ý ngày nghỉ. Chọn ngày lệch rồi áp dụng riêng; không tự thay lịch đã lưu hoặc ghi đè ngoại lệ.</p>
                <div className="mt-2 space-y-1">{preview.yellowDaySuggestions?.map(day => {
                  const dateLabel = day.date.split('-').reverse().join('/')
                  return day.matches || day.hasException
                    ? <p key={day.date}>{dateLabel} — {day.matches ? 'khớp' : 'lệch'}{day.hasException ? ' · đã có ngoại lệ, giữ nguyên' : ''}</p>
                    : <label key={day.date} className="flex items-center gap-2"><input type="checkbox" disabled={isSavingCalendar || isLoading} checked={selectedYellowDates.includes(day.date)} onChange={event => setSelectedYellowDates(event.target.checked ? [...selectedYellowDates, day.date] : selectedYellowDates.filter(date => date !== day.date))} /><span>{dateLabel} — lệch (ngày làm việc)</span></label>
                })}</div>
                <button type="button" disabled={selectedYellowDates.length === 0 || isSavingCalendar || isLoading} onClick={() => void applySelectedDays()} className="mt-2 rounded bg-primary px-3 py-2 text-xs text-white disabled:opacity-50">{isSavingCalendar ? 'Đang lưu ngày nghỉ…' : 'Áp dụng ngày nghỉ đã chọn'}</button>
                {calendarResult && <p role="status" className="mt-2 text-primary">{calendarResult}</p>}
              </section>}
              {(preview.specChanges?.length ?? 0) > 0 && (
                <section className="rounded-lg border border-outline-variant p-3 text-xs space-y-2" aria-label="Khổ máy thay đổi">
                  <h4 className="font-semibold">Khổ máy thay đổi</h4>
                  <div className="max-h-36 overflow-auto"><table className="w-full text-left"><thead><tr><th>Máy</th><th>Khổ đang lưu (m)</th><th>Khổ theo file (m)</th></tr></thead><tbody>
                    {preview.specChanges.map(spec => <tr key={spec.machineId}><td>{spec.machineId}</td><td>{spec.oldWidthM?.toLocaleString('vi-VN') ?? 'Chưa có'}</td><td>{spec.newWidthM.toLocaleString('vi-VN')}</td></tr>)}
                  </tbody></table></div>
                  <label className="flex items-center gap-2"><input type="checkbox" checked={updateMachineSpecs} disabled={isLoading} onChange={event => setUpdateMachineSpecs(event.target.checked)} />Cập nhật khổ máy theo file</label>
                  <p className="text-secondary">Không chọn: giữ nguyên khổ máy đang lưu.</p>
                </section>
              )}
              <section aria-label="Phân loại ô lịch" className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {[
                  ['Khớp một dòng', preview.summary.singleCount],
                  ['Gắn dòng đầu', preview.summary.multiCount],
                  ['Tạo lịch giữ chỗ', preview.summary.draftCellCount],
                  ['Cần gán tay', preview.summary.manualCount],
                  ['Không hợp lệ', preview.summary.invalidCount],
                ].map(([label, count]) => <div key={label} className="rounded-lg border border-outline-variant bg-surface-container p-3"><span className="block text-xs text-secondary">{label}</span><span className="text-lg font-semibold">{count} ô</span></div>)}
              </section>
              {/* Summary Metrics */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-3 rounded-lg bg-surface-container border border-outline-variant">
                  <span className="text-xs text-secondary block mb-1">Dữ liệu sẽ xóa</span>
                  <span className="text-lg font-semibold text-error">
                    {preview.summary.deleteCount} lịch
                  </span>
                </div>
                <div className="p-3 rounded-lg bg-surface-container border border-outline-variant">
                  <span className="text-xs text-secondary block mb-1">Lịch mới sẽ tạo</span>
                  <span className="text-lg font-semibold text-[#15803d]">
                    {preview.summary.assignmentsToCreate} lịch
                  </span>
                </div>
                <div className="p-3 rounded-lg bg-surface-container border border-outline-variant">
                  <span className="text-xs text-secondary block mb-1">Đơn nháp mới</span>
                  <span className="text-lg font-semibold text-[#92400e]">
                    {preview.summary.draftsToCreate} đơn
                  </span>
                </div>
                <div className="p-3 rounded-lg bg-surface-container border border-outline-variant">
                  <span className="text-xs text-secondary block mb-1">Cần gán tay</span>
                  <span className="text-lg font-semibold text-on-surface">
                    {preview.summary.manualCount} ô
                  </span>
                </div>
                {(preview.summary.protectedCount ?? 0) > 0 && (
                  <div className="p-3 rounded-lg bg-error-container border border-error/30">
                    <span className="text-xs text-error block mb-1">Giữ nguyên lịch có sản lượng; bỏ qua lịch mới trùng khoảng máy</span>
                    <span className="text-lg font-semibold text-error">
                      {preview.summary.protectedCount} lịch
                    </span>
                  </div>
                )}
              </div>

              {/* 1. Sẽ xóa */}
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-on-surface flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-error text-[18px]">delete</span>
                  1. Sẽ xóa {preview.toDelete.length} lịch tháng {preview.month}/{preview.year} hiện tại
                </h4>
                {preview.toDelete.length > 0 ? (
                  <div className="max-h-36 overflow-y-auto border border-outline-variant rounded-lg p-2 text-xs font-mono bg-surface-container-lowest">
                    {preview.toDelete.map((item) => (
                      <div key={item.id} className="py-0.5 text-secondary">
                        [{item.machineId}] {item.piNumber} ({formatDate(item.startDate)} → {formatDate(item.endDate)})
                        {item.productionMeters && item.productionMeters > 0 ? ` · ${item.productionMeters}m đã dệt` : ''}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-secondary italic">Không có lịch cũ trùng khớp.</p>
                )}
              </div>

              {/* 2. Cảnh báo Borderline Assignment (M-023) */}
              {(preview.borderlineAssignments ?? (preview.borderlineAssignment ? [preview.borderlineAssignment] : [])).length > 0 && (
                <div className="p-3 rounded-lg bg-[#fffbeb] border border-[#f59e0b]/40 space-y-2">
                  <div className="flex items-start gap-2">
                    <span className="material-symbols-outlined text-[#d97706] text-[20px] shrink-0">
                      warning
                    </span>
                    <div>
                      <h5 className="text-xs font-semibold text-[#92400e]">
                        Cảnh báo lịch vắt ngang tháng (Borderline Assignment)
                      </h5>
                      <p className="text-xs text-[#b45309] mt-0.5">
                        Phát hiện lịch máy{' '}
                        {(preview.borderlineAssignments ?? (preview.borderlineAssignment ? [preview.borderlineAssignment] : [])).map((assignment) => (
                          <span key={assignment.id} className="block">
                            <strong>{assignment.machineId}</strong> (PI: <strong>{assignment.piNumber}</strong>) kéo dài từ{' '}
                            {formatDate(assignment.startDate)} đến {formatDate(assignment.endDate)}
                            {assignment.productionMeters && assignment.productionMeters > 0 ? ` · ${assignment.productionMeters}m đã dệt` : ''}.
                          </span>
                        ))}
                      </p>
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-xs font-medium text-[#78350f] cursor-pointer pt-1 pl-7">
                    <input
                      type="checkbox"
                      checked={deleteBorderline}
                      onChange={(e) => setDeleteBorderline(e.target.checked)}
                      disabled={(preview.borderlineAssignments ?? (preview.borderlineAssignment ? [preview.borderlineAssignment] : [])).some(a => (a.productionMeters ?? 0) > 0)}
                      className="rounded border-[#d97706] text-[#d97706] focus:ring-[#d97706]"
                    />
                    Xóa luôn lịch vắt ngang này để đè lịch mới từ tháng {preview.month}
                  </label>
                </div>
              )}

              <SupersededDraftTable previewRows={preview.supersededDrafts} />
              <ClassificationTables firstLines={preview.firstLineLinks} drafts={preview.toCreateDraftOrders} manual={preview.needsManual} />
              {preview.skippedInvalid.length > 0 && <section className="rounded-lg border border-outline-variant p-3 text-xs" aria-label="Ô không hợp lệ">
                <h4 className="font-semibold">Không hợp lệ — bỏ qua ({preview.summary.invalidCount} ô)</h4>
                <ul className="mt-2 max-h-36 overflow-auto list-disc pl-4">{preview.skippedInvalid.map((reason, index) => <li key={index}>{reason}</li>)}</ul>
              </section>}
            </div>
          )}

          {/* ── STEP 3: SUCCESS ── */}
          {step === 'success' && (
            <div className="flex flex-col items-center justify-center py-8 text-center gap-3">
              <span className="material-symbols-outlined text-[56px] text-[#15803d]">check_circle</span>
              <h4 className="text-lg font-semibold text-on-surface">Import Hoàn Tất!</h4>
              <p className="text-sm text-secondary max-w-md">{successMsg}</p>

              {importResult && <SupersededDraftTable resultRows={importResult.supersededDrafts} />}
              {importResult && <ClassificationTables firstLines={importResult.firstLineLinked} drafts={importResult.draftOrdersCreated} completed />}
              {(preview?.needsManual.length ?? 0) > 0 && <p className="text-xs text-secondary">Còn {preview?.needsManual.length} ô cần gán tay; các ô này chưa được tạo lịch.</p>}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-3 border-t border-outline-variant bg-surface-container-low shrink-0 flex justify-end gap-2">
          {step === 'upload' && (
            <>
              <button
                onClick={onClose}
                className="border border-outline hover:bg-surface-container text-on-surface text-sm font-medium px-4 py-2 rounded-md transition-colors"
              >
                Hủy
              </button>
              <button
                onClick={handlePreview}
                disabled={isLoading || isReadingSheets || !file || !sheetNames.includes(sheetName) || Boolean(periodConfirmation && !periodAcknowledged)}
                className="inline-flex items-center gap-2 bg-primary text-on-primary text-sm font-medium px-4 py-2 rounded-md hover:bg-primary/90 disabled:opacity-60 transition-colors"
              >
                {isLoading ? (
                  <>Đang đọc file...</>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[18px]">preview</span> Xem trước
                  </>
                )}
              </button>
            </>
          )}

          {step === 'preview' && (
            <>
              <button
                onClick={() => {
                  setStep('upload')
                  setError(null)
                }}
                className="border border-outline hover:bg-surface-container text-on-surface text-sm font-medium px-4 py-2 rounded-md transition-colors"
              >
                ← Quay lại
              </button>
              <button
                onClick={handleConfirm}
                disabled={isLoading || isSavingCalendar}
                className="inline-flex items-center gap-2 bg-primary text-on-primary text-sm font-medium px-4 py-2 rounded-md hover:bg-primary/90 disabled:opacity-60 transition-colors"
              >
                {isLoading ? (
                  <>Đang lưu vào DB...</>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[18px]">cloud_upload</span> Xác nhận Import
                  </>
                )}
              </button>
            </>
          )}

          {step === 'success' && (
            <button
              onClick={onClose}
              className="bg-primary text-on-primary text-sm font-medium px-5 py-2 rounded-md hover:bg-primary/90 transition-colors"
            >
              Đóng
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
