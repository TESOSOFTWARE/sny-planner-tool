'use client'

// src/components/materials/ImportKnittingDetailModal.tsx
// 3-step modal for importing Knitting Detail report (.xlsx)

import { useState } from 'react'

interface Props {
  onImported: () => void
  onClose:    () => void
}

interface PreviewRow {
  machineId:      string
  reportDate:     string
  shift:          string
  width:          number | null
  color:          string
  weightSpec:     number | null
  lengthM:        number | null
  tapeRoll:       number | null
  mValue:         number | null
  avgPerRoll:     number | null
  quantity:       number | null
  weightKgs:      number
  orderRef:       string | null
  machineNote:    string | null
  machineSizeM:   number | null
  cmPerMin:       number | null
  meterPerDay:    number | null
  operatingGrade: string | null
  totalPct:       number | null
}

interface PreviewResponse {
  success:        boolean
  totalRecords:   number
  dates:          string[]
  machines:       string[]
  totalWeightKgs: number
  totalMeters:    number
  rows:           PreviewRow[]
  error?:         string
}

interface ConfirmResponse {
  success:          boolean
  recordsInserted:  number
  recordsDeleted:   number
  error?:           string
}

type Step = 'upload' | 'preview' | 'success'

export default function ImportKnittingDetailModal({ onImported, onClose }: Props) {
  const [step, setStep]         = useState<Step>('upload')
  const [file, setFile]         = useState<File | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [preview, setPreview]   = useState<PreviewResponse | null>(null)
  const [successMsg, setSuccessMsg] = useState('')

  const handlePreview = async () => {
    if (!file) { setError('Vui lòng chọn file .xlsx'); return }
    setError(null)
    setIsLoading(true)

    try {
      const fd = new FormData()
      fd.append('file', file)
      const res  = await fetch('/api/knitting/detail/import', { method: 'POST', body: fd })
      const data = await res.json() as PreviewResponse
      if (!res.ok || !data.success) { setError(data.error ?? 'Không thể đọc file.'); return }
      setPreview(data)
      setStep('preview')
    } catch {
      setError('Lỗi mạng — không thể kết nối máy chủ.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleConfirm = async () => {
    if (!preview) return
    setError(null)
    setIsLoading(true)

    try {
      const res  = await fetch('/api/knitting/detail/import/confirm', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ rows: preview.rows }),
      })
      const data = await res.json() as ConfirmResponse
      if (!res.ok || !data.success) { setError(data.error ?? 'Không thể lưu dữ liệu.'); return }
      setSuccessMsg(`Đã import ${data.recordsInserted} bản ghi chi tiết cho ${preview.machines.length} máy dệt.`)
      setStep('success')
      onImported()
    } catch {
      setError('Lỗi mạng — không thể kết nối máy chủ.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface rounded-xl shadow-lg w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b-[0.5px] border-outline-variant flex justify-between items-center shrink-0">
          <div>
            <h3 className="text-base font-inter font-semibold text-on-surface">Import báo cáo Knitting Detail</h3>
            <p className="text-xs text-secondary mt-0.5">
              {step === 'upload'  && 'Bước 1: Chọn file Excel (.xlsx)'}
              {step === 'preview' && 'Bước 2: Xem trước và xác nhận'}
              {step === 'success' && 'Import thành công'}
            </p>
          </div>
          <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface transition-colors">
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-error-container border border-error/30 text-error text-sm">
              <span className="material-symbols-outlined text-[18px] shrink-0 mt-0.5">error</span>
              {error}
            </div>
          )}

          {/* STEP 1: UPLOAD */}
          {step === 'upload' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-secondary mb-1">
                  File Excel (.xlsx) <span className="text-error">*</span>
                </label>
                <input
                  id="import-knitting-detail-file"
                  type="file"
                  accept=".xlsx"
                  onChange={e => { setFile(e.target.files?.[0] ?? null); setError(null) }}
                  className="w-full text-sm text-on-surface file:mr-3 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary file:text-on-primary hover:file:bg-primary/90 cursor-pointer"
                />
                {file && (
                  <p className="text-xs text-secondary mt-1">
                    <span className="material-symbols-outlined text-[14px] align-middle mr-1">description</span>
                    {file.name} ({(file.size / 1024).toFixed(0)} KB)
                  </p>
                )}
              </div>

              <div className="bg-surface-container rounded-lg p-4 text-xs text-secondary space-y-1">
                <p className="font-medium text-on-surface mb-2">Yêu cầu file:</p>
                <p>• File .xlsx từ SNY có sheet tên <strong>KNITTING</strong></p>
                <p>• Tự động quét 40 máy dệt (M-001 đến M-040)</p>
                <p>• Tự động trích xuất kích thước & năng suất máy (cm/phút, m/ngày)</p>
                <p>• Lọc bỏ các dòng template rỗng để tối ưu lưu trữ</p>
              </div>
            </div>
          )}

          {/* STEP 2: PREVIEW */}
          {step === 'preview' && preview && (
            <div className="space-y-4">
              <div className="grid grid-cols-4 gap-3">
                <div className="bg-surface-container rounded-lg p-3 text-center">
                  <p className="text-2xl font-semibold text-primary tabular-nums">{preview.totalRecords}</p>
                  <p className="text-xs text-secondary mt-1">Dòng dữ liệu</p>
                </div>
                <div className="bg-surface-container rounded-lg p-3 text-center">
                  <p className="text-2xl font-semibold text-on-surface tabular-nums">{preview.machines.length}</p>
                  <p className="text-xs text-secondary mt-1">Máy dệt</p>
                </div>
                <div className="bg-surface-container rounded-lg p-3 text-center">
                  <p className="text-2xl font-semibold text-[#15803d] tabular-nums">
                    {preview.totalWeightKgs.toLocaleString('vi-VN', { maximumFractionDigits: 0 })}
                  </p>
                  <p className="text-xs text-secondary mt-1">Tổng kg</p>
                </div>
                <div className="bg-surface-container rounded-lg p-3 text-center">
                  <p className="text-2xl font-semibold text-[#0284c7] tabular-nums">
                    {preview.totalMeters.toLocaleString('vi-VN', { maximumFractionDigits: 0 })}
                  </p>
                  <p className="text-xs text-secondary mt-1">Tổng mét</p>
                </div>
              </div>

              <div>
                <p className="text-xs font-medium text-secondary mb-2">Ngày báo cáo ({preview.dates.length} ngày)</p>
                <div className="flex flex-wrap gap-2">
                  {preview.dates.map(d => (
                    <span key={d} className="px-2.5 py-1 bg-primary/10 text-primary rounded-full text-xs font-mono font-medium">
                      {d}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-medium text-secondary mb-2">Máy dệt ({preview.machines.length} máy)</p>
                <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-1 bg-surface-container rounded-lg border border-outline-variant">
                  {preview.machines.map(m => (
                    <span key={m} className="px-2 py-0.5 bg-surface-container-lowest border border-outline-variant rounded text-[11px] font-mono font-medium text-on-surface">
                      {m}
                    </span>
                  ))}
                </div>
              </div>

              <div className="bg-[#FFF8E7] border border-[#F59E0B] rounded-lg p-3 text-xs text-[#92400E]">
                <span className="material-symbols-outlined text-[14px] align-middle mr-1">info</span>
                Records cũ cùng máy + cùng ngày trong <code>knitting_daily_detail</code> sẽ được <strong>xóa và thay thế</strong>.
                Không ảnh hưởng đến tiến độ <code>KnittingDailyOutput</code> live.
              </div>
            </div>
          )}

          {/* STEP 3: SUCCESS */}
          {step === 'success' && (
            <div className="flex flex-col items-center justify-center py-8 gap-4">
              <span className="material-symbols-outlined text-[48px] text-[#15803d]">check_circle</span>
              <p className="text-base font-semibold text-on-surface text-center">{successMsg}</p>
              <p className="text-sm text-secondary text-center">Dữ liệu Knitting Detail đã được lưu thành công.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t-[0.5px] border-outline-variant flex justify-end gap-2 shrink-0">
          {step === 'success' ? (
            <button
              onClick={onClose}
              className="px-5 py-2 bg-primary text-on-primary rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Đóng
            </button>
          ) : (
            <>
              <button
                onClick={onClose}
                disabled={isLoading}
                className="px-4 py-2 border border-outline-variant text-secondary rounded-md text-sm hover:bg-surface-container transition-colors disabled:opacity-50"
              >
                Hủy
              </button>
              {step === 'upload' && (
                <button
                  onClick={handlePreview}
                  disabled={!file || isLoading}
                  className="px-5 py-2 bg-primary text-on-primary rounded-md text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isLoading && (
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                    </svg>
                  )}
                  {isLoading ? 'Đang đọc file…' : 'Xem trước'}
                </button>
              )}
              {step === 'preview' && (
                <>
                  <button
                    onClick={() => setStep('upload')}
                    disabled={isLoading}
                    className="px-4 py-2 border border-outline text-on-surface-variant rounded-md text-sm hover:bg-surface-container transition-colors disabled:opacity-50"
                  >
                    Quay lại
                  </button>
                  <button
                    onClick={handleConfirm}
                    disabled={isLoading}
                    className="px-5 py-2 bg-primary text-on-primary rounded-md text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    {isLoading && (
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                      </svg>
                    )}
                    {isLoading ? 'Đang lưu…' : 'Xác nhận import'}
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
