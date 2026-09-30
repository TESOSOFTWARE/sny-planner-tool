'use client'

// src/components/orders/OrderDetail.tsx
// R1 light theme — all state/form/API logic unchanged from S3.
// Only classNames updated: light surface, primary/error buttons, outline-variant dividers.

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
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
      <dd className={mono ? 'text-type-mono font-mono text-on-surface' : 'text-body-md font-noto text-on-surface'} suppressHydrationWarning>
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
  // V4.1 view: gọn mặc định — chỉ mở rộng toàn bộ khi planner bấm "Hiện tất cả"
  const [showAllV41, setShowAllV41] = useState(false)

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

      setCurrentOrder((prev) => ({ ...prev, isDraft: false, lifecycleStatus: 'APPROVED' }))
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

  const { register, handleSubmit, reset, watch, setValue, formState: { errors, isSubmitting } } =
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
  // V4.1 — watch để render điều kiện trong edit mode
  const editPrimaryPackingType = watch('primaryPackingType')
  const editOnPallet     = watch('onPallet')
  const editIsLaminated  = watch('isLaminated')
  const editRawFabricGsm = watch('rawFabricGsm')
  const editFinishedGsm  = watch('finishedGsm')

  // Live sync lengthM when orderType is rolls or pieces (Read-only Derived)
  useEffect(() => {
    if (editOrderType === 'rolls') {
      const q = Number(editQty)
      const r = Number(editRollLength)
      if (q > 0 && r > 0) {
        setValue('lengthM', q * r, { shouldValidate: true })
      }
    } else if (editOrderType === 'pieces') {
      const q = Number(editQty)
      const p = Number(editPieceLength)
      if (q > 0 && p > 0) {
        setValue('lengthM', q * p, { shouldValidate: true })
      }
    }
  }, [editOrderType, editQty, editRollLength, editPieceLength, setValue])

  const editEstimatedTotal = (() => {
    if (editOrderType === 'rolls' && editQty && editRollLength) {
      return (Number(editQty) * Number(editRollLength)).toLocaleString('vi-VN')
    }
    if (editOrderType === 'pieces' && editQty && editPieceLength) {
      return (Number(editQty) * Number(editPieceLength)).toLocaleString('vi-VN')
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
      // V4.1: đơn tráng màng ước tính theo GSM thành phẩm, không dùng GSM đơn
      isLaminated: editIsLaminated ?? false,
      rawFabricGsm: editRawFabricGsm ? Number(editRawFabricGsm) : null,
      finishedGsm: editFinishedGsm ? Number(editFinishedGsm) : null,
    })
    return (totalWeightKgs != null && totalWeightKgs > 0) ? totalWeightKgs.toLocaleString('vi-VN', { maximumFractionDigits: 1 }) : null
  })()

  const enterEdit = () => {
    router.push(`/orders/pi/${encodeURIComponent(currentOrder.piNumber)}?line=${currentOrder.subLineIndex}`)
  }


  const cancelEdit = () => { setSaveError(null); setMode('view') }

  const onSave = async (values: UpdateOrderOutput) => {
    setSaveError(null)
    try {
      // Lõi giấy / Gấp đôi chỉ hợp lệ với ROLL. Ẩn checkbox ở UI chưa đủ —
      // phải chốt lại ở payload để đổi ROLL → BALE không lưu giá trị cũ.
      const isRoll = values.primaryPackingType === 'ROLL'
      const res = await fetch(`/api/orders/${currentOrder.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...values,
          hasPaperCore: isRoll ? values.hasPaperCore : false,
          isHalfFolded: isRoll ? values.isHalfFolded : false,
          expectedUpdatedAt: currentOrder.updatedAt,
        }),
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
                <p className="mt-0.5 text-secondary">Đơn nháp chưa thể gán vào Lịch sản xuất. Kiểm tra, bổ sung đủ thông số và bấm &quot;Duyệt đơn nháp&quot;.</p>
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
          <Link
            id="btn-edit-order"
            href={`/orders/pi/${encodeURIComponent(currentOrder.piNumber)}?line=${currentOrder.subLineIndex}`}
            className="inline-flex items-center justify-center gap-sm bg-primary hover:bg-primary/90 text-on-primary text-sm font-medium px-4 py-2 h-9 rounded-md transition-colors shadow-xs"
          >
            <span className="material-symbols-outlined text-[18px]">edit_note</span>Sửa đơn (Master-Detail)
          </Link>
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
                    <span className="text-secondary" suppressHydrationWarning>— {Number(row.allocatedMeters).toLocaleString('vi-VN')}m</span>
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
          <ViewField label="Length (m)"   value={currentOrder.lengthM != null ? Number(currentOrder.lengthM).toLocaleString('vi-VN') : null} mono />
          <ViewField label="GSM (đơn hàng)" value={currentOrder.gsm ?? null} mono />
          <ViewField
            label="GSM sản xuất thực tế"
            value={
              // Đ1: đơn laminate dệt theo GSM mộc, không bao giờ "giống GSM đơn"
              currentOrder.isLaminated && currentOrder.rawFabricGsm != null
                ? `${currentOrder.rawFabricGsm} gsm (vải mộc)`
                : currentOrder.productionGsm != null
                  ? `${currentOrder.productionGsm} gsm`
                  : '— (giống GSM đơn)'
            }
            mono
          />
          <ViewField label="Color"        value={currentOrder.color ?? null}                    />
          {currentOrder.totalWeightKgs != null && (
            <ViewField
              // Đ3: ghi rõ cơ sở — đơn laminate tính theo GSM thành phẩm
              label={currentOrder.isLaminated && currentOrder.finishedGsm != null
                ? `Trọng lượng PO (kg, theo ${currentOrder.finishedGsm}gsm thành phẩm)`
                : 'Trọng lượng PO (kg)'}
              value={parseFloat(currentOrder.totalWeightKgs).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}
              mono
            />
          )}
          <ViewField
            label="Nhu cầu sợi (kg)"
            value={
              !currentOrder.isDraft && currentOrder.requiredYarnKg != null
                ? `${parseFloat(currentOrder.requiredYarnKg).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}${
                    // Đ2: hậu tố soi gương công thức orderWeight — laminate dùng raw,
                    // thường dùng productionGsm ?? gsm; thiếu cả hai thì không ghi hậu tố
                    (() => {
                      const basis = currentOrder.isLaminated && currentOrder.rawFabricGsm != null && currentOrder.rawFabricGsm > 0
                        ? currentOrder.rawFabricGsm
                        : (currentOrder.productionGsm != null && currentOrder.productionGsm > 0
                            ? currentOrder.productionGsm
                            : null)
                      return basis != null ? ` (theo ${basis}gsm)` : ''
                    })()
                  }`
                : null
            }
            mono
          />
          {/* Đ6: laminate thiếu số → công thức rơi về GSM đơn im lặng */}
          {currentOrder.isLaminated && (currentOrder.finishedGsm == null || currentOrder.rawFabricGsm == null) && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400 font-medium sm:col-span-2">
              ⚠️ Đơn tráng màng thiếu GSM mộc/thành phẩm — số PO/sợi đang tính tạm theo GSM đơn.
            </p>
          )}
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
            <ViewField label="Mét/cuộn" value={`${parseFloat(currentOrder.rollLength).toLocaleString('vi-VN')} m/cuộn`} mono />
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

        {/* ── V4.1: Đóng gói / Tráng màng / Màu-FR ───────────────────────────
            Gọn mặc định: chỉ hiện khối có dữ liệu, thứ tự bám cột template
            Excel để đối chiếu 1-1. Toggle "Hiện tất cả" để kiểm parity. */}
        {(() => {
          const o = currentOrder
          const packingTouched =
            o.primaryPackingType !== 'ROLL' || o.isHalfFolded ||
            (o.outerWrapping != null && o.outerWrapping !== 'POLYBAG') ||
            o.piecesPerCarton != null || o.piecesPerBale != null ||
            o.onPallet || o.secondaryPackingType !== 'NONE' || o.palletDimensions != null ||
            o.itemsPerPallet != null || o.packingNote != null
          const lamTouched =
            !!o.isLaminated || o.rawFabricGsm != null || o.coatingGsm != null || o.finishedGsm != null
          const colorTouched =
            (o.colorVersion != null && o.colorVersion !== 'STD')
          if (!packingTouched && !lamTouched && !colorTouched && !showAllV41) return null
          const packingLabel =
            o.primaryPackingType === 'CARTON' ? 'Thùng carton (CARTON)' :
            o.primaryPackingType === 'BALE' ? 'Kiện nén (BALE)' : 'Cuộn (ROLL)'
          const wrapLabel =
            o.outerWrapping === 'TARPAULIN' ? 'Bạt (tarpaulin)' :
            o.outerWrapping === 'NONE' ? 'Không bọc' : 'Túi PE (polybag)'
          const palletLabel =
            o.secondaryPackingType === 'WOOD_PALLET' ? 'Pallet gỗ' :
            o.secondaryPackingType === 'IRON_PALLET' ? 'Pallet sắt' :
            o.secondaryPackingType === 'PLASTIC_PALLET' ? 'Pallet nhựa' : 'Không pallet'
          return (
            <div className="border-t-[0.5px] border-outline-variant pt-lg">
              <div className="flex items-center justify-between mb-md">
                <p className="text-label-sm font-inter font-medium text-secondary uppercase tracking-widest">
                  Đóng gói & tráng màng
                </p>
                <button
                  type="button"
                  id="btn-toggle-v41"
                  onClick={() => setShowAllV41((v) => !v)}
                  className="text-label-sm font-inter text-primary hover:underline cursor-pointer"
                >
                  {showAllV41 ? 'Thu gọn' : 'Hiện tất cả'}
                </button>
              </div>
              {(packingTouched || showAllV41) && (
                <>
                  <p className="text-label-sm font-inter font-semibold text-primary uppercase tracking-widest mb-md">
                    Đóng gói
                  </p>
                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-y-lg gap-x-xl mb-lg">
                    <ViewField label="Kiểu đóng gói" value={packingLabel} />
                    <ViewField label="Bọc ngoài" value={wrapLabel} />
                    <ViewField label="Lõi giấy" value={o.hasPaperCore ? 'Có' : 'Không'} />
                    {(o.isHalfFolded || showAllV41) && (
                      <ViewField label="Gấp đôi" value={o.isHalfFolded ? 'Có' : 'Không'} />
                    )}
                    {o.primaryPackingType === 'CARTON' && o.piecesPerCarton != null && (
                      <ViewField label="Số tấm/thùng" value={o.piecesPerCarton} mono />
                    )}
                    {o.primaryPackingType === 'BALE' && o.piecesPerBale != null && (
                      <ViewField label="Số tấm/kiện" value={o.piecesPerBale} mono />
                    )}
                    {(o.onPallet || showAllV41) && (
                      <ViewField label="Pallet" value={o.onPallet ? palletLabel : 'Không'} />
                    )}
                    {(o.palletDimensions || showAllV41) && (
                      <ViewField label="Kích thước pallet" value={o.palletDimensions} mono />
                    )}
                    {o.itemsPerPallet != null && (
                      <ViewField label="SL/pallet" value={o.itemsPerPallet} mono />
                    )}
                    {o.packingNote && (
                      <div className="sm:col-span-2"><ViewField label="Ghi chú đóng gói" value={o.packingNote} /></div>
                    )}
                  </dl>
                </>
              )}
              {(lamTouched || showAllV41) && (
                <>
                  <p className="text-label-sm font-inter font-semibold text-primary uppercase tracking-widest mb-md">
                    Tráng màng & dung sai
                  </p>
                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-y-lg gap-x-xl mb-lg">
                    <ViewField label="Tráng màng ngoài" value={o.isLaminated ? 'Có' : 'Không'} />
                    {o.rawFabricGsm != null && (
                      <ViewField label="GSM mộc" value={o.rawFabricGsm} mono />
                    )}
                    {o.coatingGsm != null && (
                      <ViewField label="GSM màng tráng" value={o.coatingGsm} mono />
                    )}
                    {o.finishedGsm != null && (
                      <ViewField label="GSM thành phẩm" value={o.finishedGsm} mono />
                    )}
                    {(o.toleranceQtyPct != null || showAllV41) && (
                      <ViewField
                        label="Dung sai số lượng (±%)"
                        value={o.toleranceQtyPct != null ? `±${o.toleranceQtyPct}%` : null}
                        mono
                      />
                    )}
                    {(o.toleranceSpecPct != null || showAllV41) && (
                      <ViewField
                        label="Dung sai rộng/dài/nặng (±%)"
                        value={o.toleranceSpecPct != null ? `±${o.toleranceSpecPct}%` : null}
                        mono
                      />
                    )}
                  </dl>
                </>
              )}
              {(colorTouched || showAllV41) && (
                <>
                  <p className="text-label-sm font-inter font-semibold text-primary uppercase tracking-widest mb-md">
                    Màu & chống cháy
                  </p>
                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-y-lg gap-x-xl">
                    {(o.colorVersion || showAllV41) && (
                      <ViewField label="Phiên bản màu" value={o.colorVersion} />
                    )}
                  </dl>
                </>
              )}
            </div>
          )
        })()}

        {/* Optional fields */}
        {(currentOrder.qty != null || currentOrder.uvPct != null || currentOrder.frFlag || currentOrder.frPct != null ||
          currentOrder.lineNote ||
          currentOrder.description || currentOrder.remark ||
          currentOrder.meshType || currentOrder.needleCount != null || currentOrder.beamCount != null) && (
          <div className="border-t-[0.5px] border-outline-variant pt-lg">
            <p className="text-label-sm font-inter font-medium text-secondary uppercase tracking-widest mb-md">
              Optional details
            </p>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-y-lg gap-x-xl">
              {currentOrder.qty != null && (
                <ViewField
                  label={currentOrder.orderType === 'pieces' ? 'Quantity (pieces)' : 'Quantity (rolls)'}
                  value={currentOrder.qty}
                  mono
                />
              )}
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
            <input id="edit-widthM" type="number" min={0.1} max={20} step={0.1} className={inputCls(true, !!errors.widthM)} {...register('widthM', { setValueAs: (v: string | number) => (v === '' || v == null || Number.isNaN(Number(v))) ? null : Number(v) })} />
          </FormField>
          <FormField
            label="Length (m)"
            required={editOrderType === 'meters'}
            error={errors.lengthM?.message}
            hint={
              editOrderType === 'rolls'
                ? 'Tự động tính: Số cuộn × Mét/cuộn (Read-only)'
                : editOrderType === 'pieces'
                ? 'Tự động tính: Số tấm × Chiều dài tấm (Read-only)'
                : undefined
            }
          >
            <input
              id="edit-lengthM"
              type="number"
              min={1}
              max={100000}
              step={1}
              readOnly={editOrderType === 'rolls' || editOrderType === 'pieces'}
              tabIndex={editOrderType === 'rolls' || editOrderType === 'pieces' ? -1 : undefined}
              className={`${inputCls(true, !!errors.lengthM)} ${
                editOrderType === 'rolls' || editOrderType === 'pieces'
                  ? 'bg-surface-container-low text-on-surface-variant cursor-not-allowed opacity-90'
                  : ''
              }`}
              {...register('lengthM', {
                setValueAs: (v: string | number) =>
                  v === '' || v == null || Number.isNaN(Number(v)) ? null : Number(v),
              })}
            />
          </FormField>
          <FormField label="Kiểu đơn" error={errors.orderType?.message}>
            <select id="edit-orderType" className={inputCls(false, false)} {...register('orderType')}>
              <option value="meters">Theo tổng mét</option>
              <option value="rolls">Theo cuộn (qty × mét/cuộn)</option>
              <option value="pieces">Gia công tấm (qty × chiều dài tấm)</option>
            </select>
          </FormField>
          {(editOrderType === 'rolls' || editOrderType === 'pieces') && (
            <FormField
              label={editOrderType === 'rolls' ? 'Số cuộn' : 'Số tấm'}
              error={errors.qty?.message}
              hint={editOrderType === 'rolls' ? 'Số cuộn trong đơn' : 'Số tấm trong đơn'}
            >
              <input
                id="edit-qty"
                type="number"
                min={1}
                step={1}
                className={inputCls(true, !!errors.qty)}
                {...register('qty', { setValueAs: (v: string) => (v === '' || v === null) ? null : Number(v) })}
              />
            </FormField>
          )}
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
            <input id="edit-gsm" type="number" min={1} max={500} step={1} className={inputCls(true, !!errors.gsm)} {...register('gsm', { setValueAs: (v: string | number) => (v === '' || v == null || Number.isNaN(Number(v))) ? null : Number(v) })} />
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
          {editOrderType === 'meters' && (
            <FormField label="Quantity" error={errors.qty?.message} hint="Không dùng để tính tổng mét">
              <input id="edit-qty-meters" type="number" min={1} step={1} className={inputCls(true, !!errors.qty)} {...register('qty', { setValueAs: (v: string) => (v === '' || v === null) ? null : Number(v) })} />
            </FormField>
          )}
          <FormField label="UV %" error={errors.uvPct?.message}>
            <input id="edit-uvPct" type="number" min={0} max={100} step={0.01} className={inputCls(true, !!errors.uvPct)} {...register('uvPct', { valueAsNumber: true })} />
          </FormField>
          <FormField label="FR %" error={errors.frPct?.message}>
            <input id="edit-frPct" type="number" min={0} max={100} step={0.01} className={inputCls(true, !!errors.frPct)} {...register('frPct', { valueAsNumber: true })} />
          </FormField>
          {/* Checkbox "Cần đóng gói" — ẨN theo feedback KH (R1): dùng Kiểu đóng gói ROLL/BALE/CARTON thay thế.
              Không register field này nữa nên PUT giữ nguyên giá trị cũ trong DB (backward-compat, xem api/orders/[id] fallback). */}
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

          {/* ── V4.1: Đóng gói / Tráng màng / Màu-FR ─────────────────── */}
          <div className="sm:col-span-2">
            <p className="text-label-sm font-inter font-semibold text-primary uppercase tracking-widest mb-md">
              Đóng gói & tráng màng (V4.1)
            </p>
          </div>
          <FormField label="Kiểu đóng gói" error={errors.primaryPackingType?.message}>
            <select id="edit-primaryPackingType" className={inputCls(false, false)} {...register('primaryPackingType')}>
              <option value="ROLL">Cuộn (ROLL)</option>
              <option value="BALE">Kiện nén (BALE)</option>
              <option value="CARTON">Thùng carton (CARTON)</option>
            </select>
          </FormField>
          <FormField label="Bọc ngoài" error={errors.outerWrapping?.message}>
            <select id="edit-outerWrapping" className={inputCls(false, false)} {...register('outerWrapping')}>
              <option value="POLYBAG">Túi PE (polybag)</option>
              <option value="TARPAULIN">Bạt (tarpaulin)</option>
              <option value="NONE">Không bọc</option>
            </select>
          </FormField>
          <div className="sm:col-span-2 flex flex-wrap items-center gap-x-lg gap-y-sm">
            {/* Lõi giấy / Gấp đôi chỉ có nghĩa với đơn đóng theo cuộn. */}
            {editPrimaryPackingType === 'ROLL' && (
              <>
                <span className="inline-flex items-center gap-sm">
                  <input id="edit-hasPaperCore" type="checkbox" className="w-4 h-4 rounded border-outline-variant text-primary focus:ring-primary cursor-pointer" {...register('hasPaperCore')} />
                  <label htmlFor="edit-hasPaperCore" className="text-body-md font-noto text-on-surface cursor-pointer select-none">Lõi giấy</label>
                </span>
                <span className="inline-flex items-center gap-sm">
                  <input id="edit-isHalfFolded" type="checkbox" className="w-4 h-4 rounded border-outline-variant text-primary focus:ring-primary cursor-pointer" {...register('isHalfFolded')} />
                  <label htmlFor="edit-isHalfFolded" className="text-body-md font-noto text-on-surface cursor-pointer select-none">Gấp đôi</label>
                </span>
              </>
            )}
            <span className="inline-flex items-center gap-sm">
              <input id="edit-onPallet" type="checkbox" className="w-4 h-4 rounded border-outline-variant text-primary focus:ring-primary cursor-pointer" {...register('onPallet')} />
              <label htmlFor="edit-onPallet" className="text-body-md font-noto text-on-surface cursor-pointer select-none">Đóng trên pallet</label>
            </span>
          </div>
          {editPrimaryPackingType === 'CARTON' && (
            <FormField label="Số tấm/thùng" error={errors.piecesPerCarton?.message}>
              <input id="edit-piecesPerCarton" type="number" min={1} step={1} className={inputCls(true, !!errors.piecesPerCarton)}
                {...register('piecesPerCarton', { setValueAs: (v: string) => (v === '' || v === null) ? null : Number(v) })} />
            </FormField>
          )}
          {editPrimaryPackingType === 'BALE' && (
            <FormField label="Số tấm/kiện" error={errors.piecesPerBale?.message}>
              <input id="edit-piecesPerBale" type="number" min={1} step={1} className={inputCls(true, !!errors.piecesPerBale)}
                {...register('piecesPerBale', { setValueAs: (v: string) => (v === '' || v === null) ? null : Number(v) })} />
            </FormField>
          )}
          <FormField label="Loại pallet" error={errors.secondaryPackingType?.message}>
            <select id="edit-secondaryPackingType" className={inputCls(false, false)} {...register('secondaryPackingType')}>
              <option value="NONE">Không pallet</option>
              <option value="WOOD_PALLET">Pallet gỗ</option>
              <option value="IRON_PALLET">Pallet sắt</option>
              <option value="PLASTIC_PALLET">Pallet nhựa</option>
            </select>
          </FormField>
          {editOnPallet && (
            <FormField label="Kích thước pallet" error={errors.palletDimensions?.message}>
              <input id="edit-palletDimensions" type="text" placeholder="e.g. 1100x1100x150mm"
                className={inputCls(false, !!errors.palletDimensions)}
                {...register('palletDimensions', { setValueAs: (v: string) => (v === '' ? null : v) })} />
            </FormField>
          )}
          <FormField label="SL/pallet" error={errors.itemsPerPallet?.message}>
            <input id="edit-itemsPerPallet" type="number" min={1} step={1} className={inputCls(true, !!errors.itemsPerPallet)}
              {...register('itemsPerPallet', { setValueAs: (v: string) => (v === '' || v === null) ? null : Number(v) })} />
          </FormField>
          <div className="sm:col-span-2">
            <FormField label="Ghi chú đóng gói" error={errors.packingNote?.message}>
              <input id="edit-packingNote" type="text" className={inputCls(false, !!errors.packingNote)}
                {...register('packingNote', { setValueAs: (v: string) => (v === '' ? null : v) })} />
            </FormField>
          </div>
          <div className="sm:col-span-2 flex items-center gap-sm">
            <input id="edit-isLaminated" type="checkbox" className="w-4 h-4 rounded border-outline-variant text-primary focus:ring-primary cursor-pointer" {...register('isLaminated')} />
            <label htmlFor="edit-isLaminated" className="text-body-md font-noto text-on-surface cursor-pointer select-none">
              Hàng tráng màng ngoài
            </label>
          </div>
          {editIsLaminated && (
            <>
              <FormField label="GSM mộc" error={errors.rawFabricGsm?.message} hint="Vải mộc dệt xưởng (vd 325)">
                <input id="edit-rawFabricGsm" type="number" min={1} step={1} className={inputCls(true, !!errors.rawFabricGsm)}
                  {...register('rawFabricGsm', { setValueAs: (v: string) => (v === '' || v === null) ? null : Number(v) })} />
              </FormField>
              <FormField label="GSM màng tráng" error={errors.coatingGsm?.message} hint="Màng tráng ngoài (vd 105)">
                <input id="edit-coatingGsm" type="number" min={1} step={1} className={inputCls(true, !!errors.coatingGsm)}
                  {...register('coatingGsm', { setValueAs: (v: string) => (v === '' || v === null) ? null : Number(v) })} />
              </FormField>
              <FormField label="GSM thành phẩm" error={errors.finishedGsm?.message} hint="Giao khách (vd 430)">
                <input id="edit-finishedGsm" type="number" min={1} step={1} className={inputCls(true, !!errors.finishedGsm)}
                  {...register('finishedGsm', { setValueAs: (v: string) => (v === '' || v === null) ? null : Number(v) })} />
              </FormField>
            </>
          )}
          <FormField label="Dung sai số lượng (±%)" error={errors.toleranceQtyPct?.message}>
            <input id="edit-toleranceQtyPct" type="number" min={0.1} step={0.1} className={inputCls(true, !!errors.toleranceQtyPct)}
              {...register('toleranceQtyPct', { setValueAs: (v: string) => (v === '' || v === null) ? null : Number(v) })} />
          </FormField>
          <FormField label="Dung sai rộng/dài/nặng (±%)" error={errors.toleranceSpecPct?.message}>
            <input id="edit-toleranceSpecPct" type="number" min={0.1} step={0.1} className={inputCls(true, !!errors.toleranceSpecPct)}
              {...register('toleranceSpecPct', { setValueAs: (v: string) => (v === '' || v === null) ? null : Number(v) })} />
          </FormField>
          <FormField label="Phiên bản màu" error={errors.colorVersion?.message}>
            <select id="edit-colorVersion" className={inputCls(false, !!errors.colorVersion)} {...register('colorVersion', { setValueAs: (v: string) => (v === '' ? null : v) })}>
              <option value="STD">Tiêu chuẩn (STD)</option>
              <option value="Version A">Desert Sand A (MF 0.22 UV 4%)</option>
              <option value="Version B">Desert Sand B (MB Arirang Beige)</option>
            </select>
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
