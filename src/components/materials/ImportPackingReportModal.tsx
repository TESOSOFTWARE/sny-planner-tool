'use client'

// src/components/materials/ImportPackingReportModal.tsx
// 3-step modal: Upload Excel Statistical Report → Preview Dry-Run → Confirm Import to DB.

import { useState } from 'react'
import type { PackingDecision } from '@/types'

interface Props {
  onImported: () => void
  onClose: () => void
}

interface PreviewOutput {
  date: string
  qtyDay: number | null
  totalMDay: number | null
  weightDay: number | null
  qtyNight: number | null
  totalMNight: number | null
  weightNight: number | null
  dataSource: string
  cellRef: string
  isValid?: boolean
  validationErrors?: string[]
}

interface PreviewResponse {
  success: boolean
  fileName: string
  totalRowsParsed: number
  availableSheets: string[]
  outputs: PreviewOutput[]
  expectedSnapshot: string
  decisions: PackingDecision[]
  error?: string
  code?: string
}

type Step = 'upload' | 'preview' | 'success'

export default function ImportPackingReportModal({ onImported, onClose }: Props) {
  const [step, setStep] = useState<Step>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<PreviewResponse | null>(null)
  const [replaceDates, setReplaceDates] = useState<string[]>([])
  const [successMsg, setSuccessMsg] = useState('')

  // ── Step 1: Upload & Preview ───────────────────────────────────────────────

  const handlePreview = async () => {
    if (!file) {
      setError('Vui lòng chọn file Excel báo cáo sản lượng (.xlsx)')
      return
    }
    setError(null)
    setIsLoading(true)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/materials/packing/import', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Lỗi khi đọc file Báo cáo Đóng gói')
      }

      setPreview(data)
      setReplaceDates([])
      setStep('preview')
    } catch (err: any) {
      setError(err.message || 'Có lỗi xảy ra khi đọc file Excel')
    } finally {
      setIsLoading(false)
    }
  }

  // ── Step 2: Confirm Import ─────────────────────────────────────────────────

  const handleConfirm = async () => {
    if (!preview || !preview.outputs) return
    setError(null)
    setIsLoading(true)

    try {
      const res = await fetch('/api/materials/packing/import/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          outputs: preview.outputs,
          fileName: preview.fileName,
          expectedSnapshot: preview.expectedSnapshot,
          replaceDates,
        }),
      })

      const data = await res.json()
      if (!res.ok || !data.success) {
        if (res.status === 409) {
          setPreview(null)
          setStep('upload')
          setReplaceDates([])
        }
        throw new Error(data.error || 'Lỗi khi lưu dữ liệu Đóng gói vào DB')
      }

      setSuccessMsg(`Đã tạo ${data.insertedCount} ngày, cập nhật ${data.updatedCount} ngày và giữ nguyên ${data.unchangedCount} ngày sản lượng Đóng gói.`)
      setStep('success')
      onImported()
    } catch (err: any) {
      setError(err.message || 'Lỗi khi lưu dữ liệu vào cơ sở dữ liệu')
    } finally {
      setIsLoading(false)
    }
  }

  const replaceDecisions = preview?.decisions.filter(decision => decision.status === 'replace') ?? []
  const replacementsAcknowledged = replaceDecisions.every(decision => replaceDates.includes(decision.date))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b pb-4">
          <div>
            <h2 className="text-xl font-bold text-slate-800">
              Import Báo Cáo Đóng Gói
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Tải lên sheet &quot;SẢN LƯỢNG ĐÓNG GÓI&quot; từ file STATISTICAL REPORT hàng tháng
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            ✕
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700 border border-rose-200">
            ⚠️ {error}
          </div>
        )}

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto py-4">
          {/* STEP 1: Upload */}
          {step === 'upload' && (
            <div className="space-y-4">
              <div className="rounded-xl border-2 border-dashed border-slate-200 p-8 text-center hover:border-slate-400 transition-colors">
                <input
                  type="file"
                  accept=".xlsx, .xls"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) {
                      setFile(f)
                      setPreview(null)
                      setReplaceDates([])
                      setError(null)
                    }
                  }}
                  className="hidden"
                  id="excel-packing-upload"
                />
                <label
                  htmlFor="excel-packing-upload"
                  className="cursor-pointer space-y-2 block"
                >
                  <div className="text-4xl">📦</div>
                  <div className="text-sm font-medium text-slate-700">
                    {file ? file.name : 'Nhấn để chọn file Báo cáo Đóng gói (.xlsx)'}
                  </div>
                  <div className="text-xs text-slate-400">
                    Chấp nhận file Excel chứa sheet &quot;SẢN LƯỢNG ĐÓNG GÓI&quot;
                  </div>
                </label>
              </div>

              <div className="rounded-xl bg-blue-50 p-3 text-xs text-blue-800 space-y-1">
                <div className="font-semibold text-blue-900">📌 Quy tắc parse sheet SẢN LƯỢNG ĐÓNG GÓI:</div>
                <ul className="list-disc pl-4 space-y-0.5 text-blue-700">
                  <li>Tự động tìm sheet <strong>SẢN LƯỢNG ĐÓNG GÓI</strong> trong file Excel.</li>
                  <li>Đọc số liệu theo ngày (Cột D = Ngày, E..J = SL, Mét, KG Ca Ngày &amp; Đêm).</li>
                  <li>Loại bỏ các dòng rỗng/không có sản lượng.</li>
                </ul>
              </div>
            </div>
          )}

          {/* STEP 2: Preview */}
          {step === 'preview' && preview && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-emerald-50 p-3 text-emerald-800 border border-emerald-100">
                  <div className="text-xs text-emerald-600 font-medium">Số Ngày Có Số Liệu</div>
                  <div className="text-xl font-bold">{preview.totalRowsParsed} ngày</div>
                </div>
                <div className="rounded-xl bg-slate-50 p-3 text-slate-700 border border-slate-200">
                  <div className="text-xs text-slate-500 font-medium">File Nguồn</div>
                  <div className="text-sm font-semibold truncate">{preview.fileName}</div>
                </div>
              </div>

              <div className="text-xs font-semibold text-slate-700 pt-2">Xem Trước Dữ Liệu Sẽ Nhập:</div>
              <div className="overflow-x-auto rounded-xl border border-slate-200 max-h-60">
                <table className="min-w-full text-xs text-left">
                  <thead className="bg-slate-100 text-slate-600 sticky top-0">
                    <tr>
                      <th className="px-3 py-2">Ngày</th>
                      <th className="px-3 py-2">SL Ca Ngày</th>
                      <th className="px-3 py-2">Mét Ca Ngày</th>
                      <th className="px-3 py-2">KG Ca Ngày</th>
                      <th className="px-3 py-2">SL Ca Đêm</th>
                      <th className="px-3 py-2">Mét Ca Đêm</th>
                      <th className="px-3 py-2">KG Ca Đêm</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {preview.outputs.slice(0, 10).map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="px-3 py-1.5 font-medium text-slate-800">{row.date}</td>
                        <td className="px-3 py-1.5 text-slate-600">{row.qtyDay ?? '-'}</td>
                        <td className="px-3 py-1.5 text-slate-600">{row.totalMDay != null ? Number(row.totalMDay).toLocaleString() : '-'}</td>
                        <td className="px-3 py-1.5 text-slate-600">{row.weightDay != null ? Number(row.weightDay).toLocaleString() : '-'}</td>
                        <td className="px-3 py-1.5 text-slate-600">{row.qtyNight ?? '-'}</td>
                        <td className="px-3 py-1.5 text-slate-600">{row.totalMNight != null ? Number(row.totalMNight).toLocaleString() : '-'}</td>
                        <td className="px-3 py-1.5 text-slate-600">{row.weightNight != null ? Number(row.weightNight).toLocaleString() : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {preview.outputs.length > 10 && (
                <div className="text-center text-xs text-slate-400">
                  ...và {preview.outputs.length - 10} ngày khác
                </div>
              )}
              <div className="space-y-2 text-xs">
                {preview.decisions.map(decision => (
                  <div key={decision.date} className="flex items-center justify-between rounded border border-slate-200 px-2 py-1">
                    <span>{decision.date} — {decision.status === 'new' ? 'Mới' : decision.status === 'identical' ? 'Giống dữ liệu hiện tại' : 'Cần thay thế'}</span>
                    {decision.status === 'replace' && <label className="inline-flex items-center gap-1"><input type="checkbox" checked={replaceDates.includes(decision.date)} onChange={() => setReplaceDates(current => current.includes(decision.date) ? current.filter(date => date !== decision.date) : [...current, decision.date])} /> Xác nhận thay thế</label>}
                  </div>
                ))}
              </div>
              {replaceDecisions.length > 0 && <button type="button" onClick={() => setReplaceDates(replaceDecisions.map(decision => decision.date))} className="text-xs text-blue-700 underline">Chọn tất cả ngày cần thay thế</button>}
              <p className="text-xs text-slate-500">Các ngày không có trong file không bị xóa.</p>
            </div>
          )}

          {/* STEP 3: Success */}
          {step === 'success' && (
            <div className="py-8 text-center space-y-3">
              <div className="text-5xl">🎉</div>
              <div className="text-lg font-bold text-slate-800">{successMsg}</div>
              <p className="text-xs text-slate-500">
                Dữ liệu Đóng gói đã sẵn sàng hiển thị trên bảng thống kê Đóng gói.
              </p>
            </div>
          )}
        </div>

        {/* Footer Buttons */}
        <div className="border-t pt-4 flex justify-end gap-2">
          {step === 'upload' && (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handlePreview}
                disabled={!file || isLoading}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-xl flex items-center gap-2"
              >
                {isLoading && <span className="animate-spin">⏳</span>}
                Đọc thử File Excel (Preview)
              </button>
            </>
          )}

          {step === 'preview' && (
            <>
              <button
                type="button"
                onClick={() => { setStep('upload'); setPreview(null); setReplaceDates([]) }}
                disabled={isLoading}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Chọn File Khác
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={isLoading || !replacementsAcknowledged}
                className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-xl flex items-center gap-2"
              >
                {isLoading && <span className="animate-spin">⏳</span>}
                Xác Nhận Import Vào DB
              </button>
            </>
          )}

          {step === 'success' && (
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2 text-sm font-medium text-white bg-slate-800 hover:bg-slate-900 rounded-xl"
            >
              Đóng
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
