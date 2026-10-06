'use client'

// src/components/orders/ImportOrdersModal.tsx
// Client component — "Import Excel" trigger button + modal overlay.
// Displays strict row-level validation status matching MultiLineOrderForm.
// Invalid rows are visually highlighted in red and skipped on confirm.

import React, { useState, useRef, Fragment } from 'react'
import { useRouter } from 'next/navigation'
import type { OrderImportDecision, ParsedOrder } from '@/types'

// ── Types ─────────────────────────────────────────────────────────────────────

type ModalState =
  | 'closed'
  | 'uploading'
  | 'preview'
  | 'confirming'
  | 'success'
  | 'error'

interface CustomerReview {
  name: string
  suggestedId: string
  suggestedName: string
  reason: string
}

interface PreviewData {
  rows: ParsedOrder[]
  totalParsed: number
  piWarnings?: string[]
  customerWarnings?: string[]
  customerReviews?: CustomerReview[]
  customerNew?: string[]
  customerAmbiguous?: { name: string; reason: string }[]
  decisions: OrderImportDecision[]
}

interface ConfirmResult {
  imported: number
  skipped: number
  errors?: string[]
  summary: { total: number; created: number; identical: number; conflicted: number; invalid: number }
  decisions?: OrderImportDecision[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// B4: primary planner action per conflict resolution. Full reasons stay on
// the decision; this is only the headline hint.
const RESOLUTION_HINT: Record<string, string> = {
  DUPLICATE_IN_DB: 'Hệ thống có nhiều đơn cùng PI + NO — cần người kiểm tra',
  DRAFT_EXISTS: 'Đơn nháp này đã tồn tại — mở ra duyệt tay',
  DUPLICATE_IN_FILE: 'Trong file có 2 dòng cùng PI + NO nhưng khác nội dung',
  SPLIT_BY_CUSTOMER: 'Cùng PI với nhiều khách trong file — tách từng khách ra',
  ADD_NO_TO_FILE: 'Bổ sung cột NO cho dòng này rồi import lại',
  CONTENT_DIFFERS: 'Khác nội dung đơn hiện tại',
}

const FIELD_LABELS: Record<string, string> = {
  customer: 'Khách hàng',
  orderDate: 'Ngày đặt',
  color: 'Màu',
  colorVersion: 'Version màu',
  widthM: 'Khổ',
  lengthM: 'Chiều dài',
  gsm: 'GSM',
  orderType: 'Kiểu dệt',
  qty: 'Số lượng',
  rollLength: 'Dài cuộn',
  pieceLength: 'Dài tấm',
  productionGsm: 'GSM SX',
  primaryPackingType: 'Đóng gói chính',
  hasPaperCore: 'Lõi giấy',
  isHalfFolded: 'Gấp đôi',
  piecesPerCarton: 'Cây/thùng',
  piecesPerBale: 'Cây/kiện',
  boxDimensions: 'KT thùng',
  onPallet: 'Pallet',
  secondaryPackingType: 'Đóng gói phụ',
  palletDimensions: 'KT pallet',
  itemsPerPallet: 'SL/pallet',
  packingNote: 'Ghi chú đóng gói',
  uvPct: 'UV%',
  frFlag: 'Chống cháy',
  frPct: 'FR%',
  description: 'Mô tả',
  remark: 'Remark',
  lineNote: 'Ghi chú dòng',
  requiresPacking: 'Cần đóng gói',
  deliveryDate: 'Ngày giao',
  containerSize: 'Container',
  meshType: 'Loại lưới',
  needleCount: 'Số kim',
  beamCount: 'Dàn sợi',
  mbCode: 'Mã MB',
  itemCode: 'Item Code',
  hasEyelet: 'Khoen',
  eyeletColor: 'Màu khoen',
  eyeletLines: 'Đường khoen',
  eyeletSpec: 'Quy cách khoen',
}

function formatChangedFields(fields: string[]): { summary: string; full: string } {
  if (!fields || fields.length === 0) return { summary: '', full: '' }
  const viNames = fields.map((f) => FIELD_LABELS[f] ?? f)
  const full = viNames.join(', ')
  if (viNames.length <= 3) {
    return { summary: `Lệch: ${viNames.join(', ')}`, full }
  }
  const top = viNames.slice(0, 3).join(', ')
  const remaining = viNames.length - 3
  return { summary: `Lệch: ${top} (+${remaining} trường)`, full }
}

function formatDate(iso: string): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function formatAdditionalFields(row: ParsedOrder): string {
  const fields = [
    row.orderType && `Kiểu: ${row.orderType}`,
    row.qty != null && `SL: ${row.qty}`,
    row.rollLength != null && `m/cuộn: ${row.rollLength}`,
    row.pieceLength != null && `m/tấm: ${row.pieceLength}`,
    row.productionGsm != null && `GSM SX: ${row.productionGsm}`,
    row.frPct != null && `FR: ${row.frPct}%`,
    row.itemCode && `Item Code: ${row.itemCode}`,
    row.mbCode && `MB: ${row.mbCode}`,
    row.meshType && `Lưới: ${row.meshType}`,
    row.needleCount != null && `Kim: ${row.needleCount}`,
    row.beamCount != null && `Dàn: ${row.beamCount}`,
    row.requiresPacking && 'Đóng gói',
    row.deliveryDate && `Giao: ${formatDate(row.deliveryDate)}`,
    row.containerSize && `Cont: ${row.containerSize}`,
    row.hasEyelet && `Eyelet${row.eyeletLines != null ? ` ${row.eyeletLines} lines` : ''}${row.eyeletColor ? ` ${row.eyeletColor}` : ''}`,
    row.eyeletSpec && `Eyelet: ${row.eyeletSpec}`,
    row.lineNote && `Note: ${row.lineNote}`,
  ].filter(Boolean)
  return fields.join(' · ') || '—'
}

interface ErrorFixGuide {
  tag: string
  column: string
  guide: string
}

export function getErrorFixInfo(error: string): ErrorFixGuide {
  const e = error.trim()
  if (/PI Number/i.test(e)) {
    return { tag: 'Thiếu PI', column: 'PI NUMBER', guide: 'Mở file Excel, điền mã PI vào cột PI NUMBER.' }
  }
  if (/Khách hàng/i.test(e)) {
    return { tag: 'Thiếu Khách', column: 'CUSTOMER', guide: 'Mở file Excel, điền tên khách hàng vào cột CUSTOMER.' }
  }
  if (/Ngày đặt/i.test(e)) {
    return { tag: 'Thiếu Ngày đặt', column: 'DATE', guide: 'Điền ngày đặt hàng theo định dạng YYYY-MM-DD.' }
  }
  if (/Desert Sand/i.test(e)) {
    return { tag: 'Cần Version A/B', column: 'COLOR VERSION', guide: 'Màu Desert Sand bắt buộc chọn rõ Version A hoặc Version B ở cột COLOR VERSION.' }
  }
  if (/Màu/i.test(e)) {
    return { tag: 'Thiếu Màu', column: 'COLOR', guide: 'Mở file Excel, điền tên màu vải vào cột COLOR.' }
  }
  if (/Khổ/i.test(e)) {
    return { tag: 'Thiếu Khổ (m)', column: 'WIDTH', guide: 'Điền khổ m (> 0, tối đa 20m) vào cột WIDTH.' }
  }
  if (/GSM/i.test(e)) {
    return { tag: 'Thiếu GSM', column: 'GSM', guide: 'Điền định lượng GSM (> 0) vào cột GSM.' }
  }
  if (/Carton|thùng/i.test(e)) {
    return { tag: 'Thiếu SL Thùng', column: 'SỐ TẤM/THÙNG', guide: 'Khi chọn đóng thùng Carton, cần nhập số tấm/thùng (> 0) hoặc đổi loại đóng gói.' }
  }
  if (/BALE|kiện/i.test(e)) {
    return { tag: 'Thiếu SL Kiện', column: 'SỐ TẤM/KIỆN', guide: 'Khi chọn đóng kiện BALE, cần nhập số tấm/kiện (> 0) hoặc đổi loại đóng gói.' }
  }
  if (/HEMMED/i.test(e)) {
    return { tag: 'Thiếu Quy cách May viền', column: 'PACKING', guide: 'Hàng May viền đóng khuy (HEMMED) cần chọn quy cách con là CARTON hoặc BALE.' }
  }
  if (/Pallet/i.test(e)) {
    return { tag: 'Thiếu Loại Pallet', column: 'SECONDARY PACKING', guide: 'Khi chọn đóng trên Pallet, cần chọn loại pallet (Gỗ/Nhựa/Sắt) và kích thước.' }
  }
  if (/tráng màng|laminate/i.test(e)) {
    return { tag: 'Thiếu GSM Mộc/TP', column: 'RAW FABRIC GSM', guide: 'Hàng tráng màng ngoài bắt buộc có cả GSM dệt mộc và GSM thành phẩm.' }
  }
  if (/chống cháy|FR/i.test(e)) {
    return { tag: 'Thiếu FR%', column: 'FR %', guide: 'Khi chọn chống cháy (FR), cần nhập % FR > 0.' }
  }
  if (/chiều dài|tổng mét/i.test(e)) {
    return { tag: 'Thiếu Chiều dài', column: 'LENGTH', guide: 'Điền chiều dài mét (> 0) hoặc số cuộn × mét/cuộn.' }
  }
  return { tag: 'Lỗi thông số', column: 'EXCEL FILE', guide: e }
}

function formatErrorShortTag(error: string): string {
  return getErrorFixInfo(error).tag
}

function formatCompactValidationErrors(errors?: string[]): string {
  if (!errors || errors.length === 0) return 'Lỗi dữ liệu'
  const tags = Array.from(new Set(errors.map(formatErrorShortTag)))
  if (tags.length === 1) return tags[0]
  if (tags.length === 2) return `${tags[0]}, ${tags[1]}`
  return `${tags[0]}, ${tags[1]} (+${tags.length - 2})`
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
  // Planner decision per NEEDS_REVIEW customer name: `MERGE:<customerId>` | 'NEW'.
  // Defaults to the server suggestion (merge); planner flips per row if needed.
  const [customerChoices, setCustomerChoices] = useState<Record<string, string>>({})
  const [statusFilter, setStatusFilter] = useState<'all' | 'new' | 'identical' | 'conflict' | 'invalid'>('all')
  const [expandedRowIdx, setExpandedRowIdx] = useState<number | null>(null)

  // ── Handlers ────────────────────────────────────────────────────────────────

  const openModal = () => {
    setPreview(null)
    setResult(null)
    setError(null)
    setSelectedFile(null)
    setCustomerChoices({})
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

      setPreview({ rows: json.preview, totalParsed: json.totalParsed, piWarnings: json.piWarnings, customerWarnings: json.customerWarnings, customerReviews: json.customerReviews, customerNew: json.customerNew, customerAmbiguous: json.customerAmbiguous ?? [], decisions: json.decisions ?? [] })
      // B1: NO silent auto-merge. The planner must explicitly choose merge or
      // new for every NEEDS_REVIEW name; customerChoices starts empty.
      setCustomerChoices({})
      setState('preview')
    } catch {
      setError('Lỗi kết nối mạng — không thể gửi file lên máy chủ.')
    }
  }

  // Step 2: confirm → save ONLY valid rows to DB
  const handleConfirm = async () => {
    if (!preview) return

    if (preview.rows.length === 0) {
      setError('Không có dòng nào để import.')
      return
    }

    setState('confirming')
    setError(null)

    try {
      const res = await fetch('/api/orders/import/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows: preview.rows,
          customerOverrides: Object.entries(customerChoices).map(([rowName, decision]) => ({ rowName, decision })),
        }),
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
        errors: json.errors ?? [],
        summary: json.summary,
        decisions: json.decisions ?? [],
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
    setCustomerChoices({})
    if (fileInputRef.current) fileInputRef.current.value = ''
    setState('uploading')
  }

  // B3: count from server decisions & row validity synchronously
  const decisionCounts = (() => {
    const c = { new: 0, identical: 0, conflict: 0, invalid: 0 }
    const rows = preview?.rows ?? []
    const decisions = preview?.decisions ?? []
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const d = decisions[i]
      if (row?.isValid === false || d?.status === 'invalid') {
        c.invalid += 1
      } else if (d?.status === 'new') {
        c.new += 1
      } else if (d?.status === 'identical') {
        c.identical += 1
      } else if (d?.status === 'conflict') {
        c.conflict += 1
      } else {
        c.invalid += 1
      }
    }
    return c
  })()
  // B2: NEEDS_REVIEW names the planner still has to resolve (radio starts
  // unselected). AMBIGUOUS names are NOT counted here — they have no
  // resolution UI yet (P0-10), their rows are already marked conflict and
  // skipped; blocking the whole confirm on them would lock out good rows.
  const pendingCustomerCount = (preview?.customerReviews ?? []).filter(
    (r) => !(String(r.name).trim() in customerChoices),
  ).length

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
                <div className="space-y-3">
                  {/* Collapsible PI & Data Warnings */}
                  {preview.piWarnings && preview.piWarnings.length > 0 && (
                    <details className="group border border-amber-200 bg-amber-50/60 rounded-xl overflow-hidden transition-all text-xs">
                      <summary className="flex items-center justify-between px-3.5 py-2.5 cursor-pointer font-medium text-amber-900 select-none hover:bg-amber-100/50">
                        <div className="flex items-center gap-2">
                          <span className="material-symbols-outlined text-[18px] text-amber-600">warning</span>
                          <span>
                            Phát hiện <strong>{preview.piWarnings.length} cảnh báo xung đột</strong> trong file
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-amber-800 font-normal">
                          <span className="group-open:hidden">Xem danh sách ▼</span>
                          <span className="hidden group-open:inline">Thu gọn ▲</span>
                        </div>
                      </summary>
                      <div className="px-3.5 pb-3 pt-1 border-t border-amber-200/60 space-y-1 text-slate-700 bg-white/70 max-h-40 overflow-y-auto">
                        {preview.piWarnings.map((w, i) => (
                          <div key={i} className="flex items-start gap-1.5 text-[11px] text-amber-900 font-mono">
                            <span className="text-amber-500 shrink-0">•</span>
                            <span>{w.replace(/^⚠\s*/, '')}</span>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}

                  {/* Centralized Customer Review Widget - Structured 2-Tier Cards with Bulk Actions */}
                  {preview.customerReviews && preview.customerReviews.length > 0 && (
                    <div className={`border rounded-xl p-3.5 space-y-3 transition-colors ${
                      pendingCustomerCount > 0 
                        ? 'bg-amber-50/70 border-amber-300 shadow-xs' 
                        : 'bg-emerald-50/40 border-emerald-300 shadow-2xs'
                    }`}>
                      {/* Header & Bulk Actions */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2.5 border-b border-amber-200/60">
                        <div className="flex items-center gap-2">
                          <span className="material-symbols-outlined text-[20px] text-amber-700">handshake</span>
                          <div>
                            <h4 className="text-xs font-bold text-slate-900 font-inter uppercase tracking-wide">
                              Xác nhận đối chiếu khách hàng ({preview.customerReviews.length} tên gần giống)
                            </h4>
                            <p className="text-[11px] text-slate-500">
                              Chọn gộp vào khách hàng hiện có hoặc tạo bản ghi khách hàng mới trong CSDL
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {/* Progress Badge */}
                          {pendingCustomerCount > 0 ? (
                            <span className="text-[11px] font-semibold text-rose-700 bg-rose-50 px-2.5 py-1 rounded-full border border-rose-200 flex items-center gap-1.5 shrink-0">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                              Còn {pendingCustomerCount}/{preview.customerReviews.length} khách chưa chọn
                            </span>
                          ) : (
                            <span className="text-[11px] font-medium text-emerald-800 bg-emerald-100/90 px-2.5 py-1 rounded-full border border-emerald-300 flex items-center gap-1 shrink-0 font-inter">
                              <span className="material-symbols-outlined text-[14px]">check_circle</span>
                              Đã xác nhận ({preview.customerReviews.length}/{preview.customerReviews.length})
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Customer Cards List */}
                      <div className="space-y-2.5">
                        {preview.customerReviews.map((review) => {
                          const key = String(review.name).trim()
                          const choice = customerChoices[key]
                          const isMerge = choice?.startsWith('MERGE:')
                          const isNew = choice === 'NEW'
                          const isPending = !choice

                          return (
                            <div 
                              key={key} 
                              className={`p-3 bg-white rounded-xl border transition-all shadow-2xs space-y-2.5 ${
                                isPending
                                  ? 'border-amber-300 bg-amber-50/20'
                                  : isMerge 
                                  ? 'border-emerald-300 bg-emerald-50/30' 
                                  : 'border-slate-200'
                              }`}
                            >
                              {/* Thông tin đối chiếu trực diện */}
                              <div className="flex items-center gap-2 flex-wrap text-xs">
                                <span className="font-bold text-slate-900 font-mono bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                                  {review.name}
                                </span>
                                <span className="text-slate-400 font-bold">→</span>
                                <span className="font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 flex items-center gap-1">
                                  <span className="material-symbols-outlined text-[14px] text-emerald-600">corporate_fare</span>
                                  {review.suggestedName}
                                </span>
                              </div>

                              {/* 2 Lựa chọn tinh gọn, nền sáng */}
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <button
                                  type="button"
                                  onClick={() => setCustomerChoices((prev) => ({ ...prev, [key]: `MERGE:${review.suggestedId}` }))}
                                  className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-xs transition-all cursor-pointer text-left ${
                                    isMerge
                                      ? 'bg-emerald-50 text-emerald-950 border-emerald-400 font-semibold ring-1 ring-emerald-300 shadow-2xs'
                                      : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
                                  }`}
                                >
                                  <span className={`material-symbols-outlined text-[18px] shrink-0 ${isMerge ? 'text-emerald-700' : 'text-slate-400'}`}>
                                    {isMerge ? 'radio_button_checked' : 'radio_button_unchecked'}
                                  </span>
                                  <span>Gộp vào <strong>{review.suggestedName}</strong></span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => setCustomerChoices((prev) => ({ ...prev, [key]: 'NEW' }))}
                                  className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-xs transition-all cursor-pointer text-left ${
                                    isNew
                                      ? 'bg-sky-50 text-sky-950 border-sky-400 font-semibold ring-1 ring-sky-300 shadow-2xs'
                                      : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
                                  }`}
                                >
                                  <span className={`material-symbols-outlined text-[18px] shrink-0 ${isNew ? 'text-sky-700' : 'text-slate-400'}`}>
                                    {isNew ? 'radio_button_checked' : 'radio_button_unchecked'}
                                  </span>
                                  <span>Tạo khách mới <strong>“{review.name}”</strong></span>
                                </button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {preview.customerAmbiguous && preview.customerAmbiguous.length > 0 && (
                    <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 space-y-1">
                      {preview.customerAmbiguous.map((a, i) => (
                        <div key={i} className="flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-[16px] text-rose-600 shrink-0">block</span>
                          <span>Khách hàng <strong>“{a.name}”</strong> trùng nhiều bản ghi trong CSDL — các dòng này bị hoãn ghi ({a.reason})</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* B3: Summary Bar & Interactive Filter Tabs */}
                  <div className="flex flex-wrap items-center justify-between gap-3 p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mr-1">Bộ lọc:</span>
                      
                      <button
                        type="button"
                        onClick={() => setStatusFilter('all')}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium text-xs transition-all ${
                          statusFilter === 'all'
                            ? 'bg-slate-800 text-white shadow-xs font-semibold'
                            : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
                        }`}
                      >
                        Tất cả
                        <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${statusFilter === 'all' ? 'bg-slate-700 text-slate-200' : 'bg-slate-100 text-slate-600'}`}>
                          {preview.rows.length}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setStatusFilter('new')}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium text-xs transition-all ${
                          statusFilter === 'new'
                            ? 'bg-emerald-700 text-white shadow-xs font-semibold ring-2 ring-emerald-400/30'
                            : 'bg-white hover:bg-emerald-50 text-emerald-800 border border-emerald-200'
                        }`}
                      >
                        <span>✓ Hợp lệ</span>
                        <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${statusFilter === 'new' ? 'bg-emerald-800 text-emerald-100' : 'bg-emerald-100 text-emerald-800'}`}>
                          {decisionCounts.new}
                        </span>
                      </button>

                      {decisionCounts.identical > 0 && (
                        <button
                          type="button"
                          onClick={() => setStatusFilter('identical')}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium text-xs transition-all ${
                            statusFilter === 'identical'
                              ? 'bg-slate-700 text-white shadow-xs font-semibold ring-2 ring-slate-400/30'
                              : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
                          }`}
                        >
                          <span>↺ Trùng nội dung</span>
                          <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${statusFilter === 'identical' ? 'bg-slate-800 text-slate-200' : 'bg-slate-100 text-slate-700'}`}>
                            {decisionCounts.identical}
                          </span>
                        </button>
                      )}

                      {decisionCounts.conflict > 0 && (
                        <button
                          type="button"
                          onClick={() => setStatusFilter('conflict')}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium text-xs transition-all ${
                            statusFilter === 'conflict'
                              ? 'bg-amber-600 text-white shadow-xs font-semibold ring-2 ring-amber-400/30'
                              : 'bg-white hover:bg-amber-50 text-amber-800 border border-amber-300'
                          }`}
                        >
                          <span>⚠ Cần xử lý</span>
                          <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${statusFilter === 'conflict' ? 'bg-amber-700 text-amber-100' : 'bg-amber-100 text-amber-900 font-bold'}`}>
                            {decisionCounts.conflict}
                          </span>
                        </button>
                      )}

                      {decisionCounts.invalid > 0 && (
                        <button
                          type="button"
                          onClick={() => setStatusFilter('invalid')}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium text-xs transition-all ${
                            statusFilter === 'invalid'
                              ? 'bg-rose-700 text-white shadow-xs font-semibold ring-2 ring-rose-400/30'
                              : 'bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-300'
                          }`}
                        >
                          <span>✗ Lỗi dữ liệu</span>
                          <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${statusFilter === 'invalid' ? 'bg-rose-800 text-rose-100 font-bold' : 'bg-rose-200 text-rose-900 font-bold'}`}>
                            {decisionCounts.invalid}
                          </span>
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-2 text-slate-500 text-[11px]">
                      <span className="material-symbols-outlined text-[15px] text-slate-400">info</span>
                      <span>Nhấn vào dòng lỗi để xem cột Excel và hướng dẫn sửa</span>
                    </div>
                  </div>

                  {/* Data Table */}
                  <div className="overflow-x-auto rounded-lg border-[0.5px] border-outline-variant max-h-96">
                    <table className="min-w-full text-xs">
                      <thead className="sticky top-0 bg-surface-container border-b-[0.5px] border-outline-variant">
                        <tr>
                          {['#', 'Trạng thái Validation', 'PI Number', 'Sub-line', 'Customer', 'Date', 'Width (m)', 'Length (m)', 'GSM', 'Color', 'FR', 'UV%', 'Thông tin bổ sung'].map((h) => (
                            <th
                              key={h}
                              className={`px-sm py-xs text-left text-label-sm font-inter font-medium text-secondary uppercase tracking-wide ${
                                h === 'Trạng thái Validation'
                                  ? 'w-[180px] min-w-[150px] max-w-[260px]'
                                  : h === 'Thông tin bổ sung'
                                  ? 'max-w-[320px] whitespace-nowrap'
                                  : 'whitespace-nowrap'
                              }`}
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[0.5px] divide-outline-variant">
                        {(() => {
                          const filteredRows = preview.rows
                            .map((row, idx) => ({ row, idx, decision: preview.decisions[idx] }))
                            .filter(({ row, decision }) => {
                              const isInvalid = row.isValid === false || decision?.status === 'invalid'
                              if (statusFilter === 'invalid') return isInvalid
                              if (isInvalid) return false
                              if (statusFilter === 'conflict') return decision?.status === 'conflict'
                              if (statusFilter === 'identical') return decision?.status === 'identical'
                              if (statusFilter === 'new') return decision?.status === 'new'
                              return true
                            })

                          if (filteredRows.length === 0) {
                            return (
                              <tr>
                                <td colSpan={13} className="text-center py-10 text-secondary text-sm">
                                  <div className="flex flex-col items-center gap-2">
                                    <span className="material-symbols-outlined text-slate-400 text-[28px]">filter_list_off</span>
                                    <span>Không có dòng nào phù hợp với bộ lọc hiện tại.</span>
                                    <button
                                      type="button"
                                      onClick={() => setStatusFilter('all')}
                                      className="text-primary hover:underline text-xs font-medium"
                                    >
                                      Quay lại xem tất cả ({preview.rows.length} dòng)
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            )
                          }

                          return filteredRows.map(({ row, idx, decision }) => {
                            const isValidRow = row.isValid !== false
                            const isConflict = decision?.status === 'conflict'
                            const isIdentical = decision?.status === 'identical'
                            const rowErrors = row.validationErrors ?? []

                            // In-cell error detection
                            const isPiError = !row.piNumber || row.piNumber === 'CHƯA_CÓ_PI' || rowErrors.some((e) => /PI Number/i.test(e))
                            const isGsmError = !row.gsm || row.gsm <= 0 || rowErrors.some((e) => /GSM/i.test(e))
                            const isColorError = !row.color || rowErrors.some((e) => /Màu|Desert Sand/i.test(e))
                            const isWidthError = !row.widthM || row.widthM <= 0 || rowErrors.some((e) => /Khổ/i.test(e))
                            const isLengthError = rowErrors.some((e) => /chiều dài|tổng mét/i.test(e))
                            const isPackingError = rowErrors.some((e) => /Carton|thùng|BALE|kiện|HEMMED|Pallet/i.test(e))
                            const isLaminateError = rowErrors.some((e) => /tráng màng|laminate|mộc/i.test(e))

                            return (
                              <React.Fragment key={idx}>
                                <tr
                                  onClick={() => !isValidRow && setExpandedRowIdx(expandedRowIdx === idx ? null : idx)}
                                  className={`transition-colors ${
                                    !isValidRow
                                      ? 'bg-rose-50/70 hover:bg-rose-100/60 cursor-pointer'
                                      : isConflict
                                      ? 'bg-amber-50/70 hover:bg-amber-100/60'
                                      : idx % 2 === 0
                                      ? 'bg-surface-container-lowest hover:bg-surface-container-low'
                                      : 'bg-surface-container-low/40 hover:bg-surface-container-low'
                                  }`}
                                >
                                  <td className="px-sm py-xs text-outline tabular-nums text-center font-mono">{idx + 1}</td>

                                  {/* Validation Status Column */}
                                  <td className="px-sm py-xs w-[180px] min-w-[150px] max-w-[260px] align-middle">
                                    {!isValidRow ? (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          setExpandedRowIdx(expandedRowIdx === idx ? null : idx)
                                        }}
                                        className="inline-flex items-center justify-between gap-1.5 px-2.5 py-1 rounded-md bg-rose-100 hover:bg-rose-200 text-rose-900 font-semibold border border-rose-300 text-[11px] text-left transition-colors w-full cursor-pointer shadow-2xs group"
                                        title="Nhấn để xem hướng dẫn sửa cột Excel"
                                      >
                                        <div className="flex items-center gap-1 min-w-0">
                                          <span className="shrink-0 text-rose-700 font-bold">✗</span>
                                          <span className="font-semibold whitespace-nowrap">{formatCompactValidationErrors(row.validationErrors)}</span>
                                        </div>
                                        <span className="material-symbols-outlined text-[15px] text-rose-700 group-hover:scale-110 transition-transform shrink-0">
                                          {expandedRowIdx === idx ? 'keyboard_arrow_up' : 'build'}
                                        </span>
                                      </button>
                                    ) : isConflict ? (
                                      <span className="inline-flex flex-col items-start gap-1 px-2 py-1 rounded bg-amber-100 text-amber-800 font-semibold border border-amber-300 text-[11px] w-full max-w-[260px] whitespace-normal break-words leading-tight">
                                        <span className="whitespace-normal break-words">
                                          ⚠ {decision.resolution ? RESOLUTION_HINT[decision.resolution] ?? `Conflict: ${decision.reasons.join(', ')}` : `Conflict: ${decision.reasons.join(', ')}`}
                                        </span>
                                        {decision.reasons.length > 1 && (
                                          <span className="font-normal whitespace-normal break-words text-[10px] text-amber-900/80">
                                            và {decision.reasons.length - 1} lý do khác
                                          </span>
                                        )}
                                        {decision.itemCodeChange && (
                                          <span className="block w-full font-normal whitespace-normal break-words text-[10px]">
                                            {decision.itemCodeChange.existing == null ? 'Bổ sung Item Code' : 'Item Code khác'}:
                                            {' '}Đang lưu: <code>{decision.itemCodeChange.existing ?? 'Chưa có mã'}</code>
                                            {' → '}Trong file: <code>{decision.itemCodeChange.incoming}</code>.
                                            {' '}Import giữ nguyên đơn đã lưu; mở sửa dòng này nếu muốn cập nhật.
                                          </span>
                                        )}
                                        {decision.changedFields.length > 0 && (() => {
                                          const { summary, full } = formatChangedFields(decision.changedFields)
                                          return (
                                            <span
                                              className="block w-full font-normal whitespace-normal break-words text-[10px] text-amber-900/90 cursor-help"
                                              title={`Chi tiết các trường khác biệt:\n${full}`}
                                            >
                                              {summary}
                                            </span>
                                          )
                                        })()}
                                        {decision.existingOrderId && (
                                          <a
                                            href={`/orders/pi/${encodeURIComponent(decision.piNumber)}?lineId=${encodeURIComponent(decision.existingOrderId)}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-0.5 underline font-bold mt-0.5 text-[11px] text-amber-950 hover:text-amber-800"
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            <span>Mở sửa dòng này</span>
                                            <span className="text-[10px]">↗</span>
                                          </a>
                                        )}
                                      </span>
                                    ) : isIdentical ? (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-medium border border-slate-200 text-[11px] whitespace-nowrap">
                                        ↺ Đã tồn tại / bỏ qua
                                      </span>
                                    ) : row.lifecycleStatus === 'DRAFT' ? (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 text-amber-800 font-medium border border-amber-200 text-[11px] whitespace-nowrap">
                                        ✓ Hợp lệ (Nháp)
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-medium border border-emerald-200 text-[11px] whitespace-nowrap">
                                        ✓ Hợp lệ
                                      </span>
                                    )}
                                  </td>

                                  {/* PI Number Cell - In-cell Highlighting */}
                                  <td className={`px-sm py-xs font-mono text-type-mono whitespace-nowrap ${isPiError ? 'bg-rose-100/70' : 'text-on-surface'}`}>
                                    {isPiError ? (
                                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-200 text-rose-900 border border-rose-300 font-bold text-[11px]" title="Thiếu mã PI">
                                        <span className="text-rose-700 font-bold">⚠</span> {row.piNumber || 'Trống'}
                                      </span>
                                    ) : (
                                      row.piNumber
                                    )}
                                  </td>

                                  <td className="px-sm py-xs text-secondary text-center">{row.subLineIndex}</td>

                                  <td className="px-sm py-xs text-body-md font-noto text-on-surface whitespace-nowrap max-w-[160px] truncate" title={row.customer}>
                                    <div className="flex items-center gap-1.5">
                                      <span className="truncate">{row.customer || <span className="text-rose-600 italic font-bold">Trống</span>}</span>
                                      {(() => {
                                        const key = String(row.customer ?? '').trim()
                                        const review = preview.customerReviews?.find((r) => String(r.name).trim() === key)
                                        if (review) {
                                          const choice = customerChoices[key]
                                          if (choice === 'NEW') {
                                            return (
                                              <span className="text-[10px] text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded border border-sky-200 shrink-0 font-medium">
                                                + Mới
                                              </span>
                                            )
                                          }
                                          if (choice?.startsWith('MERGE:')) {
                                            return (
                                              <span className="text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 shrink-0 font-medium" title={`Gộp vào ${review.suggestedName}`}>
                                                → Gộp
                                              </span>
                                            )
                                          }
                                          return (
                                            <span className="text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 shrink-0 font-medium animate-pulse" title="Cần chọn ở bảng đối chiếu trên">
                                              ? Chờ chọn
                                            </span>
                                          )
                                        }
                                        if ((preview.customerNew ?? []).some((n) => String(n).trim() === key)) {
                                          return (
                                            <span className="text-[10px] text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded border border-sky-200 shrink-0 font-medium">
                                              + Mới
                                            </span>
                                          )
                                        }
                                        return null
                                      })()}
                                    </div>
                                  </td>

                                  <td className="px-sm py-xs font-mono text-type-mono text-on-surface-variant whitespace-nowrap tabular-nums">{formatDate(row.orderDate)}</td>

                                  {/* Width (m) Cell - In-cell Highlighting */}
                                  <td className={`px-sm py-xs text-right font-mono text-type-mono tabular-nums ${isWidthError ? 'bg-rose-100/70' : 'text-on-surface'}`}>
                                    {isWidthError ? (
                                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-rose-200 text-rose-900 font-bold border border-rose-300 text-[11px]">
                                        ⚠ {row.widthM || '0'}
                                      </span>
                                    ) : (
                                      row.widthM
                                    )}
                                  </td>

                                  {/* Length (m) Cell - In-cell Highlighting */}
                                  <td className={`px-sm py-xs text-right font-mono text-type-mono tabular-nums ${isLengthError ? 'bg-rose-100/70' : 'text-on-surface'}`} suppressHydrationWarning>
                                    {isLengthError ? (
                                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-rose-200 text-rose-900 font-bold border border-rose-300 text-[11px]">
                                        ⚠ {row.lengthM ?? '0'}
                                      </span>
                                    ) : row.lengthM != null ? (
                                      row.lengthM.toLocaleString('vi-VN')
                                    ) : row.orderType === 'meters' ? (
                                      <span className="text-rose-500 italic">0</span>
                                    ) : (
                                      <span className="text-outline">—</span>
                                    )}
                                  </td>

                                  {/* GSM Cell - In-cell Highlighting */}
                                  <td className={`px-sm py-xs text-right font-mono text-type-mono tabular-nums ${isGsmError ? 'bg-rose-100/70' : 'text-on-surface'}`}>
                                    {isGsmError ? (
                                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-200 text-rose-900 border border-rose-300 font-bold text-[11px]" title="GSM phải lớn hơn 0">
                                        <span className="text-rose-700 font-bold">⚠</span> {row.gsm || '0'}
                                      </span>
                                    ) : (
                                      row.gsm
                                    )}
                                  </td>

                                  {/* Color Cell - In-cell Highlighting */}
                                  <td className={`px-sm py-xs text-body-md font-noto whitespace-nowrap ${isColorError ? 'bg-rose-100/70' : 'text-on-surface'}`}>
                                    {isColorError ? (
                                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-200 text-rose-900 border border-rose-300 font-bold text-[11px]" title={rowErrors.find((e) => /Màu|Desert Sand/i.test(e)) || 'Lỗi màu'}>
                                        <span className="text-rose-700 font-bold">⚠</span>
                                        <span>{row.color || 'Thiếu Màu'}</span>
                                        {row.color?.toUpperCase().includes('DESERT SAND') && !row.colorVersion && (
                                          <span className="text-[10px] text-rose-800 font-bold bg-rose-300/60 px-1 py-0.2 rounded">(Cần Ver A/B)</span>
                                        )}
                                      </span>
                                    ) : (
                                      row.color
                                    )}
                                  </td>

                                  <td className="px-sm py-xs text-center">
                                    {row.frFlag
                                      ? <span className="text-[#92400E] font-inter font-semibold text-label-sm">FR</span>
                                      : <span className="text-outline">—</span>}
                                  </td>

                                  <td className="px-sm py-xs font-mono text-type-mono text-on-surface-variant tabular-nums">
                                    {row.uvPct != null ? `${Number(row.uvPct).toFixed(1)}%` : '—'}
                                  </td>

                                  {/* Thông tin bổ sung Cell - In-cell Highlighting */}
                                  <td className={`px-sm py-xs max-w-[320px] align-middle ${isPackingError || isLaminateError ? 'bg-rose-100/70' : 'text-secondary'}`} title={formatAdditionalFields(row)}>
                                    <div className="flex flex-col gap-1">
                                      {isPackingError && (
                                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-200 border border-rose-300 text-rose-900 font-bold text-[10px] w-fit">
                                          <span>⚠ Lỗi quy cách đóng gói</span>
                                        </span>
                                      )}
                                      {isLaminateError && (
                                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-200 border border-rose-300 text-rose-900 font-bold text-[10px] w-fit">
                                          <span>⚠ Thiếu GSM tráng màng/mộc</span>
                                        </span>
                                      )}
                                      <span className="truncate whitespace-nowrap text-secondary text-[11px]">
                                        {formatAdditionalFields(row)}
                                      </span>
                                    </div>
                                  </td>
                                </tr>

                                {/* Inline Actionable Drawer - Hướng dẫn sửa file Excel */}
                                {expandedRowIdx === idx && (
                                  <tr className="bg-rose-50/95 border-b-2 border-rose-300">
                                    <td colSpan={13} className="p-3">
                                      <div className="bg-white rounded-lg border border-rose-200 shadow-sm p-3.5 space-y-3">
                                        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                                          <div className="flex items-center gap-2">
                                            <span className="material-symbols-outlined text-[20px] text-rose-600 font-bold">handyman</span>
                                            <div>
                                              <span className="font-bold text-rose-950 text-xs uppercase tracking-wide">
                                                Hướng dẫn sửa file Excel cho Dòng #{idx + 1}
                                              </span>
                                              <span className="text-[11px] text-slate-500 ml-2">
                                                (PI: <code className="font-mono font-bold text-slate-700">{row.piNumber || 'Chưa có'}</code>, Khách: <strong className="text-slate-800">{row.customer || 'Chưa có'}</strong>)
                                              </span>
                                            </div>
                                          </div>
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation()
                                              setExpandedRowIdx(null)
                                            }}
                                            className="text-slate-400 hover:text-slate-700 text-xs px-2.5 py-1 rounded-md hover:bg-slate-100 border border-slate-200 font-medium flex items-center gap-1 cursor-pointer"
                                          >
                                            <span>✕</span> Đóng
                                          </button>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                                          {rowErrors.map((err, errIdx) => {
                                            const info = getErrorFixInfo(err)
                                            return (
                                              <div key={errIdx} className="flex items-start gap-2.5 p-2.5 rounded-lg bg-rose-50/60 border border-rose-200">
                                                <div className="px-2 py-0.5 rounded bg-rose-200 text-rose-900 font-mono text-[10px] font-bold shrink-0 mt-0.5 uppercase tracking-wide">
                                                  Cột {info.column}
                                                </div>
                                                <div className="space-y-1 text-xs">
                                                  <p className="font-semibold text-rose-950 text-[11px] flex items-center gap-1">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                                                    {err}
                                                  </p>
                                                  <p className="text-[11px] text-slate-700 leading-relaxed">
                                                    👉 <strong>Cách xử lý:</strong> {info.guide}
                                                  </p>
                                                </div>
                                              </div>
                                            )
                                          })}
                                        </div>

                                        <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-[11px] text-slate-500">
                                          <span>💡 Sau khi cập nhật file Excel theo các hướng dẫn trên, đóng modal và tải lại file để hệ thống xác nhận.</span>
                                        </div>
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            )
                          })
                        })()}
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
                      Đã import thành công <span className="text-[#15803d] font-bold">{result.imported}/{result.summary.total}</span> dòng đơn hàng hợp lệ.
                    </p>
                    {result.summary.invalid > 0 && (
                      <p className="text-xs text-rose-600 font-medium">
                        ⚠ {result.summary.invalid} dòng bị bỏ qua do thiếu trường bắt buộc (Màu, GSM, Kích thước...)
                      </p>
                    )}
                    {result.skipped > 0 && (
                      <p className="text-xs text-slate-500">
                        · {result.summary.identical} dòng giống hệt được giữ nguyên; {result.summary.conflicted} dòng xung đột cần sửa ở chi tiết.
                      </p>
                    )}
                    {/* B6: skipped rows stay visible with reasons after confirm */}
                    {result.decisions && result.decisions.some((d) => d.status !== 'new') && (
                      <details className="text-left text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-3 max-h-48 overflow-y-auto w-full max-w-xl">
                        <summary className="cursor-pointer font-semibold">
                          Xem {result.decisions.filter((d) => d.status !== 'new').length} dòng đã bỏ qua và lý do
                        </summary>
                        <ul className="mt-2 space-y-1">
                          {result.decisions.filter((d) => d.status !== 'new').map((d) => (
                            <li key={d.rowIndex}>
                              Dòng {d.rowIndex + 1} ({d.piNumber} / NO {d.subLineIndex}): {d.status === 'identical' ? '↺ Trùng hệt — bỏ qua' : `⚠ ${d.resolution ? RESOLUTION_HINT[d.resolution] ?? d.reasons.join('; ') : d.reasons.join('; ')}`}
                            </li>
                          ))}
                        </ul>
                      </details>
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
                        disabled={!preview || preview.rows.length === 0 || decisionCounts.new === 0 || pendingCustomerCount > 0}
                        title={pendingCustomerCount > 0 ? `Còn ${pendingCustomerCount} khách hàng cần xử lý trước khi ghi` : undefined}
                        className="inline-flex items-center justify-center gap-sm bg-primary text-on-primary text-sm font-medium px-4 py-2 h-9 rounded-md hover:bg-primary/90 disabled:opacity-50 transition-colors"
                      >
                        <span className="material-symbols-outlined text-[18px]">check</span>
                        {decisionCounts.new === 0 ? 'Không có dòng mới để ghi' : `Xác Nhận Import (${decisionCounts.new} dòng mới)`}
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
