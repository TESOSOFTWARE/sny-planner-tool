'use client'

// src/components/schedule/AssignModal.tsx
// Opens when the planner clicks an empty machine slot on the schedule grid.
// Lets them pick an order sub-line → enter end date → assign.
//
// After AssignModal Sub-line Detail sprint:
//   - Order type extended to include per-sub-line fields
//   - Dropdown shows each sub-line with structured label
//   - Detail panel appears immediately after selecting a sub-line

import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { getUnassignedOrders } from '@/app/schedule/actions'

// ── Types ─────────────────────────────────────────────────────────────────────

type Order = Awaited<ReturnType<typeof getUnassignedOrders>>[number]

interface Props {
  isOpen: boolean
  onClose: () => void
  machineId: string
  startDate: Date | null
  onSuccess: () => void
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Format one sub-line as a structured dropdown option label. */
function formatOrderLabel(o: Order): string {
  const widthStr = o.widthM != null ? `${Number(o.widthM).toFixed(1)}m` : '—'
  const colorStr = o.color ?? '—'
  const gsmStr = o.gsm != null ? `${o.gsm}gsm` : '—'
  const draftPrefix = o.isDraft ? '📌 [Nháp] ' : ''
  const base = `${draftPrefix}${o.piNumber} · Dòng ${o.subLineIndex + 1} — ${widthStr} · ${colorStr} · ${gsmStr}`
  return o.meshType ? `${base} · ${o.meshType}` : base
}

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
  return (
    <div className="rounded-lg bg-surface-container-low border-[0.5px] border-outline-variant px-3 py-2 mt-2">
      <p className="text-label-sm font-inter font-semibold text-primary mb-1.5">
        {o.piNumber} · Dòng {o.subLineIndex + 1}
      </p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
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
  const [orders,               setOrders]               = useState<Order[]>([])
  const [selectedOrderId,      setSelectedOrderId]      = useState('')
  const [endDate,              setEndDate]              = useState('')
  const [allocatedMeters,      setAllocatedMeters]      = useState('')
  const [estimatedDailyOutput, setEstimatedDailyOutput] = useState('')
  const [error,                setError]                = useState('')
  const [isLoading,            setIsLoading]            = useState(false)

  useEffect(() => {
    if (isOpen) {
      getUnassignedOrders().then(setOrders).catch(console.error)
      if (startDate) {
        // Pre-fill end date with start date
        setEndDate(format(startDate, 'yyyy-MM-dd'))
      }
      // Reset selection state when modal opens
      setSelectedOrderId('')
      setAllocatedMeters('')
      setEstimatedDailyOutput('')
      setError('')
    }
  }, [isOpen, startDate])

  if (!isOpen || !startDate) return null

  // Derived: the full Order object for the currently-selected id
  const selectedOrder = orders.find(o => o.id === selectedOrderId) ?? null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
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
              <label className="block text-label-sm font-medium text-secondary mb-xs">Máy</label>
              <input
                type="text"
                disabled
                value={machineId}
                className="w-full h-10 px-sm rounded-lg border-[0.5px] border-outline-variant bg-surface-container-lowest text-on-surface-variant font-mono text-type-mono"
              />
            </div>

            {/* Order / sub-line selector */}
            <div>
              <label className="block text-label-sm font-medium text-secondary mb-xs">
                Đơn hàng — Dòng hàng
              </label>
              <select
                required
                value={selectedOrderId}
                onChange={e => setSelectedOrderId(e.target.value)}
                className="w-full h-10 px-sm rounded-lg border-[0.5px] border-outline bg-surface focus:border-primary focus:ring-1 focus:ring-primary outline-none text-body-md"
              >
                <option value="">Chọn dòng hàng...</option>
                {orders.map(o => (
                  <option key={o.id} value={o.id}>
                    {formatOrderLabel(o)}
                  </option>
                ))}
              </select>

              {/* Detail panel — renders immediately after selection */}
              {selectedOrder && <SubLineDetailPanel o={selectedOrder} />}
            </div>

            {/* Date range */}
            <div className="flex gap-sm">
              {/* Start date (read-only — from clicked cell) */}
              <div className="flex-1">
                <label className="block text-label-sm font-medium text-secondary mb-xs">Bắt đầu</label>
                <input
                  type="text"
                  disabled
                  value={format(startDate, 'dd/MM/yyyy')}
                  className="w-full h-10 px-sm rounded-lg border-[0.5px] border-outline-variant bg-surface-container-lowest text-on-surface-variant"
                />
              </div>
              {/* End date (editable) */}
              <div className="flex-1">
                <label className="block text-label-sm font-medium text-secondary mb-xs">Kết thúc</label>
                <input
                  type="date"
                  required
                  min={format(startDate, 'yyyy-MM-dd')}
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  className="w-full h-10 px-sm rounded-lg border-[0.5px] border-outline bg-surface focus:border-primary outline-none"
                />
              </div>
            </div>

            {/* Allocated meters */}
            <div>
              <label className="block text-label-sm font-medium text-secondary mb-xs">Số mét phân công</label>
              <input
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
              <label className="block text-label-sm font-medium text-secondary mb-xs">
                Sản lượng dự kiến (m/ngày)
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
              disabled={isLoading}
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
