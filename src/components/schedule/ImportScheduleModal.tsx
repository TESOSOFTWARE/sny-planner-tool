'use client'

// src/components/schedule/ImportScheduleModal.tsx
// 3-step modal for importing monthly production schedule (.xlsx)
// Step 1: File selection & Sheet selection
// Step 2: Full preview (assignments to delete, M-023 decision, assignments to create, drafts, manual list)
// Step 3: Success report

import { useState } from 'react'

interface Props {
  isOpen: boolean
  onClose: () => void
  onImported: () => void
}

interface AssignmentRef {
  id: string
  machineId: string
  piNumber: string
  startDate: string
  endDate: string
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

interface PreviewResponse {
  success: boolean
  error?: string
  availableSheets: string[]
  sheetName: string
  year: number
  month: number
  daysInMonth: number
  toDelete: AssignmentRef[]
  borderlineAssignment: AssignmentRef | null
  toCreateDraftOrders: string[]
  toCreateAssignments: AssignmentToCreate[]
  machineSpecs: MachineSpecEntry[]
  skippedAmbiguous: string[]
  skippedInvalid: string[]
  summary: {
    deleteCount: number
    borderlineCount: number
    assignmentsToCreate: number
    draftsToCreate: number
    ambiguousCount: number
    invalidCount: number
  }
}

type Step = 'upload' | 'preview' | 'success'

export default function ImportScheduleModal({ isOpen, onClose, onImported }: Props) {
  const [step, setStep] = useState<Step>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [sheetName, setSheetName] = useState('20.7.2026')
  const [deleteBorderline, setDeleteBorderline] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<PreviewResponse | null>(null)
  const [successMsg, setSuccessMsg] = useState('')

  if (!isOpen) return null

  // ── Step 1: Preview ────────────────────────────────────────────────────────
  const handlePreview = async () => {
    if (!file) {
      setError('Vui lòng chọn file .xlsx')
      return
    }
    setError(null)
    setIsLoading(true)

    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('sheetName', sheetName)

      const res = await fetch('/api/schedule/import', {
        method: 'POST',
        body: fd,
      })
      const data = (await res.json()) as PreviewResponse

      if (!res.ok || !data.success) {
        setError(data.error ?? 'Không thể đọc file Excel.')
        return
      }

      setPreview(data)
      setStep('preview')
    } catch {
      setError('Lỗi kết nối mạng.')
    } finally {
      setIsLoading(false)
    }
  }

  // ── Step 2: Confirm ────────────────────────────────────────────────────────
  const handleConfirm = async () => {
    if (!preview) return
    setError(null)
    setIsLoading(true)

    try {
      const res = await fetch('/api/schedule/import/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toDelete: preview.toDelete,
          deleteBorderline,
          borderlineAssignment: preview.borderlineAssignment,
          toCreateDraftOrders: preview.toCreateDraftOrders,
          toCreateAssignments: preview.toCreateAssignments,
          machineSpecs: preview.machineSpecs,
          year: preview.year,
          month: preview.month,
          summary: preview.summary,
        }),
      })

      const data = await res.json()
      if (!res.ok || !data.success) {
        setError(data.error ?? 'Không thể lưu dữ liệu.')
        return
      }

      setSuccessMsg(data.message ?? 'Import lịch sản xuất thành công!')
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
                  onChange={(e) => {
                    setFile(e.target.files?.[0] ?? null)
                    setError(null)
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
                <input
                  type="text"
                  value={sheetName}
                  onChange={(e) => setSheetName(e.target.value)}
                  placeholder="20.7.2026"
                  className="w-full max-w-[240px] h-10 px-3 rounded-lg border border-outline bg-surface text-on-surface text-sm focus:outline-none focus:border-primary transition-colors"
                />
                <p className="text-xs text-outline mt-1">
                  Nhập tên sheet chứa lịch máy (mặc định: 20.7.2026)
                </p>
              </div>
            </div>
          )}

          {/* ── STEP 2: PREVIEW ── */}
          {step === 'preview' && preview && (
            <div className="space-y-6">
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
                  <span className="text-xs text-secondary block mb-1">Cần gán tay (Ambiguous)</span>
                  <span className="text-lg font-semibold text-on-surface">
                    {preview.summary.ambiguousCount} PI
                  </span>
                </div>
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
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-secondary italic">Không có lịch cũ trùng khớp.</p>
                )}
              </div>

              {/* 2. Cảnh báo Borderline Assignment (M-023) */}
              {preview.borderlineAssignment && (
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
                        <strong>{preview.borderlineAssignment.machineId}</strong> (PI:{' '}
                        <strong>{preview.borderlineAssignment.piNumber}</strong>) kéo dài từ{' '}
                        {formatDate(preview.borderlineAssignment.startDate)} đến{' '}
                        {formatDate(preview.borderlineAssignment.endDate)}.
                      </p>
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-xs font-medium text-[#78350f] cursor-pointer pt-1 pl-7">
                    <input
                      type="checkbox"
                      checked={deleteBorderline}
                      onChange={(e) => setDeleteBorderline(e.target.checked)}
                      className="rounded border-[#d97706] text-[#d97706] focus:ring-[#d97706]"
                    />
                    Xóa luôn lịch vắt ngang này để đè lịch mới từ tháng {preview.month}
                  </label>
                </div>
              )}

              {/* 3. Đơn nháp & Lịch mới */}
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-on-surface flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[#15803d] text-[18px]">add_circle</span>
                  2. Sẽ tạo mới {preview.toCreateDraftOrders.length} đơn nháp & {preview.toCreateAssignments.length} lịch dệt
                </h4>
                <p className="text-xs text-secondary">
                  Các đơn nháp sẽ được tạo tự động với thông tin khách hàng là{' '}
                  <em className="text-on-surface font-medium">&quot;Chưa xác định (import từ lịch máy)&quot;</em>.
                </p>
              </div>

              {/* 4. Danh sách gán tay */}
              {preview.skippedAmbiguous.length > 0 && (
                <div className="p-3 rounded-lg bg-[#fef2f2] border border-[#ef4444]/30 space-y-1">
                  <h5 className="text-xs font-semibold text-[#b91c1c] flex items-center gap-1">
                    <span className="material-symbols-outlined text-[16px]">do_not_disturb_on</span>
                    3. Bỏ qua auto-assign cho {preview.skippedAmbiguous.length} PI bị trùng/ambiguous (Tung sẽ gán tay sau)
                  </h5>
                  <div className="flex gap-2 flex-wrap text-xs font-mono text-[#991b1b] pt-1">
                    {preview.skippedAmbiguous.map((pi) => (
                      <span key={pi} className="px-2 py-0.5 rounded bg-[#fee2e2] border border-[#fca5a5]">
                        {pi}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── STEP 3: SUCCESS ── */}
          {step === 'success' && (
            <div className="flex flex-col items-center justify-center py-8 text-center gap-3">
              <span className="material-symbols-outlined text-[56px] text-[#15803d]">check_circle</span>
              <h4 className="text-lg font-semibold text-on-surface">Import Hoàn Tất!</h4>
              <p className="text-sm text-secondary max-w-md">{successMsg}</p>

              {preview?.skippedAmbiguous && preview.skippedAmbiguous.length > 0 && (
                <div className="mt-3 p-3 rounded-lg bg-surface-container border border-outline-variant text-left text-xs max-w-lg w-full">
                  <p className="font-semibold text-on-surface mb-1">
                    Nhắc nhở gán tay {preview.skippedAmbiguous.length} PI sau:
                  </p>
                  <p className="font-mono text-secondary">
                    {preview.skippedAmbiguous.join(', ')}
                  </p>
                </div>
              )}
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
                disabled={isLoading || !file}
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
                disabled={isLoading}
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
