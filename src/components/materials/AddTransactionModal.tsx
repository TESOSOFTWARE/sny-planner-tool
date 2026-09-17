'use client'

// src/components/materials/AddTransactionModal.tsx
// Modal for manually adding a single IN/OUT transaction for a material.

import { useState } from 'react'
import type { SerializedMaterial } from './EditMaterialModal'

interface Props {
  material: SerializedMaterial
  onAdded: () => void
  onClose: () => void
}

const TX_TYPES = [
  { value: 'in',         label: 'Nhập kho (IN)' },
  { value: 'out_using',  label: 'Xuất sử dụng (OUT USING)' },
  { value: 'out_broken', label: 'Xuất hỏng (HDPE BROKEN)' },
  { value: 'out_tape',   label: 'Xuất băng keo (OUT TAPE)' },
  { value: 'out_reject', label: 'Xuất reject (REJECT)' },
]

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

const inputCls = 'w-full h-10 px-3 rounded-lg border-[0.5px] border-outline bg-surface text-on-surface text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors'

export default function AddTransactionModal({ material, onAdded, onClose }: Props) {
  const [txType,   setTxType]   = useState('in')
  const [qty,      setQty]      = useState('')
  const [txDate,   setTxDate]   = useState(todayISO())
  const [mbPct,    setMbPct]    = useState('')
  const [orderId,  setOrderId]  = useState('')
  const [note,     setNote]     = useState('')
  const [error,    setError]    = useState('')
  const [isLoading, setIsLoading] = useState(false)

  // Show MB% input when material name contains "MB" or "M/B" or "MASTERBATCH", or txType = "in"
  const showMbPct =
    txType === 'in' ||
    /\bm[/\-]?b\b|masterbatch/i.test(material.name)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    const qtyNum = parseFloat(qty)
    if (isNaN(qtyNum) || qtyNum <= 0) {
      setError('Số kg phải là số dương.')
      return
    }
    if (!txDate) {
      setError('Vui lòng chọn ngày giao dịch.')
      return
    }

    setIsLoading(true)
    try {
      const res = await fetch(`/api/materials/${material.id}/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          txType,
          quantityKg: qtyNum,
          txDate,
          mbPct: mbPct ? parseFloat(mbPct) : null,
          orderId: orderId.trim() || null,
          note: note.trim() || null,
        }),
      })

      const data = await res.json() as { success: boolean; error?: string }
      if (!res.ok || !data.success) {
        setError(data.error ?? 'Không thể thêm giao dịch.')
        return
      }

      onAdded()
      onClose()
    } catch {
      setError('Lỗi mạng — không thể kết nối máy chủ.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-surface rounded-xl shadow-lg w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="px-6 py-4 border-b-[0.5px] border-outline-variant flex justify-between items-center">
          <div>
            <h3 className="text-base font-inter font-semibold text-on-surface">Nhập / Xuất kho</h3>
            <p className="text-xs text-secondary mt-0.5">{material.name}</p>
          </div>
          <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface transition-colors">
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">

          {error && (
            <div className="p-3 rounded-lg bg-[#FFF8E7] border border-[#F59E0B] text-[#92400E] text-sm">
              {error}
            </div>
          )}

          {/* Loại giao dịch */}
          <div>
            <label className="block text-xs font-medium text-secondary mb-1">
              Loại giao dịch <span className="text-error">*</span>
            </label>
            <select
              id="add-tx-type"
              value={txType}
              onChange={e => setTxType(e.target.value)}
              className={inputCls}
            >
              {TX_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          {/* Số kg + Ngày — side by side */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-secondary mb-1">
                Số kg <span className="text-error">*</span>
              </label>
              <input
                id="add-tx-qty"
                type="number"
                min={0.01}
                step={0.01}
                required
                value={qty}
                onChange={e => setQty(e.target.value)}
                placeholder="e.g. 500"
                className={inputCls}
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-secondary mb-1">
                Ngày <span className="text-error">*</span>
              </label>
              <input
                id="add-tx-date"
                type="date"
                required
                value={txDate}
                onChange={e => setTxDate(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>

          {/* % MB — conditional */}
          {showMbPct && (
            <div>
              <label className="block text-xs font-medium text-secondary mb-1">
                % MB (trên 1 tấn nhựa)
              </label>
              <input
                id="add-tx-mbpct"
                type="number"
                min={0}
                max={100}
                step={0.01}
                value={mbPct}
                onChange={e => setMbPct(e.target.value)}
                placeholder="e.g. 1.5"
                className={inputCls}
              />
              <p className="text-xs text-outline mt-1">Tỷ lệ MB sử dụng, ví dụ: 1, 1.5, 4</p>
            </div>
          )}

          {/* Mã đơn hàng */}
          <div>
            <label className="block text-xs font-medium text-secondary mb-1">Mã đơn hàng</label>
            <input
              id="add-tx-orderid"
              type="text"
              value={orderId}
              onChange={e => setOrderId(e.target.value)}
              placeholder="e.g. GBN26-099"
              className={inputCls}
            />
          </div>

          {/* Ghi chú */}
          <div>
            <label className="block text-xs font-medium text-secondary mb-1">Ghi chú</label>
            <input
              id="add-tx-note"
              type="text"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Ghi chú tuỳ chọn…"
              className={inputCls}
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center justify-center border border-primary bg-transparent hover:bg-surface-container text-primary text-sm font-medium px-4 py-2 h-9 rounded-md transition-colors"
            >
              Huỷ
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="inline-flex items-center justify-center bg-primary text-on-primary text-sm font-medium px-4 py-2 h-9 rounded-md hover:bg-primary/90 disabled:opacity-60 transition-colors"
            >
              {isLoading ? 'Đang lưu…' : 'Lưu'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
