'use client'

// src/components/materials/ImportRollingReportModal.tsx
// 3-step modal: Upload Excel Statistical Report → Preview Dry-Run → Confirm Import to DB.

import { useState } from 'react'

interface Props {
  onImported: () => void
  onClose:    () => void
}

interface PreviewResponse {
  success:           boolean
  fileName:          string
  totalMetrics:      number
  totalOrderRows:    number
  summarySkipped:    number
  uniqueOrdersCount: number
  dateRange:         string
  dates:             string[]
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
  const [step, setStep]             = useState<Step>('upload')
  const [file, setFile]             = useState<File | null>(null)
  const [isLoading, setIsLoading]   = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [preview, setPreview]       = useState<PreviewResponse | null>(null)
  const [successMsg, setSuccessMsg] = useState('')

  // ── Step 1: Upload & Preview ───────────────────────────────────────────────

  const handlePreview = async () => {
    if (!file) { setError('Vui lòng chọn file Excel báo cáo sản lượng (.xlsx)'); return }
    setError(null)
    setIsLoading(true)

    try {
      const formData = new FormData()
      formData.append('file', file)

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
      setStep('preview')
    } catch {
      setError('Lỗi kết nối máy chủ.')
    } finally {
      setIsLoading(false)
    }
  }

  // ── Step 2: Confirm & Save to DB ──────────────────────────────────────────

  const handleConfirm = async () => {
    if (!file) return
    setError(null)
    setIsLoading(true)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/materials/rolling/import/confirm', {
        method: 'POST',
        body: formData,
      })
      const data = (await res.json()) as { success: boolean; recordsInserted?: number; error?: string }

      if (!res.ok || !data.success) {
        setError(data.error ?? 'Lỗi khi lưu dữ liệu Rolling vào cơ sở dữ liệu.')
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
      <div className="bg-surface-container-lowest border-[0.5px] border-outline-variant rounded-2xl p-6 max-w-2xl w-full shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">

        {/* Modal Header */}
        <div className="flex items-center justify-between pb-4 border-b border-outline-variant shrink-0">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[24px]">table_chart</span>
            <h2 className="text-lg font-inter font-semibold text-on-surface">Import Báo Cáo Sản Lượng Rolling</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-surface-container text-secondary hover:text-on-surface transition-colors">
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="py-4 overflow-y-auto flex-1 space-y-4">
          {error && (
            <div className="p-3 bg-error-container/40 border border-error/30 rounded-lg flex items-center gap-2 text-error text-sm">
              <span className="material-symbols-outlined text-[18px]">error</span>
              <span>{error}</span>
            </div>
          )}

          {/* STEP 1: Upload */}
          {step === 'upload' && (
            <div className="space-y-4">
              <p className="text-sm text-secondary">
                Tải lên file báo cáo thống kê Excel (`STATISTICAL REPORT MM-YYYY.xlsx`) chứa sheet <strong>ROLLING</strong>.
              </p>

              <div className="border-2 border-dashed border-outline-variant rounded-xl p-8 text-center hover:border-primary/50 transition-colors">
                <input
                  type="file"
                  accept=".xlsx"
                  id="rolling-file-input"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="hidden"
                />
                <label htmlFor="rolling-file-input" className="cursor-pointer space-y-2 block">
                  <span className="material-symbols-outlined text-[40px] text-primary">upload_file</span>
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
              <div className="grid grid-cols-3 gap-3">
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
                  <p className="text-sm font-semibold text-on-surface">{preview.dateRange}</p>
                </div>
              </div>

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
                          <td className="p-2 font-mono">{r.date}</td>
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
              <span className="material-symbols-outlined text-[56px] text-emerald-600">check_circle</span>
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
                disabled={!file || isLoading}
                className="px-4 py-2 text-sm font-semibold bg-primary text-on-primary rounded-lg hover:bg-primary/90 disabled:opacity-50 inline-flex items-center gap-2"
              >
                {isLoading && <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>}
                Xem trước dữ liệu
              </button>
            </>
          )}

          {step === 'preview' && (
            <>
              <button onClick={() => setStep('upload')} className="px-4 py-2 text-sm text-secondary hover:bg-surface-container rounded-lg">
                Quay lại
              </button>
              <button
                onClick={handleConfirm}
                disabled={isLoading}
                className="px-4 py-2 text-sm font-semibold bg-primary text-on-primary rounded-lg hover:bg-primary/90 disabled:opacity-50 inline-flex items-center gap-2"
              >
                {isLoading && <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>}
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
