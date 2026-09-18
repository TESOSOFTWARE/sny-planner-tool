'use client'

// src/components/materials/ImportKnittingModal.tsx
// 3-step modal: (1) file picker → (2) preview (dates + machine count) → (3) confirm → success/error.
// Follows the same pattern as ImportMaterialReportModal.

import { useState } from 'react'

interface Props {
  onImported: () => void
  onClose: () => void
}

interface PreviewData {
  totalRecords: number
  dates: string[]        // ["2026-04-28", "2026-04-29"]
  machineCount: number
}

interface ImportResult {
  imported: number
  updated: number
  dates: string[]
}

type Step = 'pick' | 'preview' | 'success' | 'error'

/** Format ISO date "2026-04-28" → "28/4/2026" for Vietnamese display */
function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${parseInt(d)}/${parseInt(m)}/${y}`
}

export default function ImportKnittingModal({ onImported, onClose }: Props) {
  const [step, setStep]       = useState<Step>('pick')
  const [file, setFile]       = useState<File | null>(null)
  const [preview, setPreview] = useState<PreviewData | null>(null)
  const [result, setResult]   = useState<ImportResult | null>(null)
  const [error, setError]     = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const reset = () => {
    setStep('pick'); setFile(null); setPreview(null)
    setResult(null); setError(null); setIsLoading(false)
  }

  // ── Step 1 → 2: upload + preview ─────────────────────────────────────────

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    setIsLoading(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('file', f)
      const res = await fetch('/api/knitting/import', { method: 'POST', body: fd })
      const json = await res.json() as { success: boolean; error?: string } & Partial<PreviewData>
      if (!res.ok || !json.success) throw new Error(json.error ?? 'Preview thất bại')
      setPreview({ totalRecords: json.totalRecords!, dates: json.dates!, machineCount: json.machineCount! })
      setStep('preview')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Lỗi không xác định')
      setStep('error')
    } finally {
      setIsLoading(false)
    }
  }

  // ── Step 2 → 3: confirm import ────────────────────────────────────────────

  const handleConfirm = async () => {
    if (!file) return
    setIsLoading(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/knitting/import/confirm', { method: 'POST', body: fd })
      const json = await res.json() as { success: boolean; error?: string } & Partial<ImportResult>
      if (!res.ok || !json.success) throw new Error(json.error ?? 'Import thất bại')
      setResult({ imported: json.imported!, updated: json.updated!, dates: json.dates! })
      setStep('success')
      onImported()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Lỗi không xác định')
      setStep('error')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-surface-container-lowest rounded-2xl shadow-xl w-full max-w-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant">
          <div>
            <h2 className="text-base font-inter font-semibold text-on-surface">
              Import Knitting Report
            </h2>
            <p className="text-xs font-inter text-secondary mt-0.5">
              Upload SNY Statistical Report — sheet KNITTING (.xlsx)
            </p>
          </div>
          <button onClick={onClose} className="text-outline hover:text-on-surface transition-colors">
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Body */}
        <div className="p-6">

          {/* ── STEP: pick ── */}
          {step === 'pick' && (
            <div className="flex flex-col items-center gap-5 py-6">
              {isLoading ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-9 h-9 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  <p className="text-sm font-inter text-secondary">Đang đọc file…</p>
                </div>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[48px] text-outline">description</span>
                  <div className="text-center">
                    <p className="text-sm font-inter text-on-surface">Chọn file Statistical Report</p>
                    <p className="text-xs font-inter text-secondary mt-1">Sheet KNITTING • chỉ nhận .xlsx</p>
                  </div>
                  <label className="inline-flex items-center gap-2 bg-primary text-on-primary text-sm font-medium px-4 py-2 h-9 rounded-md hover:bg-primary/90 transition-colors cursor-pointer">
                    <span className="material-symbols-outlined text-[18px]">upload</span>
                    Chọn file
                    <input
                      id="knitting-import-file"
                      type="file"
                      accept=".xlsx"
                      className="hidden"
                      onChange={handleFileChange}
                    />
                  </label>
                </>
              )}
            </div>
          )}

          {/* ── STEP: preview ── */}
          {step === 'preview' && preview && (
            <div className="space-y-4">
              <p className="text-sm font-inter text-secondary">
                Tìm thấy dữ liệu cho{' '}
                <strong className="text-on-surface">{preview.dates.length} ngày</strong>,{' '}
                <strong className="text-on-surface">{preview.machineCount} máy</strong>{' '}
                ({preview.totalRecords} bản ghi).
              </p>

              {/* Date list */}
              <div className="border border-outline-variant rounded-xl overflow-hidden">
                <div className="px-4 py-2 bg-surface-container-low border-b border-outline-variant">
                  <p className="text-xs font-inter font-medium text-secondary uppercase tracking-widest">
                    Ngày trong file
                  </p>
                </div>
                <div className="px-4 py-3 flex flex-wrap gap-2">
                  {preview.dates.map((d) => (
                    <span
                      key={d}
                      className="inline-flex items-center px-3 py-1 rounded-full bg-surface-container text-xs font-mono font-medium text-on-surface border border-outline-variant"
                    >
                      {fmtDate(d)}
                    </span>
                  ))}
                </div>
              </div>

              <p className="text-xs font-inter text-outline">
                Máy có output = 0 sẽ được ghi dailyMeters = 0. Delta so với ngày hôm trước sẽ được tính tự động.
              </p>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  onClick={reset}
                  className="border border-outline text-secondary text-sm font-medium px-4 py-2 h-9 rounded-md hover:bg-surface-container transition-colors"
                >
                  Quay lại
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={isLoading}
                  className="inline-flex items-center gap-2 bg-primary text-on-primary text-sm font-medium px-4 py-2 h-9 rounded-md hover:bg-primary/90 disabled:opacity-60 transition-colors"
                >
                  {isLoading ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
                      </svg>
                      Đang import…
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-[16px]">save</span>
                      Xác nhận import
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* ── STEP: success ── */}
          {step === 'success' && result && (
            <div className="flex flex-col items-center gap-5 py-6">
              <span className="material-symbols-outlined text-[48px] text-[#15803d]">check_circle</span>
              <div className="text-center space-y-1">
                <p className="text-base font-inter font-semibold text-on-surface">Import thành công</p>
                <p className="text-sm font-inter text-secondary">
                  Tạo mới: <strong>{result.imported}</strong> · Cập nhật: <strong>{result.updated}</strong>
                </p>
                <p className="text-xs font-inter text-outline mt-1">
                  Ngày: {result.dates.map(fmtDate).join(', ')}
                </p>
              </div>
              <button
                onClick={onClose}
                className="bg-primary text-on-primary text-sm font-medium px-4 py-2 h-9 rounded-md hover:bg-primary/90 transition-colors"
              >
                Đóng
              </button>
            </div>
          )}

          {/* ── STEP: error ── */}
          {step === 'error' && (
            <div className="flex flex-col items-center gap-5 py-6">
              <span className="material-symbols-outlined text-[48px] text-error">error</span>
              <div className="text-center space-y-1">
                <p className="text-base font-inter font-semibold text-error">Import thất bại</p>
                <p className="text-xs font-inter text-secondary font-mono break-all">{error}</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={reset}
                  className="border border-outline text-secondary text-sm font-medium px-4 py-2 h-9 rounded-md hover:bg-surface-container transition-colors"
                >
                  Thử lại
                </button>
                <button
                  onClick={onClose}
                  className="bg-primary text-on-primary text-sm font-medium px-4 py-2 h-9 rounded-md hover:bg-primary/90 transition-colors"
                >
                  Đóng
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
