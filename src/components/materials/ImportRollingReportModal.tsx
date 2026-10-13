'use client'

// src/components/materials/ImportRollingReportModal.tsx
// 3-step modal: Upload Excel Statistical Report → Preview Dry-Run → Confirm Import to DB.

import { useRef, useState } from 'react'
import { useScheduleModalFocus } from '@/components/schedule/useModalFocus'
import { rollingPeriodFromFileName, validateRollingPeriod, type RollingPeriod } from '@/lib/materials/rollingPeriod'
import { rollingLosses, type RollingDayComparison } from '@/lib/materials/rollingImportSafety'

interface Props {
  onImported: () => void
  onClose:    () => void
}

interface PreviewResponse {
  period:            RollingPeriod
  expectedSnapshot:  string
  periodRequired?:   boolean
  skippedDateBlocks: Array<{ dateLabelRaw: string; note: string | null }>
  success:           boolean
  fileName:          string
  totalMetrics:      number
  totalOrderRows:    number
  summarySkipped:    number
  uniqueOrdersCount: number
  dateRange:         string
  dates:             string[]
  replacementDays:   RollingDayComparison[]
  sampleRows: Array<{
    date:          string
    orderRef:      string | null
    orderId:       string | null
    color:         string | null
    widthM:        number | null
    lengthM:       number | null
    metricLabel:   string
    metricValue:   number
    cellRef:       string
  }>
  error?: string
}

type Step = 'upload' | 'preview' | 'success'

export default function ImportRollingReportModal({ onImported, onClose }: Props) {
  const modalRef = useRef<HTMLDivElement>(null)
  useScheduleModalFocus(true, onClose, modalRef)
  const [month, setMonth] = useState('')
  const [year, setYear] = useState('')
  const selectedPeriod = validateRollingPeriod(month, year)
  const [step, setStep]             = useState<Step>('upload')
  const [file, setFile]             = useState<File | null>(null)
  const [isLoading, setIsLoading]   = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [preview, setPreview]       = useState<PreviewResponse | null>(null)
  const [successMsg, setSuccessMsg] = useState('')
  const [acknowledgeLoss, setAcknowledgeLoss] = useState(false)
  const losses = rollingLosses(preview?.replacementDays ?? [])
  const displayDate = (date: string) => date.split('-').reverse().join('/')

  // ── Step 1: Upload & Preview ───────────────────────────────────────────────

  const handlePreview = async () => {
    if (!file) { setError('Vui lòng chọn file Excel báo cáo sản lượng (.xlsx)'); return }
    if (!selectedPeriod) { setError('Vui lòng chọn tháng và năm hợp lệ.'); return }
    setError(null)
    setIsLoading(true)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('month', String(selectedPeriod.month))
      formData.append('year', String(selectedPeriod.year))

      const res = await fetch('/api/materials/rolling/import', {
        method: 'POST',
        body: formData,
      })
      const data = (await res.json()) as PreviewResponse

      if (!res.ok || !data.success) {
        setError(data.error ?? 'Lỗi khi đọc file Excel báo cáo.')
        return
      }

      setPreview(data)
      setAcknowledgeLoss(false)
      setStep('preview')
    } catch {
      setError('Lỗi kết nối máy chủ.')
    } finally {
      setIsLoading(false)
    }
  }

  // ── Step 2: Confirm & Save to DB ──────────────────────────────────────────

  const handleConfirm = async () => {
    if (!file || !preview || (losses.length > 0 && !acknowledgeLoss)) return
    setError(null)
    setIsLoading(true)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('month', String(preview.period.month))
      formData.append('year', String(preview.period.year))
      formData.append('expectedSnapshot', preview.expectedSnapshot)
      if (acknowledgeLoss) {
        formData.append('acknowledgeLoss', 'true')
        formData.append('acknowledgedLosses', JSON.stringify(losses))
      }

      const res = await fetch('/api/materials/rolling/import/confirm', {
        method: 'POST',
        body: formData,
      })
      const data = (await res.json()) as { success: boolean; recordsInserted?: number; error?: string; replacementDays?: RollingDayComparison[] }

      if (!res.ok || !data.success) {
        setError(data.error ?? 'Lỗi khi lưu dữ liệu Rolling vào cơ sở dữ liệu.')
        if (data.replacementDays) {
          setPreview(previous => previous ? { ...previous, replacementDays: data.replacementDays! } : previous)
          setAcknowledgeLoss(false)
        }
        return
      }

      setSuccessMsg(`Đã import thành công ${data.recordsInserted ?? 0} bản ghi sản lượng Rolling vào CSDL.`)
      setStep('success')
      onImported()
    } catch {
      setError('Lỗi kết nối máy chủ.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="rolling-import-title" className="bg-surface-container-lowest border-[0.5px] border-outline-variant rounded-2xl p-6 max-w-2xl w-full shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">

        {/* Modal Header */}
        <div className="flex items-center justify-between pb-4 border-b border-outline-variant shrink-0">
          <div className="flex items-center gap-2">
            <span aria-hidden="true" className="material-symbols-outlined text-primary text-[24px]">table_chart</span>
            <h2 id="rolling-import-title" className="text-lg font-inter font-semibold text-on-surface">Import Báo Cáo Sản Lượng Rolling</h2>
          </div>
          <button aria-label="Đóng" onClick={onClose} className="p-1 rounded-lg hover:bg-surface-container text-secondary hover:text-on-surface transition-colors">
            <span aria-hidden="true" className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="py-4 overflow-y-auto flex-1 space-y-4">
          {error && (
            <div className="p-3 bg-error-container/40 border border-error/30 rounded-lg flex items-center gap-2 text-error text-sm">
              <span aria-hidden="true" className="material-symbols-outlined text-[18px]">error</span>
              <span>{error}</span>
            </div>
          )}

          {/* STEP 1: Upload */}
          {step === 'upload' && (
            <div className="space-y-4">
              <p className="text-sm text-secondary">
                Tải lên file báo cáo thống kê Excel (`STATISTICAL REPORT MM-YYYY.xlsx`) chứa sheet <strong>ROLLING</strong>.
              </p>

              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm" htmlFor="rolling-month">Tháng
                  <select id="rolling-month" value={month} onChange={event => setMonth(event.target.value)} className="mt-1 w-full rounded border border-outline-variant p-2">
                    <option value="">Chọn tháng</option>{Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}
                  </select>
                </label>
                <label className="text-sm" htmlFor="rolling-year">Năm
                  <input id="rolling-year" type="number" min="1900" max="9999" value={year} onChange={event => setYear(event.target.value)} className="mt-1 w-full rounded border border-outline-variant p-2" />
                </label>
              </div>
              <p className="text-sm">Kỳ đang dùng: {selectedPeriod ? `${String(selectedPeriod.month).padStart(2, '0')}/${selectedPeriod.year}` : 'Chưa chọn'}. Kiểm tra kỳ trước khi xem trước.</p>

              <div className="border-2 border-dashed border-outline-variant rounded-xl p-8 text-center hover:border-primary/50 transition-colors">
                <input
                  type="file"
                  accept=".xlsx"
                  id="rolling-file-input"
                  onChange={(e) => {
                    const nextFile = e.target.files?.[0] ?? null
                    setFile(nextFile)
                    setPreview(null)
                    setError(null)
                    const suggested = nextFile ? rollingPeriodFromFileName(nextFile.name) : null
                    setMonth(suggested ? String(suggested.month) : '')
                    setYear(suggested ? String(suggested.year) : '')
                  }}
                  className="sr-only focus:not-sr-only focus:outline focus:outline-2 focus:outline-primary"
                />
                <label htmlFor="rolling-file-input" className="cursor-pointer space-y-2 block">
                  <span aria-hidden="true" className="material-symbols-outlined text-[40px] text-primary">upload_file</span>
                  <p className="text-sm font-medium text-on-surface">
                    {file ? file.name : 'Nhấp để chọn file Excel báo cáo (.xlsx)'}
                  </p>
                  <p className="text-xs text-secondary">Dung lượng tối đa 10MB</p>
                </label>
              </div>
            </div>
          )}

          {/* STEP 2: Preview Dry-Run */}
          {step === 'preview' && preview && (
            <div className="space-y-4">
              <p className="text-sm font-semibold">Kỳ đang dùng: {String(preview.period.month).padStart(2, '0')}/{preview.period.year}</p>
              {preview.skippedDateBlocks.length > 0 && <div role="status" className="p-3 border border-amber-400 bg-amber-50 text-sm">
                <p>Bỏ qua {preview.skippedDateBlocks.length} khối ngày không hợp lệ:</p>
                <ul>{preview.skippedDateBlocks.map((block, index) => <li key={index}>{block.note}</li>)}</ul>
              </div>}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 bg-surface-container rounded-lg border border-outline-variant">
                  <p className="text-xs text-secondary">File nguồn</p>
                  <p className="text-sm font-semibold text-on-surface truncate">{preview.fileName}</p>
                </div>
                <div className="p-3 bg-surface-container rounded-lg border border-outline-variant">
                  <p className="text-xs text-secondary">Chỉ số Ca/Size thực tế</p>
                  <p className="text-sm font-semibold text-primary">{preview.totalMetrics} bản ghi</p>
                </div>
                <div className="p-3 bg-surface-container rounded-lg border border-outline-variant">
                  <p className="text-xs text-secondary">Khoảng ngày</p>
                  <p className="text-sm font-semibold text-on-surface">{preview.dates.length ? `${displayDate(preview.dates[0])} → ${displayDate(preview.dates[preview.dates.length - 1])}` : '—'}</p>
                </div>
              </div>

              <section className="space-y-2" aria-label="Các ngày sẽ thay dữ liệu">
                <p className="text-sm font-semibold">Sẽ thay {preview.replacementDays.length.toLocaleString('vi-VN')} ngày{preview.dates.length ? ` (${displayDate(preview.dates[0])} → ${displayDate(preview.dates[preview.dates.length - 1])})` : ''}: hiện có {preview.replacementDays.reduce((sum, row) => sum + row.currentCount, 0).toLocaleString('vi-VN')} dòng, sau khi nhập {preview.totalMetrics.toLocaleString('vi-VN')} dòng.</p>
                <table className="w-full text-sm"><thead><tr><th className="text-left">Ngày</th><th className="text-right">Hiện có</th><th className="text-right">Sau khi nhập</th></tr></thead><tbody>{preview.replacementDays.map(row => <tr key={row.date}><td>{displayDate(row.date)}</td><td className="text-right">{row.currentCount}</td><td className="text-right">{row.incomingCount}</td></tr>)}</tbody></table>
                {losses.length > 0 && <div className="p-3 border border-amber-400 bg-amber-50 rounded-lg space-y-2">
                  <p className="font-semibold text-sm">Các PI sau sẽ bị xoá khỏi dữ liệu Rolling của ngày tương ứng:</p>
                  <ul className="text-sm list-disc pl-5">{losses.map(loss => <li key={`${loss.date}/${loss.piNumber}`}>{displayDate(loss.date)} — {loss.piNumber}</li>)}</ul>
                  <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={acknowledgeLoss} onChange={event => setAcknowledgeLoss(event.target.checked)} className="mt-1"/>Tôi hiểu các đơn này sẽ bị xoá</label>
                </div>}
              </section>

              <div>
                <p className="text-xs font-semibold text-secondary uppercase tracking-wider mb-2">10 dòng mẫu ngẫu nhiên sẽ lưu:</p>
                <div className="border border-outline-variant rounded-lg overflow-x-auto max-h-56">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-surface-container text-secondary font-medium uppercase border-b border-outline-variant">
                      <tr>
                        <th className="p-2">Ngày</th>
                        <th className="p-2">Mã PI</th>
                        <th className="p-2">Màu / Quy cách</th>
                        <th className="p-2">Chỉ số</th>
                        <th className="p-2 text-right">Giá trị</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant">
                      {preview.sampleRows.map((r, idx) => (
                        <tr key={idx} className="hover:bg-surface-container-high/40">
                          <td className="p-2 font-mono">{displayDate(r.date)}</td>
                          <td className="p-2 font-semibold text-primary">{r.orderRef ?? '—'}</td>
                          <td className="p-2 text-secondary">{r.color ?? '—'} ({r.widthM}m x {r.lengthM}m)</td>
                          <td className="p-2 font-mono text-on-surface">{r.metricLabel}</td>
                          <td className="p-2 font-mono font-semibold text-right text-on-surface">{r.metricValue.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: Success */}
          {step === 'success' && (
            <div className="py-8 text-center space-y-3">
              <span aria-hidden="true" className="material-symbols-outlined text-[56px] text-emerald-600">check_circle</span>
              <p className="text-base font-semibold text-on-surface">{successMsg}</p>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="pt-4 border-t border-outline-variant flex justify-end gap-2 shrink-0">
          {step === 'upload' && (
            <>
              <button onClick={onClose} className="px-4 py-2 text-sm text-secondary hover:bg-surface-container rounded-lg">
                Hủy
              </button>
              <button
                onClick={handlePreview}
                disabled={!file || !selectedPeriod || isLoading}
                className="px-4 py-2 text-sm font-semibold bg-primary text-on-primary rounded-lg hover:bg-primary/90 disabled:opacity-50 inline-flex items-center gap-2"
              >
                {isLoading && <span aria-hidden="true" className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>}
                Xem trước dữ liệu
              </button>
            </>
          )}

          {step === 'preview' && (
            <>
              <button onClick={() => { setStep('upload'); setAcknowledgeLoss(false) }} className="px-4 py-2 text-sm text-secondary hover:bg-surface-container rounded-lg">
                Quay lại
              </button>
              <button
                onClick={handleConfirm}
                disabled={isLoading || preview?.totalMetrics === 0 || (losses.length > 0 && !acknowledgeLoss)}
                className="px-4 py-2 text-sm font-semibold bg-primary text-on-primary rounded-lg hover:bg-primary/90 disabled:opacity-50 inline-flex items-center gap-2"
              >
                {isLoading && <span aria-hidden="true" className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>}
                Xác nhận Import vào DB
              </button>
            </>
          )}

          {step === 'success' && (
            <button onClick={onClose} className="px-4 py-2 text-sm font-semibold bg-primary text-on-primary rounded-lg hover:bg-primary/90">
              Đóng
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
