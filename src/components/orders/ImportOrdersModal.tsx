'use client'

// src/components/orders/ImportOrdersModal.tsx
// Client component — "Import Excel" trigger button + modal overlay.
// Displays strict row-level validation status matching MultiLineOrderForm.
// Invalid rows are visually highlighted in red and skipped on confirm.

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import type { ParsedOrder } from '@/types'

// ── Types ─────────────────────────────────────────────────────────────────────

type ModalState =
  | 'closed'
  | 'uploading'
  | 'preview'
  | 'confirming'
  | 'success'
  | 'error'

interface PreviewData {
  rows: ParsedOrder[]
  totalParsed: number
  piWarnings?: string[]
}

interface ConfirmResult {
  imported: number
  skipped: number
  invalidSkipped: number
  totalRows: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ImportOrdersModal() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [state, setState] = useState<ModalState>('closed')
  const [preview, setPreview] = useState<PreviewData | null>(null)
  const [result, setResult] = useState<ConfirmResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  // ── Handlers ────────────────────────────────────────────────────────────────

  const openModal = () => {
    setPreview(null)
    setResult(null)
    setError(null)
    setSelectedFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
    setState('uploading')
  }

  const closeModal = () => {
    setState('closed')
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null
    setSelectedFile(f)
    setError(null)
  }

  // Step 1: upload file → get preview
  const handleUpload = async () => {
    if (!selectedFile) {
      setError('Vui lòng chọn file Excel trước.')
      return
    }
    if (!selectedFile.name.toLowerCase().endsWith('.xlsx')) {
      setError('Chỉ chấp nhận file định dạng .xlsx')
      return
    }
    if (selectedFile.size > 10 * 1024 * 1024) {
      setError('Dung lượng file phải nhỏ hơn hoặc bằng 10 MB.')
      return
    }

    setState('uploading')
    setError(null)

    const formData = new FormData()
    formData.append('file', selectedFile)

    try {
      const res = await fetch('/api/orders/import', {
        method: 'POST',
        body: formData,
      })
      const json = await res.json()

      if (!res.ok || !json.success) {
        setError(json.error ?? 'Không thể đọc file Excel.')
        return
      }

      setPreview({ rows: json.preview, totalParsed: json.totalParsed, piWarnings: json.piWarnings })
      setState('preview')
    } catch {
      setError('Lỗi kết nối mạng — không thể gửi file lên máy chủ.')
    }
  }

  // Step 2: confirm → save ONLY valid rows to DB
  const handleConfirm = async () => {
    if (!preview) return

    const validRows = preview.rows.filter((r) => r.isValid !== false)
    const invalidCount = preview.rows.length - validRows.length

    if (validRows.length === 0) {
      setError('Không có dòng hợp lệ nào để import. Vui lòng kiểm tra lại các dòng bị lỗi trong file Excel.')
      return
    }

    setState('confirming')
    setError(null)

    try {
      const res = await fetch('/api/orders/import/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: validRows }),
      })
      const json = await res.json()

      if (!res.ok || !json.success) {
        setError(json.error ?? 'Đã xảy ra lỗi khi lưu vào cơ sở dữ liệu.')
        setState('error')
        return
      }

      setResult({
        imported: json.imported,
        skipped: json.skipped,
        invalidSkipped: invalidCount,
        totalRows: preview.rows.length,
      })
      setState('success')
      router.refresh()
    } catch {
      setError('Lỗi kết nối mạng — không thể gửi dữ liệu xác nhận.')
      setState('error')
    }
  }

  const handleRetry = () => {
    setError(null)
    setPreview(null)
    setSelectedFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
    setState('uploading')
  }

  const validRowsCount = preview ? preview.rows.filter((r) => r.isValid !== false).length : 0
  const invalidRowsCount = preview ? preview.rows.length - validRowsCount : 0

  return (
    <>
      {/* Trigger button */}
      <button
        id="btn-import-excel"
        onClick={openModal}
        className="inline-flex items-center justify-center gap-sm border border-primary bg-transparent hover:bg-surface-container text-primary text-sm font-medium px-4 py-2 h-9 rounded-md transition-colors"
      >
        <span className="material-symbols-outlined text-[18px]">upload_file</span>
        Import Excel
      </button>

      {/* Modal overlay */}
      {state !== 'closed' && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Import Excel orders"
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => {
              if (state !== 'confirming') closeModal()
            }}
          />

          {/* Card */}
          <div className="relative bg-surface-container-lowest border-[0.5px] border-outline-variant rounded-xl shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col">

            {/* Header */}
            <div className="flex items-center justify-between px-lg py-md border-b-[0.5px] border-outline-variant shrink-0">
              <div className="flex items-center gap-sm">
                <span className="material-symbols-outlined text-[20px] text-primary">upload_file</span>
                <h2 className="text-label-md font-inter font-semibold text-on-surface">Import Excel Orders</h2>
              </div>
              {state !== 'confirming' && (
                <button
                  onClick={closeModal}
                  className="text-outline hover:text-on-surface transition-colors p-1 rounded"
                  aria-label="Close modal"
                >
                  <span className="material-symbols-outlined text-[20px]">close</span>
                </button>
              )}
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5">

              {/* ── UPLOADING STATE ─────────────────────────────────────── */}
              {state === 'uploading' && (
                <div className="space-y-6">
                  <div className="border-2 border-dashed border-outline-variant rounded-xl p-8 text-center">
                    <span className="material-symbols-outlined text-[48px] text-outline-variant mb-sm">description</span>
                    <p className="text-body-md font-noto text-on-surface font-medium mb-xs">Chọn file danh sách đơn hàng (.xlsx)</p>
                    <p className="text-label-sm font-inter text-secondary mb-md">Định dạng .xlsx · Dung lượng tối đa 10 MB</p>
                    <input
                      id="file-import-input"
                      ref={fileInputRef}
                      type="file"
                      accept=".xlsx"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                    <label
                      htmlFor="file-import-input"
                      className="inline-flex items-center gap-sm border-[0.5px] border-outline-variant bg-surface-container hover:bg-surface-container-high text-on-surface-variant text-label-md font-inter font-medium px-md py-sm rounded-lg cursor-pointer transition-colors"
                    >
                      <span className="material-symbols-outlined text-[18px]">attach_file</span>
                      Duyệt tìm file
                    </label>
                    {selectedFile && (
                      <p className="mt-sm text-label-sm font-inter text-[#15803d] flex items-center justify-center gap-xs">
                        <span className="material-symbols-outlined text-[16px]">check_circle</span>
                        {selectedFile.name}
                        <span className="text-secondary">({(selectedFile.size / 1024).toFixed(0)} KB)</span>
                      </p>
                    )}
                  </div>

                  {error && (
                    <div role="alert" className="flex items-start gap-sm border border-error/40 bg-error-container rounded-lg px-md py-sm">
                      <span className="material-symbols-outlined text-[18px] text-error shrink-0">error</span>
                      <p className="text-label-sm font-inter text-error">{error}</p>
                    </div>
                  )}

                  <div className="flex justify-end gap-sm">
                    <button onClick={closeModal} className="inline-flex items-center justify-center gap-sm border border-primary bg-transparent hover:bg-surface-container text-primary text-sm font-medium px-4 py-2 h-9 rounded-md transition-colors">
                      Hủy
                    </button>
                    <button
                      id="btn-parse-file"
                      onClick={handleUpload}
                      disabled={!selectedFile}
                      className="inline-flex items-center justify-center gap-sm bg-primary text-on-primary text-sm font-medium px-4 py-2 h-9 rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Đọc thử File Excel →
                    </button>
                  </div>
                </div>
              )}

              {/* ── PREVIEW STATE ────────────────────────────────────────── */}
              {state === 'preview' && preview && (
                <div className="space-y-4">
                  {preview.piWarnings && preview.piWarnings.length > 0 && (
                    <div className="p-3 bg-[#FFF8E7] border border-[#F59E0B] rounded-lg text-xs text-[#92400E] font-medium space-y-1">
                      {preview.piWarnings.map((w, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <span className="material-symbols-outlined text-[16px] shrink-0 mt-0.5 text-[#D97706]">warning</span>
                          <span>{w}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Summary Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-slate-800">
                        Tổng số dòng: {preview.rows.length}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-medium">
                        ✓ {validRowsCount} dòng hợp lệ
                      </span>
                      {invalidRowsCount > 0 && (
                        <span className="px-2 py-0.5 rounded bg-rose-100 text-rose-800 font-medium">
                          ⚠ {invalidRowsCount} dòng bị thiếu trường bắt buộc (bỏ qua)
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Data Table */}
                  <div className="overflow-x-auto rounded-lg border-[0.5px] border-outline-variant max-h-96">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-surface-container border-b-[0.5px] border-outline-variant">
                        <tr>
                          {['#', 'Trạng thái Validation', 'PI Number', 'Sub-line', 'Customer', 'Date', 'Width (m)', 'Length (m)', 'GSM', 'Color', 'FR', 'UV%'].map((h) => (
                            <th key={h} className="px-sm py-xs text-left text-label-sm font-inter font-medium text-secondary uppercase tracking-wide whitespace-nowrap">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[0.5px] divide-outline-variant">
                        {preview.rows.map((row, idx) => {
                          const isValidRow = row.isValid !== false
                          return (
                            <tr
                              key={idx}
                              className={
                                !isValidRow
                                  ? 'bg-rose-50/60 hover:bg-rose-100/50'
                                  : idx % 2 === 0
                                  ? 'bg-surface-container-lowest'
                                  : 'bg-surface-container-low/40'
                              }
                            >
                              <td className="px-sm py-xs text-outline tabular-nums">{idx + 1}</td>

                              {/* Validation Status Column */}
                              <td className="px-sm py-xs whitespace-nowrap">
                                {isValidRow ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-medium border border-emerald-200 text-[11px]">
                                    ✓ Hợp lệ
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-100 text-rose-800 font-semibold border border-rose-300 text-[11px]">
                                    ⚠ {row.validationErrors?.join(', ')}
                                  </span>
                                )}
                              </td>

                              <td className="px-sm py-xs font-mono text-type-mono text-on-surface whitespace-nowrap">{row.piNumber}</td>
                              <td className="px-sm py-xs text-secondary text-center">{row.subLineIndex}</td>
                              <td className="px-sm py-xs text-body-md font-noto text-on-surface whitespace-nowrap max-w-[140px] truncate">{row.customer || <span className="text-rose-500 italic">Trống</span>}</td>
                              <td className="px-sm py-xs font-mono text-type-mono text-on-surface-variant whitespace-nowrap tabular-nums">{formatDate(row.orderDate)}</td>
                              <td className="px-sm py-xs text-right font-mono text-type-mono text-on-surface tabular-nums">{row.widthM || <span className="text-rose-500 italic">0</span>}</td>
                              <td className="px-sm py-xs text-right font-mono text-type-mono text-on-surface tabular-nums">{row.lengthM ? row.lengthM.toLocaleString() : <span className="text-rose-500 italic">0</span>}</td>
                              <td className="px-sm py-xs text-right font-mono text-type-mono text-on-surface tabular-nums">{row.gsm || <span className="text-rose-500 italic">0</span>}</td>
                              <td className="px-sm py-xs text-body-md font-noto text-on-surface whitespace-nowrap">{row.color || <span className="text-rose-600 font-bold italic">Thiếu Màu</span>}</td>
                              <td className="px-sm py-xs text-center">
                                {row.frFlag
                                  ? <span className="text-[#92400E] font-inter font-semibold text-label-sm">FR</span>
                                  : <span className="text-outline">—</span>}
                              </td>
                              <td className="px-sm py-xs font-mono text-type-mono text-on-surface-variant tabular-nums">
                                {row.uvPct != null ? `${(row.uvPct * 100).toFixed(1)}%` : '—'}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  {error && (
                    <div role="alert" className="flex items-start gap-sm border border-error/40 bg-error-container rounded-lg px-md py-sm">
                      <span className="material-symbols-outlined text-[18px] text-error shrink-0 font-normal">error</span>
                      <p className="text-label-sm font-inter text-error">{error}</p>
                    </div>
                  )}
                </div>
              )}

              {/* ── CONFIRMING STATE ─────────────────────────────────────── */}
              {state === 'confirming' && (
                <div className="flex flex-col items-center justify-center py-16 gap-md">
                  <svg className="w-10 h-10 animate-spin text-primary" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                  <p className="text-body-md font-noto text-on-surface font-medium">Đang lưu các dòng đơn hàng hợp lệ vào CSDL…</p>
                  <p className="text-label-sm font-inter text-secondary">Vui lòng chờ trong giây lát, không đóng cửa sổ này.</p>
                </div>
              )}

              {/* ── SUCCESS STATE ────────────────────────────────────────── */}
              {state === 'success' && result && (
                <div className="flex flex-col items-center justify-center py-16 gap-lg">
                  <div className="w-16 h-16 rounded-full bg-[#f0fdf4] border border-[#22c55e]/30 flex items-center justify-center">
                    <span className="material-symbols-outlined text-[32px] text-[#15803d]">check_circle</span>
                  </div>
                  <div className="text-center space-y-2">
                    <p className="text-headline-md font-inter font-semibold text-on-surface">Import Hoàn Tất!</p>
                    <p className="text-body-md font-noto text-secondary">
                      Đã import thành công <span className="text-[#15803d] font-bold">{result.imported}/{result.totalRows}</span> dòng đơn hàng hợp lệ.
                    </p>
                    {result.invalidSkipped > 0 && (
                      <p className="text-xs text-rose-600 font-medium">
                        ⚠ {result.invalidSkipped} dòng bị bỏ qua do thiếu trường bắt buộc (Màu, GSM, Kích thước...)
                      </p>
                    )}
                    {result.skipped > 0 && (
                      <p className="text-xs text-slate-500">
                        · {result.skipped} dòng trùng lặp (PI + Sub-line) đã được giữ nguyên.
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* ── ERROR STATE ──────────────────────────────────────────── */}
              {state === 'error' && (
                <div className="flex flex-col items-center justify-center py-16 gap-lg">
                  <div className="w-16 h-16 rounded-full bg-error-container border border-error/30 flex items-center justify-center">
                    <span className="material-symbols-outlined text-[32px] text-error">error</span>
                  </div>
                  <div className="text-center">
                    <p className="text-on-surface font-semibold font-inter text-headline-md">Import Thất Bại</p>
                    <p className="text-error text-label-md font-inter mt-xs">{error}</p>
                  </div>
                </div>
              )}

            </div>

            {/* Footer buttons */}
            {(state === 'preview' || state === 'success' || state === 'error') && (
              <div className="flex items-center justify-end gap-sm px-lg py-md border-t-[0.5px] border-outline-variant shrink-0">
                {state === 'preview' && (
                  <>
                    <button
                      onClick={handleRetry}
                      className="inline-flex items-center justify-center gap-sm border border-primary bg-transparent hover:bg-surface-container text-primary text-sm font-medium px-4 py-2 h-9 rounded-md transition-colors"
                    >
                      ← Chọn file khác
                    </button>
                    <button
                      id="btn-confirm-import"
                      onClick={handleConfirm}
                      disabled={validRowsCount === 0}
                      className="inline-flex items-center justify-center gap-sm bg-primary text-on-primary text-sm font-medium px-4 py-2 h-9 rounded-md hover:bg-primary/90 disabled:opacity-50 transition-colors"
                    >
                      <span className="material-symbols-outlined text-[18px]">check</span>
                      Xác Nhận Import ({validRowsCount} dòng hợp lệ)
                    </button>
                  </>
                )}
                {state === 'success' && (
                  <button
                    id="btn-import-done"
                    onClick={closeModal}
                    className="inline-flex items-center justify-center gap-sm bg-primary text-on-primary text-sm font-medium px-4 py-2 h-9 rounded-md hover:bg-primary/90 transition-colors"
                  >
                    Hoàn Thành
                  </button>
                )}
                {state === 'error' && (
                  <>
                    <button onClick={closeModal} className="inline-flex items-center justify-center gap-sm border border-primary bg-transparent hover:bg-surface-container text-primary text-sm font-medium px-4 py-2 h-9 rounded-md transition-colors">
                      Đóng
                    </button>
                    <button
                      onClick={handleRetry}
                      className="inline-flex items-center justify-center gap-sm bg-primary text-on-primary text-sm font-medium px-4 py-2 h-9 rounded-md hover:bg-primary/90 transition-colors"
                    >
                      Thử lại
                    </button>
                  </>
                )}
              </div>
            )}

          </div>
        </div>
      )}
    </>
  )
}
