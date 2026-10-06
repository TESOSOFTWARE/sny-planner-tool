'use client'

import OrderStatusBadge from './OrderStatusBadge'
import type { OrderStatus } from '@/lib/orderStatus'

export default function DraftBadge() {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-[#FFF8E7] text-[#D97706] border border-[#F59E0B]/30 whitespace-nowrap" title="Đơn nháp — chưa đủ điều kiện xếp lịch">
      <span className="material-symbols-outlined text-[13px] leading-none">edit_note</span>
      NHÁP
    </span>
  )
}

export function ReservedBadge() {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-amber-500/10 text-amber-600 border border-amber-500/30 whitespace-nowrap" title="Đơn giữ chỗ máy — được xếp lịch sản xuất">
      <span className="material-symbols-outlined text-[13px] leading-none">event_seat</span>
      GIỮ CHỖ
    </span>
  )
}

export function ApprovedBadge() {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-emerald-500/10 text-emerald-700 border border-emerald-500/30 whitespace-nowrap" title="Đơn chính thức — đã chốt sản xuất">
      <span className="material-symbols-outlined text-[13px] leading-none">verified</span>
      ĐÃ CHỐT
    </span>
  )
}

/**
 * 1. TÌNH TRẠNG PI (Minimalist: Không badge hộp, hiển thị text thanh lịch kèm status dot)
 * - Đã chốt: Dot xanh lá + Text "Đã chốt"
 * - Đơn nháp: Dot cam + Text "Đơn nháp"
 */
export function PiStatusBadge({
  lifecycleStatus,
  isDraft,
}: {
  lifecycleStatus?: string | null
  isDraft?: boolean
}) {
  const isD = lifecycleStatus === 'DRAFT' || (isDraft && lifecycleStatus !== 'RESERVED')
  if (isD) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-600 whitespace-nowrap" title="Đơn nháp — chưa chốt thông số">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
        <span>Đơn nháp</span>
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 whitespace-nowrap" title="Đơn chính thức — đã chốt sản xuất">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
      <span>Đã chốt</span>
    </span>
  )
}

/**
 * 2. KẾ HOẠCH MÁY (Minimalist: Không badge hộp cồng kềnh, hiển thị trạng thái phân bổ và tiến độ máy)
 * - Giữ chỗ máy: Dot hổ phách + "Giữ chỗ máy (Chưa gán / Đã gán)"
 * - Tiến độ dệt thường: Dot theo màu + Tên tiến độ
 */
export function MachinePlanBadge({
  lifecycleStatus,
  isPlaceholder,
  calculatedStatus = 'PENDING',
}: {
  lifecycleStatus?: string | null
  isPlaceholder?: boolean
  calculatedStatus?: OrderStatus
}) {
  const isR = lifecycleStatus === 'RESERVED' || lifecycleStatus === 'RESERVE' || lifecycleStatus === 'PLACEHOLDER' || isPlaceholder

  if (isR) {
    const isAssigned = calculatedStatus !== 'PENDING'
    return (
      <span className="inline-flex items-center gap-1.5 text-xs whitespace-nowrap" title="Đơn giữ chỗ máy trên sơ đồ 40 máy dệt">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
        <span className="font-semibold text-amber-800">Giữ chỗ máy</span>
        <span className="text-[11px] text-secondary font-normal">
          {isAssigned ? '(Đã gán)' : '(Chưa gán)'}
        </span>
      </span>
    )
  }

  switch (calculatedStatus) {
    case 'RUNNING':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 whitespace-nowrap">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
          <span>Đang dệt</span>
        </span>
      )
    case 'SCHEDULED':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 whitespace-nowrap">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
          <span>Đã lên lịch</span>
        </span>
      )
    case 'DONE':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 whitespace-nowrap">
          <span className="w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0" />
          <span>Hoàn thành</span>
        </span>
      )
    case 'PENDING':
    default:
      return (
        <span className="inline-flex items-center gap-1.5 text-xs text-secondary whitespace-nowrap">
          <span className="w-1.5 h-1.5 rounded-full bg-zinc-300 shrink-0" />
          <span>Chưa lên lịch</span>
        </span>
      )
  }
}


export function OrderLifecycleBadge({
  lifecycleStatus,
  isDraft,
  isPlaceholder,
  showApproved = false,
}: {
  lifecycleStatus?: string | null
  isDraft?: boolean
  isPlaceholder?: boolean
  showApproved?: boolean
}) {
  const isD = lifecycleStatus === 'DRAFT' || (isDraft && lifecycleStatus !== 'RESERVED' && !isPlaceholder)
  if (isD) return <DraftBadge />

  const isR = lifecycleStatus === 'RESERVED' || lifecycleStatus === 'RESERVE' || lifecycleStatus === 'PLACEHOLDER' || isPlaceholder
  if (isR) return <ReservedBadge />

  if (showApproved || lifecycleStatus === 'APPROVED') {
    return <ApprovedBadge />
  }

  return null
}

