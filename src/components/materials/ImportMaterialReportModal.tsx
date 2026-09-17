'use client'

// src/components/materials/ImportMaterialReportModal.tsx
// 3-step modal: (1) file upload + date, (2) preview, (3) confirm → success.

import { useState } from 'react'
import type { ParsedMaterialRow } from '@/lib/excel/parseMaterialReport'

interface Props {
  onImported: () => void
  onClose: () => void
}

interface PreviewRow extends ParsedMaterialRow {
  matchedMaterialId: string | null
  matchedMaterialName: string | null
  isNew: boolean
}

interface PreviewResponse {
  success: boolean
  rows: PreviewRow[]
  parsed: number
  matched: number
  unmatched: number
  error?: string
}

type Step = 'upload' | 'preview' | 'success'

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

const inputCls = 'w-full h-10 px-3 rounded-lg border-[0.5px] border-outline bg-surface text-on-surface text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors'

export default function ImportMaterialReportModal({ onImported, onClose }: Props) {
  const [step, setStep]           = useState<Step>('upload')
  const [file, setFile]           = useState<File | null>(null)
  const [txDate, setTxDate]       = useState(todayISO())
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [preview, setPreview]     = useState<PreviewResponse | null>(null)
  const [successMsg, setSuccessMsg] = useState('')

  // ── Step 1: upload + parse preview ───────────────────────────────────────

  const handlePreview = async () => {
    if (!file) { setError('Vui lòng chọn file .xlsx'); return }
    if (!txDate) { setError('Vui lòng chọn ngày báo cáo'); return }
    setError(null)
    setIsLoading(true)

    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/materials/import-transactions', { method: 'POST', body: fd })
      const data = await res.json() as PreviewResponse
      if (!res.ok || !data.success) {
        setError(data.error ?? 'Không thể đọc file.')
        return
      }
      setPreview(data)
      setStep('preview')
    } catch {
      setError('Lỗi mạng — không thể kết nối máy chủ.')
    } finally {
      setIsLoading(false)
    }
  }

  // ── Step 2: confirm import ─────────────────────────────────────────────────

  const handleConfirm = async () => {
    if (!preview) return
    setError(null)
    setIsLoading(true)

    try {
      const res = await fetch('/api/materials/import-transactions/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: preview.rows, txDate }),
      })
      const data = await res.json() as { success: boolean; materialsUpdated?: number; transactionsCreated?: number; error?: string }
      if (!res.ok || !data.success) {
        setError(data.error ?? 'Không thể lưu dữ liệu.')
        return
      }
      setSuccessMsg(`Đã import ${data.transactionsCreated} giao dịch cho ${data.materialsUpdated} nguyên liệu.`)
      setStep('success')
      onImported()
    } catch {
      setError('Lỗi mạng — không thể kết nối máy chủ.')
    } finally {
      setIsLoading(false)
    }
  }

  const totalOut = (row: PreviewRow) =>
    row.outUsing + row.outBroken + row.outTape + row.outReject

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="bg-surface rounded-xl shadow-lg w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b-[0.5px] border-outline-variant flex justify-between items-center shrink-0">
          <div>
            <h3 className="text-base font-inter font-semibold text-on-surface">Import báo cáo NVL</h3>
            <p className="text-xs text-secondary mt-0.5">
              {step === 'upload'  && 'Bước 1: Chọn file và ngày báo cáo'}
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

          {/* ── STEP 1: UPLOAD ── */}
          {step === 'upload' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-secondary mb-1">
                  File Excel (.xlsx) <span className="text-error">*</span>
                </label>
                <input
                  id="import-report-file"
                  type="file"
                  accept=".xlsx"
                  onChange={e => { setFile(e.target.files?.[0] ?? null); setError(null) }}
                  className="w-full text-sm text-on-surface file:mr-3 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary file:text-on-primary hover:file:bg-primary/90 cursor-pointer"
                />
                {file && (
                  <p className="text-xs text-secondary mt-1">
                    <span className="material-symbols-outlined text-[14px] align-middle mr-1">description</span>
                    {file.name} ({(file.size / 1024).toFixed(1)} KB)
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-secondary mb-1">
                  Ngày báo cáo <span className="text-error">*</span>
                </label>
                <input
                  id="import-report-date"
                  type="date"
                  value={txDate}
                  onChange={e => setTxDate(e.target.value)}
                  className={`${inputCls} max-w-[200px]`}
                />
                <p className="text-xs text-outline mt-1">Ngày này đại diện cho các giao dịch trong file.</p>
              </div>
            </div>
          )}

          {/* ── STEP 2: PREVIEW TABLE ── */}
          {step === 'preview' && preview && (
            <div className="space-y-4">
              {/* Summary pills */}
              <div className="flex gap-3 flex-wrap">
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-surface-container-low border border-outline-variant text-xs font-medium text-on-surface">
                  <span className="material-symbols-outlined text-[14px]">table_rows</span>
                  {preview.parsed} dòng
                </span>
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-[#f0fdf4] border border-[#22c55e]/30 text-xs font-medium text-[#15803d]">
                  <span className="material-symbols-outlined text-[14px]">check_circle</span>
                  {preview.matched} đã có trong hệ thống
                </span>
                {preview.unmatched > 0 && (
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-[#fef3c7] border border-[#f59e0b]/30 text-xs font-medium text-[#92400e]">
                    <span className="material-symbols-outlined text-[14px]">add_circle</span>
                    {preview.unmatched} sẽ được tạo mới
                  </span>
                )}
              </div>

              <div className="border border-outline-variant rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-surface-container border-b-[0.5px] border-outline-variant">
                    <tr>
                      {['Nguyên liệu', 'Trạng thái', 'Tồn đầu', 'Nhập (IN)', 'Xuất (total)', 'Tồn cuối'].map(h => (
                        <th key={h} className="px-3 py-2 text-left text-xs font-inter font-medium text-secondary uppercase tracking-widest whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/50">
                    {preview.rows.map((row, i) => (
                      <tr key={i} className="hover:bg-[#f0eded] transition-colors">
                        <td className="px-3 py-2 font-mono text-xs font-semibold text-on-surface">
                          {row.materialName}
                        </td>
                        <td className="px-3 py-2">
                          {row.isNew ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-[#fef3c7] text-[#92400e] border border-[#f59e0b]/30 whitespace-nowrap">
                              Mới tạo
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-[#f0fdf4] text-[#15803d] border border-[#22c55e]/30 whitespace-nowrap">
                              Đã có
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs tabular-nums text-on-surface-variant">
                          {row.firstStock.toLocaleString('vi-VN')}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs tabular-nums text-[#15803d] font-semibold">
                          {row.inQty > 0 ? `+${row.inQty.toLocaleString('vi-VN')}` : '—'}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs tabular-nums text-error font-semibold">
                          {totalOut(row) > 0 ? `-${totalOut(row).toLocaleString('vi-VN')}` : '—'}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs tabular-nums font-semibold text-primary">
                          {row.lastStock.toLocaleString('vi-VN')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="text-xs text-secondary">
                Tồn cuối (LAST STOCK) sẽ được set làm tồn hiện tại của mỗi nguyên liệu.
              </p>
            </div>
          )}

          {/* ── STEP 3: SUCCESS ── */}
          {step === 'success' && (
            <div className="flex flex-col items-center justify-center py-8 text-center gap-3">
              <span className="material-symbols-outlined text-[48px] text-[#15803d]">check_circle</span>
              <p className="text-base font-inter font-semibold text-on-surface">{successMsg}</p>
              <p className="text-sm text-secondary">Tồn kho đã được cập nhật theo file báo cáo.</p>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="px-6 py-3 border-t-[0.5px] border-outline-variant bg-surface-container-low shrink-0 flex justify-end gap-2">
          {step === 'upload' && (
            <>
              <button onClick={onClose} className="inline-flex items-center justify-center border border-primary bg-transparent hover:bg-surface-container text-primary text-sm font-medium px-4 py-2 h-9 rounded-md transition-colors">
                Huỷ
              </button>
              <button
                onClick={handlePreview}
                disabled={isLoading || !file}
                className="inline-flex items-center gap-2 bg-primary text-on-primary text-sm font-medium px-4 py-2 h-9 rounded-md hover:bg-primary/90 disabled:opacity-60 transition-colors"
              >
                {isLoading
                  ? <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/></svg> Đang đọc…</>
                  : <><span className="material-symbols-outlined text-[16px]">preview</span>Xem trước</>
                }
              </button>
            </>
          )}
          {step === 'preview' && (
            <>
              <button onClick={() => { setStep('upload'); setError(null) }} className="inline-flex items-center justify-center border border-primary bg-transparent hover:bg-surface-container text-primary text-sm font-medium px-4 py-2 h-9 rounded-md transition-colors">
                ← Quay lại
              </button>
              <button
                onClick={handleConfirm}
                disabled={isLoading}
                className="inline-flex items-center gap-2 bg-primary text-on-primary text-sm font-medium px-4 py-2 h-9 rounded-md hover:bg-primary/90 disabled:opacity-60 transition-colors"
              >
                {isLoading
                  ? <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/></svg> Đang lưu…</>
                  : <><span className="material-symbols-outlined text-[16px]">save</span>Xác nhận import</>
                }
              </button>
            </>
          )}
          {step === 'success' && (
            <button onClick={onClose} className="inline-flex items-center justify-center bg-primary text-on-primary text-sm font-medium px-4 py-2 h-9 rounded-md hover:bg-primary/90 transition-colors">
              Đóng
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
