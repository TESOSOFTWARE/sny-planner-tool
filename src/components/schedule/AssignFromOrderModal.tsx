'use client'

// src/components/schedule/AssignFromOrderModal.tsx
// Opened from OrderDetail view — the order is already known.
// Planner selects: machine + start date + end date.
// Uses the same UTC+7 date encoding pattern as AssignModal.tsx.

import { useState } from 'react'
import type { SerializedProductionOrder } from '@/types'

// ── Constants ─────────────────────────────────────────────────────────────────

const MACHINES = Array.from({ length: 40 }, (_, i) => `M-${String(i + 1).padStart(3, '0')}`)

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Convert a YYYY-MM-DD date string to a UTC ISO string anchored at midnight Vietnam time (UTC+7). */
function toVietnamISO(yyyymmdd: string): string {
  return new Date(`${yyyymmdd}T00:00:00+07:00`).toISOString()
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  order: SerializedProductionOrder
  onAssigned: () => void
  onClose: () => void
}

export default function AssignFromOrderModal({ order, onAssigned, onClose }: Props) {
  const [machineId, setMachineId]         = useState('')
  const [startDate, setStartDate]         = useState('')
  const [endDate, setEndDate]             = useState('')
  const [allocatedMeters, setAllocatedMeters] = useState<string>(
    order.lengthM ? String(Math.round(order.lengthM / 2)) : ''
  )
  const [estimatedDailyOutput, setEstimatedDailyOutput] = useState('')
  const [error, setError]                 = useState('')
  const [isLoading, setIsLoading]         = useState(false)
  const [isSuccess, setIsSuccess]         = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    // Client-side date validation
    const parsedStart = new Date(startDate)
    const parsedEnd   = new Date(endDate)
    if (parsedEnd < parsedStart) {
      setError('End Date cannot be before Start Date')
      return
    }

    setIsLoading(true)
    try {
      const res = await fetch('/api/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          machineId,
          orderId:   order.id,
          startDate: toVietnamISO(startDate),
          endDate:   toVietnamISO(endDate),
          // Gửi số mét phân công nếu có nhập
          ...(allocatedMeters !== '' && { allocatedMeters: Number(allocatedMeters) }),
          // Gửi sản lượng dự kiến nếu có nhập
          ...(estimatedDailyOutput !== '' && { estimatedDailyOutput: Number(estimatedDailyOutput) }),
        }),
      })

      const data = await res.json()

      if (res.status === 409) {
        setError('Máy đã được xếp lịch trong khoảng thời gian này')
        return
      }
      if (!res.ok) {
        throw new Error(data.message || 'Failed to create assignment')
      }

      // Success path
      setIsSuccess(true)
      onAssigned()
      setTimeout(() => {
        onClose()
      }, 1500)
    } catch (err: any) {
      setError(err.message)
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
        className="bg-surface rounded-xl shadow-lg w-full max-w-md overflow-hidden"
        onClick={e => e.stopPropagation()}
      >

        {/* Header */}
        <div className="px-md py-sm border-b-[0.5px] border-outline-variant flex justify-between items-center">
          <h3 className="text-headline-sm font-inter font-semibold text-on-surface">
            Assign to machine
          </h3>
          <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface transition-colors">
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Success state */}
        {isSuccess ? (
          <div className="p-md flex flex-col items-center justify-center gap-md py-xl">
            <div className="w-12 h-12 rounded-full bg-[#f0fdf4] border border-[#22c55e]/30 flex items-center justify-center">
              <span className="material-symbols-outlined text-[28px] text-[#15803d]">check_circle</span>
            </div>
            <p className="text-body-md font-inter font-semibold text-on-surface">Đã xếp lịch thành công</p>
            <p className="text-label-sm text-secondary">Đang đóng cửa sổ…</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-md space-y-md">

            {/* Error banner */}
            {error && (
              <div className="p-sm rounded-lg bg-[#FFF8E7] border border-[#F59E0B] text-[#92400E] text-label-sm">
                {error}
              </div>
            )}

            {/* Draft Order Notice */}
            {order.isDraft && (
              <div className="p-sm rounded-lg bg-warning-container/40 border border-warning/50 text-warning-800 text-label-sm flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px] text-warning-700">push_pin</span>
                <span>Đơn nháp sẽ được giữ chỗ tạm (viền đứt nét) trên Lịch sản xuất.</span>
              </div>
            )}

            {/* Order info (sub-line detail) */}
            <div className="rounded-lg bg-surface-container-low border-[0.5px] border-outline-variant px-md py-sm">
              <p className="text-label-sm font-inter font-semibold text-primary mb-1.5">
                {order.piNumber} · Dòng {order.subLineIndex + 1}
              </p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                <div className="flex gap-1 min-w-0">
                  <span className="text-label-sm font-inter text-secondary shrink-0">Khách:</span>
                  <span className="text-label-sm font-inter text-on-surface truncate">{order.customer}</span>
                </div>
                <div className="flex gap-1 min-w-0">
                  <span className="text-label-sm font-inter text-secondary shrink-0">Chiều rộng:</span>
                  <span className="text-label-sm font-inter font-mono text-on-surface">{Number(order.widthM).toFixed(1)} m</span>
                </div>
                <div className="flex gap-1 min-w-0">
                  <span className="text-label-sm font-inter text-secondary shrink-0">GSM:</span>
                  <span className="text-label-sm font-inter font-mono text-on-surface">{order.gsm}</span>
                </div>
                <div className="flex gap-1 min-w-0">
                  <span className="text-label-sm font-inter text-secondary shrink-0">Màu:</span>
                  <span className="text-label-sm font-inter text-on-surface truncate">{order.color}</span>
                </div>
                {order.meshType && (
                  <div className="flex gap-1 min-w-0">
                    <span className="text-label-sm font-inter text-secondary shrink-0">Loại lưới:</span>
                    <span className="text-label-sm font-inter text-on-surface truncate">{order.meshType}</span>
                  </div>
                )}
                <div className="flex gap-1 min-w-0">
                  <span className="text-label-sm font-inter text-secondary shrink-0">Tổng mét:</span>
                  <span className="text-label-sm font-inter font-mono text-on-surface">
                    {Number(order.lengthM).toLocaleString('vi-VN')} m
                  </span>
                </div>
                {order.qty != null && (
                  <div className="flex gap-1 min-w-0">
                    <span className="text-label-sm font-inter text-secondary shrink-0">Số lượng:</span>
                    <span className="text-label-sm font-inter font-mono text-on-surface">
                      {order.qty.toLocaleString('vi-VN')} cuộn
                    </span>
                  </div>
                )}
              </div>
            </div>


            {/* Machine */}
            <div>
              <label className="block text-label-sm font-medium text-secondary mb-xs">
                Máy <span className="text-error">*</span>
              </label>
              <select
                required
                value={machineId}
                onChange={e => setMachineId(e.target.value)}
                className="w-full h-10 px-sm rounded-lg border-[0.5px] border-outline bg-surface focus:border-primary focus:ring-1 focus:ring-primary outline-none text-body-md"
              >
                <option value="">Chọn máy…</option>
                {MACHINES.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>

            {/* Dates */}
            <div className="flex gap-sm">
              <div className="flex-1">
                <label className="block text-label-sm font-medium text-secondary mb-xs">
                  Ngày bắt đầu <span className="text-error">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={startDate}
                  onChange={e => {
                    setStartDate(e.target.value)
                    // Reset end date if it's now before new start
                    if (endDate && e.target.value > endDate) setEndDate(e.target.value)
                  }}
                  className="w-full h-10 px-sm rounded-lg border-[0.5px] border-outline bg-surface focus:border-primary outline-none"
                />
              </div>
              <div className="flex-1">
                <label className="block text-label-sm font-medium text-secondary mb-xs">
                  Ngày kết thúc <span className="text-error">*</span>
                </label>
                <input
                  type="date"
                  required
                  min={startDate || undefined}
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  className="w-full h-10 px-sm rounded-lg border-[0.5px] border-outline bg-surface focus:border-primary outline-none"
                />
              </div>
            </div>

            {/* Số mét phân công */}
            <div>
              <label className="block text-label-sm font-medium text-secondary mb-xs">
                Số mét phân công
              </label>
              <input
                type="number"
                min={1}
                step={1}
                value={allocatedMeters}
                onChange={e => setAllocatedMeters(e.target.value)}
                placeholder="e.g. 6000"
                className="w-full h-10 px-sm rounded-lg border-[0.5px] border-outline bg-surface focus:border-primary outline-none font-mono"
              />
              <p className="text-label-sm text-outline mt-xs">Mặc định chia đôi. Điều chỉnh nếu cần.</p>
            </div>

            {/* Sản lượng dự kiến */}
            <div>
              <label className="block text-label-sm font-medium text-secondary mb-xs">
                Sản lượng dự kiến (m/ngày)
              </label>
              <input
                id="assign-from-order-estimatedDailyOutput"
                type="number"
                min={1}
                step={1}
                value={estimatedDailyOutput}
                onChange={e => setEstimatedDailyOutput(e.target.value)}
                placeholder="e.g. 800"
                className="w-full h-10 px-sm rounded-lg border-[0.5px] border-outline bg-surface focus:border-primary outline-none font-mono"
              />
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-sm pt-sm">
              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center justify-center gap-sm border border-primary bg-transparent hover:bg-surface-container text-primary text-sm font-medium px-4 py-2 h-9 rounded-md transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="inline-flex items-center justify-center gap-sm bg-primary text-on-primary text-sm font-medium px-4 py-2 h-9 rounded-md hover:bg-primary/90 disabled:opacity-60 transition-colors"
              >
                {isLoading ? 'Saving…' : 'Assign'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
