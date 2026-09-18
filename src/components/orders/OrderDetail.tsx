'use client'

// src/components/orders/OrderDetail.tsx
// R1 light theme — all state/form/API logic unchanged from S3.
// Only classNames updated: light surface, primary/error buttons, outline-variant dividers.

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  updateOrderSchema,
  type UpdateOrderInput,
  type UpdateOrderOutput,
} from '@/lib/validations/order'
import type { SerializedProductionOrder } from '@/types'
import AssignFromOrderModal from '@/components/schedule/AssignFromOrderModal'
import { calculateOrderWeight } from '@/lib/calculations/orderWeight'
import { calcOrderStatus } from '@/lib/orderStatus'
import OrderStatusBadge from './OrderStatusBadge'
import DraftBadge from './DraftBadge'

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
}

function formatDateTime(iso: string): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function toDateInputValue(iso: string): string { return iso ? iso.slice(0, 10) : '' }

// ── Sub-components ────────────────────────────────────────────────────────────

interface FieldProps {
  label: string; required?: boolean; error?: string; children: React.ReactNode; hint?: string
}
function FormField({ label, required, error, children, hint }: FieldProps) {
  return (
    <div className="flex flex-col gap-xs">
      <label className="text-label-sm font-inter font-medium text-on-surface-variant focus-within:text-primary transition-colors">
        {label}{required && <span className="text-error ml-1">*</span>}
      </label>
      {children}
      {hint && !error && <p className="text-label-sm font-inter text-outline">{hint}</p>}
      {error && (
        <p className="text-label-sm font-inter text-error flex items-center gap-xs" role="alert">
          <span className="material-symbols-outlined text-[14px]">error</span>{error}
        </p>
      )}
    </div>
  )
}

interface ViewFieldProps { label: string; value: React.ReactNode; mono?: boolean }
function ViewField({ label, value, mono }: ViewFieldProps) {
  return (
    <div className="flex flex-col gap-xs">
      <dt className="text-label-sm font-inter font-medium text-secondary uppercase tracking-wider">{label}</dt>
      <dd className={mono ? 'text-type-mono font-mono text-on-surface' : 'text-body-md font-noto text-on-surface'}>
        {value ?? <span className="text-outline italic">—</span>}
      </dd>
    </div>
  )
}

const inputCls = (isNumeric: boolean, hasError: boolean) =>
  [
    'w-full bg-transparent border-[0.5px] rounded px-md py-[10px]',
    'text-on-surface placeholder:text-outline',
    'focus:outline-none focus:border-primary focus:border-b-2 transition-colors',
    isNumeric ? 'font-mono text-type-mono tabular-nums' : 'font-noto text-body-md',
    hasError ? 'border-error' : 'border-outline-variant',
  ].join(' ')

// ── Main component ────────────────────────────────────────────────────────────

interface OrderDetailProps { order: SerializedProductionOrder }

export default function OrderDetail({ order: initialOrder }: OrderDetailProps) {
  const router = useRouter()
  const [mode, setMode] = useState<'view' | 'edit'>('view')
  const [currentOrder, setCurrentOrder] = useState<SerializedProductionOrder>(initialOrder)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleteStatus, setDeleteStatus] = useState<'idle' | 'deleting' | 'error'>('idle')
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [showAssignModal, setShowAssignModal] = useState(false)

  // Draft approval state (Sprint F1)
  const [isApproving, setIsApproving] = useState(false)
  const [approveError, setApproveError] = useState<{ message: string; missingFields?: string[] } | null>(null)

  const handleApproveDraft = async () => {
    setIsApproving(true)
    setApproveError(null)

    try {
      const res = await fetch(`/api/orders/${currentOrder.id}/approve`, {
        method: 'POST',
      })
      const json = await res.json()

      if (!res.ok || !json.success) {
        setApproveError({
          message: json.error ?? 'Chưa thể duyệt đơn nháp do thiếu thông tin.',
          missingFields: json.missingFields ?? [],
        })
        return
      }

      setCurrentOrder((prev) => ({ ...prev, isDraft: false }))
      router.refresh()
    } catch {
      setApproveError({ message: 'Lỗi kết nối mạng khi duyệt đơn nháp.' })
    } finally {
      setIsApproving(false)
    }
  }

  // Danh sách máy đang chạy đơn hàng này
  type MachineRow = { id: string; machineId: string; startDate: string; endDate: string; allocatedMeters: string | null }
  const [machineRows, setMachineRows] = useState<MachineRow[]>([])

  const fetchMachineRows = useCallback(async () => {
    try {
      const res = await fetch(`/api/assignments?orderId=${currentOrder.id}`)
      if (res.ok) {
        const data = await res.json()
        setMachineRows(data)
      }
    } catch { /* silent */ }
  }, [currentOrder.id])

  // Sản lượng đã xuất / còn lại từ KnittingDailyOutput
  interface ProgressData {
    producedMeters: number
    remainingMeters: number
    avgDailyOutput: number | null
    remainingDays: number | null
    hasData: boolean
  }
  const [progress, setProgress] = useState<ProgressData | null>(null)

  const fetchProgress = useCallback(async () => {
    try {
      const res = await fetch(`/api/knitting/progress/${currentOrder.id}`)
      if (res.ok) {
        const data = await res.json() as ProgressData & { success: boolean }
        if (data.success) setProgress(data)
      }
    } catch { /* silent */ }
  }, [currentOrder.id])

  useEffect(() => { fetchMachineRows() }, [fetchMachineRows])
  useEffect(() => { fetchProgress() }, [fetchProgress])

  const { register, handleSubmit, reset, watch, formState: { errors, isSubmitting } } =
    useForm<UpdateOrderInput, unknown, UpdateOrderOutput>({
      resolver: zodResolver(updateOrderSchema),
    })

  // Kiểu đơn hàng — watch để điều kiện render trong edit mode
  const editOrderType    = watch('orderType')
  const editQty          = watch('qty')
  const editRollLength   = watch('rollLength')
  const editPieceLength  = watch('pieceLength')
  const editHasEyelet    = watch('hasEyelet')
  const editWidthM       = watch('widthM')
  const editLengthM      = watch('lengthM')
  const editGsm          = watch('gsm')

  const editEstimatedTotal = (() => {
    if (editOrderType === 'rolls' && editQty && editRollLength) {
      return (Number(editQty) * Number(editRollLength)).toLocaleString()
    }
    if (editOrderType === 'pieces' && editQty && editPieceLength) {
      return (Number(editQty) * Number(editPieceLength)).toLocaleString()
    }
    return null
  })()

  // Trọng lượng ước tính trong edit mode (live)
  const editEstimatedWeight = (() => {
    const w = Number(editWidthM)
    const l = Number(editLengthM)
    const g = Number(editGsm)
    if (!w || !g) return null
    const { totalWeightKgs } = calculateOrderWeight({
      orderType: editOrderType ?? 'meters',
      widthM: w,
      lengthM: l,
      gsm: g,
      qty: editQty ? Number(editQty) : null,
      rollLength: editRollLength ? Number(editRollLength) : null,
      pieceLength: editPieceLength ? Number(editPieceLength) : null,
    })
    return (totalWeightKgs != null && totalWeightKgs > 0) ? totalWeightKgs.toLocaleString('vi-VN', { maximumFractionDigits: 1 }) : null
  })()

  const enterEdit = () => {
    setSaveError(null)
    reset({
      piNumber: currentOrder.piNumber, subLineIndex: currentOrder.subLineIndex,
      customer: currentOrder.customer, orderDate: toDateInputValue(currentOrder.orderDate),
      widthM: currentOrder.widthM ?? undefined, lengthM: currentOrder.lengthM ?? undefined, gsm: currentOrder.gsm ?? undefined,
      productionGsm: currentOrder.productionGsm ?? undefined,
      color: currentOrder.color ?? undefined, qty: currentOrder.qty ?? undefined,
      mbCode: currentOrder.mbCode ?? undefined,
      uvPct: currentOrder.uvPct != null ? parseFloat(currentOrder.uvPct) : null,
      frFlag: currentOrder.frFlag,
      frPct: currentOrder.frPct != null ? parseFloat(currentOrder.frPct) : null,
      requiresPacking: currentOrder.requiresPacking,
      lineNote: currentOrder.lineNote ?? '',
      deliveryDate: currentOrder.deliveryDate ? toDateInputValue(currentOrder.deliveryDate) : undefined,
      containerSize: currentOrder.containerSize ?? '',
      description: currentOrder.description ?? '', remark: currentOrder.remark ?? '',
      meshType: currentOrder.meshType ?? '',
      needleCount: currentOrder.needleCount ?? undefined,
      beamCount: currentOrder.beamCount ?? undefined,
      // Kiểu đơn hàng
      orderType: (currentOrder.orderType as 'meters' | 'rolls' | 'pieces') ?? 'meters',
      rollLength: currentOrder.rollLength != null ? parseFloat(currentOrder.rollLength) : null,
      pieceLength: currentOrder.pieceLength != null ? parseFloat(currentOrder.pieceLength) : null,
      // Eyelet
      hasEyelet: currentOrder.hasEyelet,
      eyeletColor: currentOrder.eyeletColor ?? undefined,
      eyeletLines: (currentOrder as { eyeletLines?: number | null }).eyeletLines ?? undefined,
      eyeletSpec:  (currentOrder as { eyeletSpec?: string | null }).eyeletSpec  ?? undefined,
    })
    setMode('edit')
  }

  const cancelEdit = () => { setSaveError(null); setMode('view') }

  const onSave = async (values: UpdateOrderOutput) => {
    setSaveError(null)
    try {
      const res = await fetch(`/api/orders/${currentOrder.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })
      const json = await res.json()
      if (!res.ok || !json.success) { setSaveError(json.error ?? 'An unknown error occurred.'); return }
      setCurrentOrder(json.order as SerializedProductionOrder)
      setMode('view')
    } catch { setSaveError('Network error — could not reach the server.') }
  }

  const handleDelete = async () => {
    setDeleteStatus('deleting'); setDeleteError(null)
    try {
      const res = await fetch(`/api/orders/${currentOrder.id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok || !json.success) {
        setDeleteError(json.error ?? 'Could not delete order.'); setDeleteStatus('error'); return
      }
      router.push('/orders')
    } catch { setDeleteError('Network error — could not reach the server.'); setDeleteStatus('error') }
  }

  // ── VIEW mode ──────────────────────────────────────────────────────────────

  // ── VIEW mode ──────────────────────────────────────────────────────────────

  if (mode === 'view') {
    return (
      <div className="space-y-lg">

        {/* Draft Banner */}
        {currentOrder.isDraft && (
          <div className="p-4 bg-[#FFF8E7] border border-[#F59E0B] rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm">
            <div className="flex items-start gap-2.5 text-xs text-[#92400E]">
              <span className="material-symbols-outlined text-[22px] text-[#D97706] shrink-0 mt-0.5">edit_note</span>
              <div>
                <p className="font-bold text-sm text-[#B45309]">ĐƠN NHÁP — Thông tin đơn hàng chưa đầy đủ</p>
                <p className="mt-0.5 text-secondary">Đơn nháp chưa thể gán vào Lịch sản xuất. Kiểm tra, bổ sung đủ thông số và bấm "Duyệt đơn nháp".</p>
              </div>
            </div>
            <button
              id="btn-approve-draft"
              onClick={handleApproveDraft}
              disabled={isApproving}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#D97706] hover:bg-[#B45309] text-white text-xs font-semibold shrink-0 shadow transition-colors disabled:opacity-50 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">check_circle</span>
              {isApproving ? 'Đang duyệt...' : 'Duyệt đơn nháp →'}
            </button>
          </div>
        )}

        {/* Approve Error Banner */}
        {approveError && (
          <div role="alert" className="p-4 bg-error-container border border-error/40 rounded-xl text-error text-xs space-y-2">
            <div className="flex items-center gap-2 font-semibold">
              <span className="material-symbols-outlined text-[18px]">error</span>
              <span>{approveError.message}</span>
            </div>
            {approveError.missingFields && approveError.missingFields.length > 0 && (
              <div className="pl-6 space-y-1">
                <p className="font-medium">Vui lòng bổ sung các thông tin sau trước khi duyệt:</p>
                <ul className="list-disc pl-4 space-y-0.5">
                  {approveError.missingFields.map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center justify-end gap-sm">
          {currentOrder.isDraft && (
            <button
              id="btn-approve-draft-header"
              onClick={handleApproveDraft}
              disabled={isApproving}
              className="inline-flex items-center justify-center gap-sm bg-[#D97706] hover:bg-[#B45309] text-white text-sm font-medium px-4 py-2 h-9 rounded-md transition-colors disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[18px]">check_circle</span>
              {isApproving ? 'Đang duyệt...' : 'Duyệt đơn nháp →'}
            </button>
          )}
          <button
            id="btn-delete-order"
            onClick={() => { setShowDeleteDialog(true); setDeleteError(null); setDeleteStatus('idle') }}
            className="inline-flex items-center justify-center gap-sm border border-[#ba1a1a] text-[#ba1a1a] hover:bg-[#ba1a1a]/10 bg-transparent text-sm font-medium px-4 py-2 h-9 rounded-md transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">delete</span>Delete
          </button>
          <button
            id="btn-edit-order"
            onClick={enterEdit}
            className="inline-flex items-center justify-center gap-sm border border-primary bg-transparent hover:bg-surface-container text-primary text-sm font-medium px-4 py-2 h-9 rounded-md transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">edit</span>Edit
          </button>
          <button
            id="btn-assign-machine"
            onClick={() => setShowAssignModal(true)}
            className="inline-flex items-center justify-center gap-sm border border-primary bg-transparent hover:bg-surface-container text-primary text-sm font-medium px-4 py-2 h-9 rounded-md transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">precision_manufacturing</span>
            Assign to machine
          </button>
        </div>

        {/* Máy đang chạy */}
        {machineRows.length > 0 && (
          <div className="border border-outline-variant rounded-xl p-md bg-surface-container-low">
            <p className="text-label-sm font-inter font-semibold text-secondary uppercase tracking-widest mb-sm">
              Máy đang chạy
            </p>
            <ul className="space-y-xs">
              {machineRows.map(row => (
                <li key={row.id} className="flex items-center gap-sm text-body-md font-mono text-on-surface">
                  <span className="material-symbols-outlined text-[16px] text-secondary">precision_manufacturing</span>
                  <span className="font-semibold">{row.machineId}</span>
                  {row.allocatedMeters && (
                    <span className="text-secondary">— {Number(row.allocatedMeters).toLocaleString()}m</span>
                  )}
                  <span className="text-outline ml-auto text-label-sm">
                    {new Date(row.startDate).toLocaleDateString('en-GB', { day:'2-digit', month:'2-digit' })}
                    {' → '}
                    {new Date(row.endDate).toLocaleDateString('en-GB', { day:'2-digit', month:'2-digit' })}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Tiến độ sản xuất — Bị ẨN nếu là đơn nháp (isDraft === true) */}
        {!currentOrder.isDraft && machineRows.length > 0 && progress && (
          <div className="border border-outline-variant rounded-xl p-md bg-surface-container-low">
            <p className="text-label-sm font-inter font-semibold text-secondary uppercase tracking-widest mb-sm">
              Tiến độ sản xuất
            </p>
            {!progress.hasData ? (
              <p className="text-body-sm font-inter text-outline">
                Chưa có dữ liệu sản lượng — upload Knitting Report để xem tiến độ.
              </p>
            ) : (
              <dl className="grid grid-cols-2 sm:grid-cols-4 gap-y-md gap-x-xl">
                <div className="flex flex-col gap-xs">
                  <dt className="text-label-sm font-inter font-medium text-secondary uppercase tracking-wider">
                    Đã sản xuất
                  </dt>
                  <dd className="text-body-md font-mono font-semibold text-primary">
                    {progress.producedMeters.toLocaleString('vi-VN', { maximumFractionDigits: 0 })} m
                  </dd>
                </div>
                <div className="flex flex-col gap-xs">
                  <dt className="text-label-sm font-inter font-medium text-secondary uppercase tracking-wider">
                    Còn lại
                  </dt>
                  <dd className={`text-body-md font-mono font-semibold ${
                    progress.remainingMeters === 0 ? 'text-[#15803d]' : 'text-on-surface'
                  }`}>
                    {progress.remainingMeters === 0
                      ? '✔ Hoàn thành'
                      : `${progress.remainingMeters.toLocaleString('vi-VN', { maximumFractionDigits: 0 })} m`
                    }
                  </dd>
                </div>
                <div className="flex flex-col gap-xs">
                  <dt className="text-label-sm font-inter font-medium text-secondary uppercase tracking-wider">
                    TB 7 ngày
                  </dt>
                  <dd className="text-body-md font-mono text-on-surface">
                    {progress.avgDailyOutput != null
                      ? `${progress.avgDailyOutput.toLocaleString('vi-VN')} m/ngày`
                      : <span className="text-outline">—</span>
                    }
                  </dd>
                </div>
                <div className="flex flex-col gap-xs">
                  <dt className="text-label-sm font-inter font-medium text-secondary uppercase tracking-wider">
                    Ngày dự kiến xong
                  </dt>
                  <dd className="text-body-md font-mono text-on-surface">
                    {progress.remainingDays != null
                      ? (
                        <span className={progress.remainingDays <= 3 ? 'text-error font-semibold' : ''}>
                          ~{progress.remainingDays} ngày nữa
                        </span>
                      )
                      : <span className="text-outline">—</span>
                    }
                  </dd>
                </div>
              </dl>
            )}
          </div>
        )}

        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-y-lg gap-x-xl">
          <div className="flex flex-col gap-xs">
            <dt className="text-label-sm font-inter font-medium text-secondary uppercase tracking-wider">PI Number</dt>
            <dd className="flex items-center gap-2 text-type-mono font-mono text-on-surface">
              <span>{currentOrder.piNumber}</span>
              {currentOrder.isDraft && <DraftBadge />}
              <OrderStatusBadge status={calcOrderStatus(currentOrder.assignments)} />
            </dd>
          </div>
          <ViewField label="Sub-line"     value={currentOrder.subLineIndex}                     />
          <ViewField label="Customer"     value={currentOrder.customer}                         />
          <ViewField label="Order Date"   value={formatDate(currentOrder.orderDate)}            />
          {currentOrder.deliveryDate && (
            <ViewField label="Ngày giao hàng" value={formatDate(currentOrder.deliveryDate)} />
          )}
          {currentOrder.containerSize && (
            <ViewField label="Container size" value={currentOrder.containerSize} />
          )}
          <ViewField label="Width (m)"    value={currentOrder.widthM != null ? Number(currentOrder.widthM).toFixed(1) : null} mono />
          <ViewField label="Length (m)"   value={currentOrder.lengthM != null ? Number(currentOrder.lengthM).toLocaleString() : null} mono />
          <ViewField label="GSM (đơn hàng)" value={currentOrder.gsm ?? null} mono />
          <ViewField
            label="GSM sản xuất thực tế"
            value={
              currentOrder.productionGsm != null
                ? `${currentOrder.productionGsm} gsm`
                : '— (giống GSM đơn)'
            }
            mono
          />
          <ViewField label="Color"        value={currentOrder.color ?? null}                    />
          {currentOrder.totalWeightKgs != null && (
            <ViewField
              label="Trọng lượng PO (kg)"
              value={parseFloat(currentOrder.totalWeightKgs).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}
              mono
            />
          )}
          <ViewField
            label="Nhu cầu sợi (kg)"
            value={
              !currentOrder.isDraft && currentOrder.requiredYarnKg != null
                ? `${parseFloat(currentOrder.requiredYarnKg).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}${
                    currentOrder.productionGsm != null ? ` (theo ${currentOrder.productionGsm}gsm)` : ''
                  }`
                : null
            }
            mono
          />
          {currentOrder.qtySqm != null && (
            <ViewField
              label="Diện tích (m²)"
              value={parseFloat(currentOrder.qtySqm).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}
              mono
            />
          )}
          <ViewField label="Mã màu (MB Code)" value={currentOrder.mbCode ?? null}               mono />
          <ViewField label="Kiểu đơn" value={
            currentOrder.orderType === 'rolls'  ? 'Theo cuộn' :
            currentOrder.orderType === 'pieces' ? 'Gia công tấm' :
            'Theo tổng mét'
          } />
          {currentOrder.rollLength != null && (
            <ViewField label="Mét/cuộn" value={`${parseFloat(currentOrder.rollLength).toLocaleString()} m/cuộn`} mono />
          )}
          {currentOrder.pieceLength != null && (
            <ViewField label="Chiều dài tấm" value={`${parseFloat(currentOrder.pieceLength)} m`} mono />
          )}
          <ViewField label="Eyelet" value={
            (() => {
              const el = (currentOrder as { eyeletLines?: number | null }).eyeletLines
              const es = (currentOrder as { eyeletSpec?: string | null }).eyeletSpec
              if (el != null) {
                return (
                  <span className="text-on-surface font-medium font-inter text-label-md">
                    {el} lines{es ? ` — ${es}` : ''}
                  </span>
                )
              }
              return currentOrder.hasEyelet
                ? <span className="text-on-surface font-medium font-inter text-label-md">Có</span>
                : <span className="text-outline font-inter text-label-md">Không</span>
            })()
          } />
          {currentOrder.hasEyelet && currentOrder.eyeletColor && (
            <ViewField label="Màu eyelet" value={currentOrder.eyeletColor} />
          )}
        </dl>

        {/* Optional fields */}
        {(currentOrder.qty != null || currentOrder.uvPct != null || currentOrder.frFlag || currentOrder.frPct != null ||
          currentOrder.requiresPacking || currentOrder.lineNote ||
          currentOrder.description || currentOrder.remark ||
          currentOrder.meshType || currentOrder.needleCount != null || currentOrder.beamCount != null) && (
          <div className="border-t-[0.5px] border-outline-variant pt-lg">
            <p className="text-label-sm font-inter font-medium text-secondary uppercase tracking-widest mb-md">
              Optional details
            </p>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-y-lg gap-x-xl">
              {currentOrder.qty != null && <ViewField label="Quantity (rolls)" value={currentOrder.qty} mono />}
              {currentOrder.uvPct != null && (
                <ViewField label="UV %" value={`${parseFloat(currentOrder.uvPct).toFixed(2)}%`} mono />
              )}
              <ViewField label="FR %" value={
                currentOrder.frPct != null
                  ? <span className="font-mono text-on-surface font-semibold">{currentOrder.frPct} %</span>
                  : currentOrder.frFlag
                    ? <span className="text-[#92400e] font-medium font-inter text-label-md">Có (legacy)</span>
                    : <span className="text-outline font-inter text-label-md">—</span>
              } />
              {currentOrder.requiresPacking && (
                <ViewField label="Đóng gói" value={
                  <span className="text-primary font-medium font-inter text-label-md">Có</span>
                } />
              )}
              {currentOrder.lineNote && (
                <div className="sm:col-span-2"><ViewField label="Ghi chú dòng" value={currentOrder.lineNote} /></div>
              )}
              {currentOrder.description && (
                <div className="sm:col-span-2"><ViewField label="Description" value={currentOrder.description} /></div>
              )}
              {currentOrder.remark && (
                <div className="sm:col-span-2"><ViewField label="Remark" value={currentOrder.remark} /></div>
              )}
            </dl>

            {/* Thông số kỹ thuật */}
            {(currentOrder.meshType || currentOrder.needleCount != null || currentOrder.beamCount != null) && (
              <>
                <p className="text-label-sm font-inter font-semibold text-primary uppercase tracking-widest mt-lg mb-md">
                  Thông số kỹ thuật
                </p>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-y-lg gap-x-xl">
                  {currentOrder.meshType && (
                    <div className="sm:col-span-2"><ViewField label="Thể loại lưới" value={currentOrder.meshType} /></div>
                  )}
                  {currentOrder.needleCount != null && <ViewField label="Số kim" value={currentOrder.needleCount} mono />}
                  {currentOrder.beamCount  != null && <ViewField label="Số dàn"  value={currentOrder.beamCount}  mono />}
                  {(currentOrder as { eyeletLines?: number | null }).eyeletLines != null && (
                    <ViewField label="Số lines eyelet"
                      value={(currentOrder as { eyeletLines?: number | null }).eyeletLines}
                      mono
                    />
                  )}
                  {(currentOrder as { eyeletSpec?: string | null }).eyeletSpec && (
                    <ViewField label="Mô tả eyelet"
                      value={(currentOrder as { eyeletSpec?: string | null }).eyeletSpec}
                    />
                  )}
                </dl>
              </>
            )}
          </div>
        )}

        {/* System fields */}
        <div className="border-t-[0.5px] border-outline-variant pt-lg">
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-y-lg gap-x-xl">
            <ViewField label="Status" value={
              <span className="inline-flex items-center px-sm py-xs rounded text-label-sm font-inter font-medium bg-surface-container text-on-surface-variant">
                {currentOrder.status}
              </span>
            } />
            <ViewField label="Nguồn dữ liệu" value={
              currentOrder.dataSource === 'import' ? 'Excel/bulk import' :
              currentOrder.dataSource === 'seed'   ? 'Demo data' :
              'Nhập tay'
            } />
            <ViewField label="Created"      value={formatDateTime(currentOrder.createdAt)}        />
            <ViewField label="Last Updated" value={formatDateTime(currentOrder.updatedAt)}        />
          </dl>
        </div>

        {/* Delete dialog */}
        {showDeleteDialog && (
          <div role="dialog" aria-modal="true" aria-labelledby="dialog-title"
            className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              onClick={() => { if (deleteStatus !== 'deleting') setShowDeleteDialog(false) }} />
            <div className="relative bg-surface-container-lowest border-[0.5px] border-outline-variant rounded-xl p-lg max-w-md w-full shadow-2xl">
              <div className="flex items-start gap-md mb-lg">
                <div className="w-10 h-10 rounded-full bg-error-container flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[20px] text-error">warning</span>
                </div>
                <div>
                  <h2 id="dialog-title" className="text-headline-md font-inter font-semibold text-on-surface">
                    Delete this order?
                  </h2>
                  <p className="text-body-md font-noto text-secondary mt-xs">
                    Are you sure you want to delete{' '}
                    <span className="font-mono text-on-surface">{currentOrder.piNumber}</span>
                    {currentOrder.subLineIndex > 0 && ` (line ${currentOrder.subLineIndex})`}?
                    This cannot be undone.
                  </p>
                </div>
              </div>

              {deleteStatus === 'error' && deleteError && (
                <p className="text-label-sm font-inter text-error mb-md bg-error-container border-[0.5px] border-error/30 rounded px-md py-sm">
                  {deleteError}
                </p>
              )}

              <div className="flex justify-end gap-sm">
                <button
                  id="btn-cancel-delete"
                  onClick={() => setShowDeleteDialog(false)}
                  disabled={deleteStatus === 'deleting'}
                  className="inline-flex items-center justify-center gap-sm border border-primary bg-transparent hover:bg-surface-container text-primary text-sm font-medium px-4 py-2 h-9 rounded-md transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  id="btn-confirm-delete"
                  onClick={handleDelete}
                  disabled={deleteStatus === 'deleting'}
                  className="inline-flex items-center justify-center gap-sm border border-[#ba1a1a] text-[#ba1a1a] hover:bg-[#ba1a1a]/10 bg-transparent text-sm font-medium px-4 py-2 h-9 rounded-md transition-colors disabled:opacity-60"
                >
                  {deleteStatus === 'deleting' ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                      </svg>
                      Deleting…
                    </>
                  ) : 'Confirm Delete'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Assign to machine modal */}
        {showAssignModal && (
          <AssignFromOrderModal
            order={currentOrder}
            onAssigned={fetchMachineRows}
            onClose={() => setShowAssignModal(false)}
          />
        )}
      </div>
    )
  }

  // ── EDIT mode ─────────────────────────────────────────────────────────────

  return (
    <form onSubmit={handleSubmit(onSave)} noValidate className="space-y-lg">
      {saveError && (
        <div role="alert" className="flex items-start gap-sm border border-error/40 bg-error-container rounded-lg px-md py-sm">
          <span className="material-symbols-outlined text-[20px] text-error shrink-0 mt-0.5">error</span>
          <div>
            <p className="text-label-md font-inter font-semibold text-error">Could not save changes</p>
            <p className="text-label-sm font-inter text-on-error-container mt-0.5">{saveError}</p>
          </div>
        </div>
      )}

      {/* Required fields */}
      <section>
        <h2 className="flex items-center gap-sm text-label-sm font-inter font-semibold text-primary uppercase tracking-widest mb-md">
          <span className="material-symbols-outlined text-[16px]">asterisk</span>Required fields
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-[24px] gap-y-lg">
          <FormField label="PI Number"   required error={errors.piNumber?.message}>
            <input id="edit-piNumber" type="text" className={inputCls(false, !!errors.piNumber)} {...register('piNumber')} />
          </FormField>
          <FormField label="Sub-line"    required error={errors.subLineIndex?.message} hint="0 = first line">
            <input id="edit-subLineIndex" type="number" min={0} step={1} className={inputCls(true, !!errors.subLineIndex)} {...register('subLineIndex', { valueAsNumber: true })} />
          </FormField>
          <FormField label="Customer"    required error={errors.customer?.message}>
            <input id="edit-customer" type="text" className={inputCls(false, !!errors.customer)} {...register('customer')} />
          </FormField>
          <FormField label="Order Date"  required error={errors.orderDate?.message}>
            <input id="edit-orderDate" type="date" className={inputCls(false, !!errors.orderDate)} {...register('orderDate')} />
          </FormField>
          <FormField label="Ngày giao hàng" error={errors.deliveryDate?.message}>
            <input id="edit-deliveryDate" type="date" className={inputCls(false, !!errors.deliveryDate)} {...register('deliveryDate')} />
          </FormField>
          <FormField label="Container size" error={errors.containerSize?.message}>
            <input id="edit-containerSize" type="text" className={inputCls(false, !!errors.containerSize)} {...register('containerSize')} />
          </FormField>
          <FormField label="Width (m)"   required error={errors.widthM?.message}>
            <input id="edit-widthM" type="number" min={0.1} max={20} step={0.1} className={inputCls(true, !!errors.widthM)} {...register('widthM', { valueAsNumber: true })} />
          </FormField>
          <FormField label="Length (m)"  required={editOrderType === 'meters'} error={errors.lengthM?.message}>
            <input id="edit-lengthM" type="number" min={1} max={100000} step={1} className={inputCls(true, !!errors.lengthM)} {...register('lengthM', { valueAsNumber: true })} />
          </FormField>
          <FormField label="Kiểu đơn" error={errors.orderType?.message}>
            <select id="edit-orderType" className={inputCls(false, false)} {...register('orderType')}>
              <option value="meters">Theo tổng mét</option>
              <option value="rolls">Theo cuộn (qty × mét/cuộn)</option>
              <option value="pieces">Gia công tấm (qty × chiều dài tấm)</option>
            </select>
          </FormField>
          {editOrderType === 'rolls' && (
            <FormField label="Mét/cuộn" error={errors.rollLength?.message} hint="Số mét mỗi cuộn">
              <input id="edit-rollLength" type="number" min={0.1} step={0.01} className={inputCls(true, !!errors.rollLength)}
                {...register('rollLength', { valueAsNumber: true })} />
            </FormField>
          )}
          {editOrderType === 'pieces' && (
            <FormField label="Chiều dài tấm (m)" error={errors.pieceLength?.message}>
              <input id="edit-pieceLength" type="number" min={0.01} step={0.01} className={inputCls(true, !!errors.pieceLength)}
                {...register('pieceLength', { valueAsNumber: true })} />
            </FormField>
          )}
          {(editOrderType === 'rolls' || editOrderType === 'pieces') && editEstimatedTotal && (
            <FormField label="Tổng mét ước tính">
              <div className="w-full bg-surface-container-low border-[0.5px] border-outline-variant rounded px-md py-[10px] font-mono text-type-mono text-on-surface tabular-nums">
                {editEstimatedTotal} m
              </div>
            </FormField>
          )}
          {editEstimatedWeight && (
            <FormField label="Trọng lượng ước tính (kg)">
              <div className="w-full bg-surface-container-low border-[0.5px] border-outline-variant rounded px-md py-[10px] font-mono text-type-mono text-on-surface tabular-nums">
                {editEstimatedWeight} kg
              </div>
            </FormField>
          )}
          <FormField label="GSM (đơn hàng)" required error={errors.gsm?.message}>
            <input id="edit-gsm" type="number" min={1} max={500} step={1} className={inputCls(true, !!errors.gsm)} {...register('gsm', { valueAsNumber: true })} />
          </FormField>
          <FormField label="GSM sản xuất (thực tế)" error={errors.productionGsm?.message} hint="Để trống nếu = GSM đơn">
            <input id="edit-productionGsm" type="number" min={1} max={500} step={1} className={inputCls(true, !!errors.productionGsm)} {...register('productionGsm', { setValueAs: (v: string | number) => (v === '' || isNaN(Number(v)) ? null : Number(v)) })} />
          </FormField>
          <FormField label="Color"       required error={errors.color?.message}>
            <input id="edit-color" type="text" className={inputCls(false, !!errors.color)} {...register('color')} />
          </FormField>
          <FormField label="Mã màu (MB Code)" error={errors.mbCode?.message}>
            <input
              id="edit-mbCode"
              type="text"
              placeholder="e.g. MYD4501A"
              className={inputCls(false, !!errors.mbCode)}
              {...register('mbCode', { setValueAs: (v: string) => (v === '' ? null : v) })}
            />
          </FormField>
        </div>
      </section>

      {/* Optional fields */}
      <section className="border-t-[0.5px] border-outline-variant pt-lg">
        <h2 className="text-label-sm font-inter font-medium text-secondary uppercase tracking-widest mb-md">
          Optional fields
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-[24px] gap-y-lg bg-surface-container-low border-[0.5px] border-outline-variant rounded-lg p-lg">
          <FormField label="Quantity (rolls)" error={errors.qty?.message}>
            <input id="edit-qty" type="number" min={1} step={1} className={inputCls(true, !!errors.qty)} {...register('qty', { setValueAs: (v: string) => (v === '' || v === null) ? null : Number(v) })} />
          </FormField>
          <FormField label="UV %" error={errors.uvPct?.message}>
            <input id="edit-uvPct" type="number" min={0} max={100} step={0.01} className={inputCls(true, !!errors.uvPct)} {...register('uvPct', { valueAsNumber: true })} />
          </FormField>
          <FormField label="FR %" error={errors.frPct?.message}>
            <input id="edit-frPct" type="number" min={0} max={100} step={0.01} className={inputCls(true, !!errors.frPct)} {...register('frPct', { valueAsNumber: true })} />
          </FormField>
          <div className="flex flex-col justify-end pb-2">
            <label className="flex items-center gap-xs cursor-pointer group w-fit">
              <input type="checkbox" className="w-4 h-4 rounded border-outline-variant text-primary focus:ring-primary cursor-pointer" {...register('requiresPacking')} />
              <span className="text-body-md font-noto text-on-surface group-hover:text-primary transition-colors select-none">
                Cần đóng gói
              </span>
            </label>
          </div>
          <div className="sm:col-span-2">
            <FormField label="Ghi chú dòng" error={errors.lineNote?.message}>
              <input id="edit-lineNote" type="text" className={inputCls(false, !!errors.lineNote)} {...register('lineNote')} />
            </FormField>
          </div>
          {/* Eyelet */}
          <div className="sm:col-span-2 flex items-center gap-sm">
            <input id="edit-hasEyelet" type="checkbox" className="w-4 h-4 rounded border-outline-variant text-primary focus:ring-primary cursor-pointer" {...register('hasEyelet')} />
            <label htmlFor="edit-hasEyelet" className="text-body-md font-noto text-on-surface cursor-pointer select-none">
              Có eyelet
            </label>
          </div>
          {editHasEyelet && (
            <FormField label="Màu eyelet" error={errors.eyeletColor?.message}>
              <input
                id="edit-eyeletColor"
                type="text"
                placeholder="e.g. SILVER, BLACK"
                className={inputCls(false, !!errors.eyeletColor)}
                {...register('eyeletColor', { setValueAs: (v: string) => (v === '' ? null : v) })}
              />
            </FormField>
          )}
          {/* Eyelet spec fields (new) */}
          <FormField label="Số lines eyelet" error={(errors as Record<string, { message?: string }>).eyeletLines?.message}>
            <input
              id="edit-eyeletLines"
              type="number" min={1} step={1}
              placeholder="e.g. 4"
              className={inputCls(true, false)}
              {...register('eyeletLines' as Parameters<typeof register>[0], { setValueAs: (v: string) => (v === '' || v === null) ? null : Number(v) })}
            />
          </FormField>
          <FormField label="Mô tả eyelet" error={(errors as Record<string, { message?: string }>).eyeletSpec?.message}>
            <input
              id="edit-eyeletSpec"
              type="text"
              placeholder="e.g. 5cm interval, single band both edges"
              className={inputCls(false, false)}
              {...register('eyeletSpec' as Parameters<typeof register>[0], { setValueAs: (v: string) => (v === '' ? null : v) })}
            />
          </FormField>
          <div className="sm:col-span-2">
            <FormField label="Description" error={errors.description?.message} hint="Max 200 characters">
              <textarea id="edit-description" rows={2} className={`${inputCls(false, !!errors.description)} resize-none`} {...register('description')} />
            </FormField>
          </div>
          <div className="sm:col-span-2">
            <FormField label="Remark" error={errors.remark?.message} hint="Max 200 characters">
              <textarea id="edit-remark" rows={2} className={`${inputCls(false, !!errors.remark)} resize-none`} {...register('remark')} />
            </FormField>
          </div>

          {/* ── Thông số kỹ thuật ─────────────────────────────────── */}
          <div className="sm:col-span-2">
            <p className="text-label-sm font-inter font-semibold text-primary uppercase tracking-widest mb-md">
              Thông số kỹ thuật
            </p>
          </div>
          <div className="sm:col-span-2">
            <FormField label="Thể loại lưới" error={errors.meshType?.message}>
              <input
                id="edit-meshType"
                type="text"
                placeholder="e.g. Dệt kim, Dệt thị…"
                className={inputCls(false, !!errors.meshType)}
                {...register('meshType', { setValueAs: (v: string) => (v === '' ? null : v) })}
              />
            </FormField>
          </div>
          <FormField label="Số kim" error={errors.needleCount?.message}>
            <input
              id="edit-needleCount"
              type="number"
              min={1}
              step={1}
              placeholder="e.g. 28"
              className={inputCls(true, !!errors.needleCount)}
              {...register('needleCount', { setValueAs: (v: string) => (v === '' || v === null) ? null : Number(v) })}
            />
          </FormField>
          <FormField label="Số dàn" error={errors.beamCount?.message}>
            <input
              id="edit-beamCount"
              type="number"
              min={1}
              step={1}
              placeholder="e.g. 4"
              className={inputCls(true, !!errors.beamCount)}
              {...register('beamCount', { setValueAs: (v: string) => (v === '' || v === null) ? null : Number(v) })}
            />
          </FormField>
        </div>
      </section>

      {/* Action buttons */}
      <div className="flex items-center justify-end gap-md pt-md border-t-[0.5px] border-outline-variant">
        <button type="button" onClick={cancelEdit} disabled={isSubmitting}
          className="inline-flex items-center justify-center gap-sm border border-primary bg-transparent hover:bg-surface-container text-primary text-sm font-medium px-4 py-2 h-9 rounded-md transition-colors disabled:opacity-50">
          Cancel
        </button>
        <button id="btn-save-changes" type="submit" disabled={isSubmitting}
          className="inline-flex items-center justify-center gap-sm bg-primary text-on-primary text-sm font-medium px-4 py-2 h-9 rounded-md hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors">
          {isSubmitting ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
              Saving…
            </>
          ) : (
            <><span className="material-symbols-outlined text-[18px]">save</span>Save changes</>
          )}
        </button>
      </div>
    </form>
  )
}
