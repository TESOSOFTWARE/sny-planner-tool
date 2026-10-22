'use client'

// src/components/schedule/AssignModal.tsx
// Opens when the planner clicks an empty machine slot on the schedule grid.
// Lets them pick an order sub-line → enter end date → assign.
//
// After AssignModal Sub-line Detail sprint:
//   - Order type extended to include per-sub-line fields
//   - Dropdown shows each sub-line with structured label
//   - Detail panel appears immediately after selecting a sub-line

import { useState, useEffect, useRef, useCallback } from 'react'
import { lineLabel } from '@/lib/schedule/piDisplay'
import { useScheduleModalFocus } from './useModalFocus'
import ProductionDurationSummary from './ProductionDurationSummary'
import { useAssignmentDates } from './useAssignmentDates'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { getUnassignedOrders } from '@/app/schedule/actions'
import PiOrderPanel from './PiOrderPanel'
import SuggestCombobox from '@/components/ui/SuggestCombobox'
import { formatOrderLabel, searchOrderChoices } from '@/lib/schedule/orderChoiceSearch'

// ── Types ─────────────────────────────────────────────────────────────────────

type Order = Awaited<ReturnType<typeof getUnassignedOrders>>['orders'][number]

interface Props {
  isOpen: boolean
  onClose: () => void
  machineId: string
  startDate: Date | null
  onSuccess: () => void
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// ── Sub-components ────────────────────────────────────────────────────────────

function DetailRow({
  label,
  value,
  mono = false,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="flex gap-1 min-w-0">
      <span className="text-label-sm font-inter text-secondary shrink-0">{label}:</span>
      <span className={`text-label-sm font-inter text-on-surface truncate ${mono ? 'font-mono' : ''}`}>
        {value}
      </span>
    </div>
  )
}

/** Detail card shown after selecting a sub-line in the dropdown. */
function SubLineDetailPanel({ o }: { o: Order }) {
  const isDraft = o.lifecycleStatus === 'DRAFT' || (o.isDraft && o.lifecycleStatus !== 'PLACEHOLDER' && !o.isPlaceholder)
  const isPlaceholder = o.lifecycleStatus === 'PLACEHOLDER' || o.isPlaceholder

  return (
    <div className="rounded-lg bg-surface-container-low border-[0.5px] border-outline-variant px-3 py-2 mt-2 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-label-sm font-inter font-semibold text-primary">
          {o.piNumber} · Dòng {lineLabel(o)}
        </p>
        {isDraft ? (
          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-500/15 text-amber-700 border border-amber-500/30 uppercase">
            Bản nháp
          </span>
        ) : isPlaceholder ? (
          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-500/15 text-amber-600 border border-amber-500/30 uppercase">
            Giữ chỗ tạm (Viền nét đứt)
          </span>
        ) : (
          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-500/15 text-emerald-600 border border-emerald-500/30 uppercase">
            Chính thức
          </span>
        )}
      </div>

      {isDraft && (
        <div className="p-2 rounded bg-amber-500/10 border border-amber-500/20 text-amber-800 text-xs font-medium">
          Đơn hàng đang ở trạng thái Bản Nháp. Sẽ được xếp lịch tạm thời (isPlaceholder) trên sơ đồ máy dệt.
        </div>
      )}

      {isPlaceholder && (
        <div className="p-2 rounded bg-amber-500/10 border border-amber-500/20 text-amber-700 text-xs font-medium">
          Đơn hàng Giữ chỗ tạm: Sẽ được hiển thị với viền vàng nét đứt trên sơ đồ 40 máy dệt.
        </div>
      )}

      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 pt-1">
        <DetailRow label="Khách"      value={o.customer} />
        <DetailRow label="Chiều rộng" value={o.widthM != null ? `${Number(o.widthM).toFixed(1)} m` : '—'} mono />
        <DetailRow label="GSM"        value={o.gsm != null ? String(o.gsm) : '—'} mono />
        <DetailRow label="Màu"        value={o.color ?? '—'} />
        {o.meshType && <DetailRow label="Loại lưới" value={o.meshType} />}
        <DetailRow label="Tổng mét"   value={o.lengthM != null ? `${Number(o.lengthM).toLocaleString('vi-VN')} m` : '—'} mono />
        {o.qty != null && (
          <DetailRow label="Số lượng" value={`${o.qty.toLocaleString('vi-VN')} cuộn`} mono />
        )}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AssignModal({ isOpen, onClose, machineId, startDate, onSuccess }: Props) {
  const modalRef = useRef<HTMLDivElement>(null)
  const escapingSuggestions = useRef(false)
  const closeOnEscape = useCallback(() => {
    if (escapingSuggestions.current) return
    onClose()
  }, [onClose])
  useScheduleModalFocus(isOpen, closeOnEscape, modalRef)
  const [orders,               setOrders]               = useState<Order[]>([])
  const [selectedOrderId,      setSelectedOrderId]      = useState('')
  const [orderQuery, setOrderQuery] = useState('')
  const [endDate,              setEndDate]              = useState('')
  const [allocatedMeters,      setAllocatedMeters]      = useState('')
  const [estimatedDailyOutput, setEstimatedDailyOutput] = useState('')
  const [error,                setError]                = useState('')
  const [isLoading,            setIsLoading]            = useState(false)
  const [includeFinished, setIncludeFinished] = useState(false)
  const [hiddenCount, setHiddenCount] = useState(0)
  const [loadingOrders, setLoadingOrders] = useState(false)

  const loadOrders = useCallback(async (include: boolean) => {
    setLoadingOrders(true)
    try {
      const data = await getUnassignedOrders(include)
      setOrders(data.orders); setHiddenCount(data.hiddenCount)
      setSelectedOrderId(current => data.orders.some(o => o.id === current) ? current : '')
    } catch { setError('Không tải được danh sách dòng hàng') } finally { setLoadingOrders(false) }
  }, [])

  useEffect(() => {
    if (isOpen) {
      setIncludeFinished(false)
      void loadOrders(false)
      if (startDate) {
        // Pre-fill end date with start date
        setEndDate(format(startDate, 'yyyy-MM-dd'))
      }
      // Reset selection state when modal opens
      setSelectedOrderId('')
      setOrderQuery('')
      setAllocatedMeters('')
      setEstimatedDailyOutput('')
      setError('')
    }
  }, [isOpen, startDate, loadOrders])

  const loadOrderOptions = useCallback(async (q: string, _signal: AbortSignal) =>
    searchOrderChoices(orders, orders.some(o => o.id === selectedOrderId && q === formatOrderLabel(o)) ? '' : q).map(o => ({
      value: formatOrderLabel(o), label: formatOrderLabel(o), group: o.group, data: o,
    })), [orders, selectedOrderId])

  const requestedStart = startDate ? format(startDate, 'yyyy-MM-dd') : ''
  const dates = useAssignmentDates({
    enabled: isOpen && !!startDate, startDate: requestedStart, endDate,
    allocatedMeters, estimatedDailyOutput, setEndDate,
  })

  if (!isOpen || !startDate) return null

  // Derived: the full Order object for the currently-selected id
  const selectedOrder = orders.find(o => o.id === selectedOrderId) ?? null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (dates.loading || dates.error) { setError(dates.error || 'Đang tính lịch, vui lòng đợi.'); return }

    setIsLoading(true)

    try {
      const startDateStr = format(startDate, 'yyyy-MM-dd')
      const parsedStart  = new Date(startDateStr)
      const parsedEnd    = new Date(endDate)
      if (parsedEnd < parsedStart) {
        setError('Ngày kết thúc không được trước ngày bắt đầu')
        setIsLoading(false)
        return
      }

      const startISO = new Date(`${startDateStr}T00:00:00+07:00`).toISOString()
      const endISO   = new Date(`${endDate}T00:00:00+07:00`).toISOString()

      const res = await fetch('/api/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          machineId,
          orderId:   selectedOrderId,
          startDate: startISO,
          endDate:   endISO,
          endDateSource: dates.endDateSource,
          ...(allocatedMeters      !== '' && { allocatedMeters:      Number(allocatedMeters) }),
          ...(estimatedDailyOutput !== '' && { estimatedDailyOutput: Number(estimatedDailyOutput) }),
        }),
      })

      const data = await res.json()
      if (res.status === 409) {
        setError(data.message || 'Máy đã được xếp lịch trong khoảng thời gian này')
        return
      }
      if (!res.ok) {
        throw new Error(data.message || data.error || 'Lỗi không xác định')
      }
      if (data.warnings?.length) toast.warning(data.warnings.join(' '))
      onSuccess()
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Lỗi mạng')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        ref={modalRef} role="dialog" aria-modal="true" aria-label="Xếp máy"
        onKeyDownCapture={event => {
          if (event.key === 'Escape' && event.target instanceof HTMLElement &&
              event.target.getAttribute('role') === 'combobox' && event.target.getAttribute('aria-expanded') === 'true') {
            escapingSuggestions.current = true
            setTimeout(() => { escapingSuggestions.current = false }, 0)
          }
        }}
        className="bg-surface rounded-xl shadow-lg w-full max-w-md overflow-hidden max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-md py-sm border-b-[0.5px] border-outline-variant flex justify-between items-center sticky top-0 bg-surface z-10">
          <h3 className="text-headline-sm font-inter font-semibold text-on-surface">Xếp máy</h3>
          <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface">
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-md">
          {/* Error */}
          {error && (
            <div className="mb-md p-sm rounded-lg bg-error-container border border-error/30 text-error text-label-sm">
              {error}
            </div>
          )}

          <div className="space-y-md">
            {/* Machine (read-only) */}
            <div>
              <label htmlFor="assign-machine" className="block text-label-sm font-medium text-secondary mb-xs">Máy</label>
              <input id="assign-machine"
                type="text"
                disabled
                value={machineId}
                className="w-full h-10 px-sm rounded-lg border-[0.5px] border-outline-variant bg-surface-container-lowest text-on-surface-variant font-mono text-type-mono"
              />
            </div>

            {/* Order / sub-line selector */}
            <div>
              <label htmlFor="assign-order-select" className="block text-label-sm font-medium text-secondary mb-xs">
                Đơn hàng — Dòng hàng
              </label>
              <SuggestCombobox
                id="assign-order-select"
                value={orderQuery}
                onChange={value => { setOrderQuery(value); setSelectedOrderId('') }}
                load={loadOrderOptions}
                onSelect={option => setSelectedOrderId(option.data?.id ?? '')}
                disabled={loadingOrders}
                placeholder="Tìm PI, khách, màu, loại lưới, khổ, GSM..."
                listLabel="Dòng hàng"
                emptyText={() => 'Không tìm thấy dòng hàng phù hợp'}
                className="w-full h-10 px-sm rounded-lg border-[0.5px] border-outline bg-surface focus:border-primary focus:ring-1 focus:ring-primary outline-none text-body-md"
              />
              <p className="mt-1 text-xs text-secondary">
                {loadingOrders ? 'Đang tải dòng hàng…' : includeFinished ? 'Đang hiện cả dòng đã kết thúc lịch' : `Đang ẩn ${hiddenCount} dòng đã kết thúc lịch`}
                {' · '}
                <button type="button" disabled={loadingOrders} onClick={() => { const next = !includeFinished; setIncludeFinished(next); void loadOrders(next) }} className="text-primary underline disabled:opacity-50">{includeFinished ? 'Ẩn' : 'Hiện'}</button>
              </p>

              {/* Detail panel — renders immediately after selection */}
              {selectedOrder && <SubLineDetailPanel o={selectedOrder} />}
              {selectedOrder && <PiOrderPanel piNumber={selectedOrder.piNumber} selectedOrderId={selectedOrder.id} />}
            </div>

            {/* Date range */}
            <div className="flex gap-sm">
              {/* Start date (read-only — from clicked cell) */}
              <div className="flex-1">
                <label htmlFor="assign-start-date" className="block text-label-sm font-medium text-secondary mb-xs">Bắt đầu</label>
                <input id="assign-start-date"
                  type="text"
                  disabled
                  value={(dates.plan?.startDate || requestedStart).split('-').reverse().join('/')}
                  className="w-full h-10 px-sm rounded-lg border-[0.5px] border-outline-variant bg-surface-container-lowest text-on-surface-variant"
                />
              </div>
              {/* End date (editable) */}
              <div className="flex-1">
                <label htmlFor="assign-end-date" className="block text-label-sm font-medium text-secondary mb-xs">Kết thúc</label>
                <input id="assign-end-date"
                  type="date"
                  required
                  min={format(startDate, 'yyyy-MM-dd')}
                  value={endDate}
                  onChange={e => dates.setManualEndDate(e.target.value)}
                  className="w-full h-10 px-sm rounded-lg border-[0.5px] border-outline bg-surface focus:border-primary outline-none"
                />
              </div>
            </div>

            {/* Allocated meters */}
            <div>
              <label htmlFor="assign-allocated-meters" className="block text-label-sm font-medium text-secondary mb-xs">Số mét phân công</label>
              <input id="assign-allocated-meters"
                type="number"
                min={1}
                step={1}
                value={allocatedMeters}
                onChange={e => setAllocatedMeters(e.target.value)}
                placeholder="e.g. 6000"
                className="w-full h-10 px-sm rounded-lg border-[0.5px] border-outline bg-surface focus:border-primary outline-none font-mono"
              />
            </div>

            {/* Estimated daily output */}
            <div>
              <label htmlFor="assign-estimatedDailyOutput" className="block text-label-sm font-medium text-secondary mb-xs">
                Năng suất (m/ngày)
              </label>
              <input
                id="assign-estimatedDailyOutput"
                type="number"
                min={1}
                step={1}
                value={estimatedDailyOutput}
                onChange={e => setEstimatedDailyOutput(e.target.value)}
                placeholder="e.g. 800"
                className="w-full h-10 px-sm rounded-lg border-[0.5px] border-outline bg-surface focus:border-primary outline-none font-mono"
              />
            </div>
          </div>

          <ProductionDurationSummary allocatedMeters={allocatedMeters} estimatedDailyOutput={estimatedDailyOutput}
            startDate={requestedStart} plan={dates.plan} loading={dates.loading} error={dates.error}
            mode={dates.mode} onUseComputed={dates.useComputedDates} />

          {/* Actions */}
          <div className="mt-xl flex justify-end gap-sm">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center justify-center gap-sm border border-primary bg-transparent hover:bg-surface-container text-primary text-sm font-medium px-4 py-2 h-9 rounded-md transition-colors"
            >
              Huỷ
            </button>
            <button
              type="submit"
              disabled={isLoading || !selectedOrderId || dates.loading || !!dates.error}
              className="inline-flex items-center justify-center gap-sm bg-primary text-on-primary text-sm font-medium px-4 py-2 h-9 rounded-md hover:bg-primary/90 disabled:opacity-60 transition-colors"
            >
              {isLoading ? 'Đang lưu...' : 'Xếp máy'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
