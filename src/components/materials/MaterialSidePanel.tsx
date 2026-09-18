'use client'

import { useState, useEffect, useCallback } from 'react'
import type { SerializedMaterial } from './EditMaterialModal'

interface Transaction {
  id: string
  txType: string
  quantityKg: string
  txDate: string
  note: string | null
  createdAt: string
}

interface Props {
  material: SerializedMaterial
  isOpen: boolean
  onClose: () => void
  onUpdated: () => void // trigger parent to refresh materials
}

export default function MaterialSidePanel({ material, isOpen, onClose, onUpdated }: Props) {
  const [activeTab, setActiveTab] = useState<'info' | 'history'>('info')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Section A: Threshold state
  const [thresholdInput, setThresholdInput] = useState(material.minThreshold ?? '')
  const [isSavingThreshold, setIsSavingThreshold] = useState(false)

  // Section B: Transaction state
  const [txType, setTxType] = useState('in')
  const [quantity, setQuantity] = useState('')
  const [txDate, setTxDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [note, setNote] = useState('')
  const [isAddingTx, setIsAddingTx] = useState(false)

  // Section C: History state
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)

  // Refresh history automatically
  const fetchHistory = useCallback(async () => {
    setIsLoadingHistory(true)
    try {
      const res = await fetch(`/api/materials/${material.id}/transactions`)
      const data = await res.json()
      if (res.ok && data.success) {
        setTransactions(data.transactions.slice(0, 10)) // show top 10
      }
    } catch {
      // silent fail for history
    } finally {
      setIsLoadingHistory(false)
    }
  }, [material.id])

  useEffect(() => {
    if (isOpen) {
      setThresholdInput(material.minThreshold ?? '')
      setTxType('in')
      setQuantity('')
      setTxDate(new Date().toISOString().slice(0, 10))
      setNote('')
      setError(null)
      fetchHistory()
    }
  }, [isOpen, material, fetchHistory])

  if (!isOpen) return null

  // Handlers
  const handleSaveThreshold = async () => {
    setError(null)
    setIsSavingThreshold(true)
    try {
      const val = thresholdInput.trim()
      const numericVal = val === '' ? null : parseFloat(val)
      if (numericVal !== null && (isNaN(numericVal) || numericVal < 0)) {
        setError('Ngưỡng phải là số không âm hoặc để trống.')
        setIsSavingThreshold(false)
        return
      }

      const res = await fetch(`/api/materials/${material.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ minThreshold: numericVal }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error ?? 'Failed to update threshold')
      onUpdated()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi mạng')
    } finally {
      setIsSavingThreshold(false)
    }
  }

  const handleAddTransaction = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsAddingTx(true)
    try {
      const qty = parseFloat(quantity)
      if (isNaN(qty) || qty <= 0) {
        throw new Error('Số lượng phải là số dương.')
      }

      const res = await fetch(`/api/materials/${material.id}/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          txType,
          quantityKg: qty,
          txDate,
          note: note.trim() || null,
        }),
      })

      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error ?? 'Failed to add transaction')

      // Reset form
      setQuantity('')
      setNote('')
      // Refresh
      onUpdated()
      fetchHistory()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi mạng')
    } finally {
      setIsAddingTx(false)
    }
  }

  // Format helpers
  const formatTxType = (type: string) => {
    switch (type) {
      case 'in': return { label: 'Nhập kho', color: 'text-[#15803d]', bg: 'bg-[#f0fdf4]', border: 'border-[#22c55e]/30' }
      case 'out_using': return { label: 'Xuất sử dụng', color: 'text-[#b45309]', bg: 'bg-[#fffbeb]', border: 'border-[#f59e0b]/30' }
      case 'out_broken': return { label: 'Xuất hỏng', color: 'text-error', bg: 'bg-error-container', border: 'border-error/30' }
      case 'out_tape': return { label: 'Xuất bìa', color: 'text-[#b45309]', bg: 'bg-[#fffbeb]', border: 'border-[#f59e0b]/30' }
      case 'out_reject': return { label: 'Xuất reject', color: 'text-error', bg: 'bg-error-container', border: 'border-error/30' }
      default: return { label: type, color: 'text-secondary', bg: 'bg-surface-container', border: 'border-outline-variant' }
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/20 backdrop-blur-[2px] z-40 transition-opacity"
        onClick={onClose}
      />

      {/* Side Panel */}
      <div className="fixed top-0 right-0 h-full w-[400px] max-w-full bg-surface-container-lowest shadow-2xl z-50 flex flex-col border-l border-outline-variant animate-in slide-in-from-right duration-300">
        
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-outline-variant bg-surface">
          <div>
            <h2 className="text-xl font-inter font-semibold text-primary">{material.name}</h2>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-sm text-secondary font-inter">Tồn kho:</p>
              <p className="text-lg font-mono font-semibold text-on-surface">
                {parseFloat(material.currentStock).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} kg
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 -mr-2 text-on-surface-variant hover:text-on-surface rounded-full hover:bg-surface-container transition-colors">
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          
          {error && (
            <div className="p-3 bg-error-container text-error text-sm font-inter rounded-md border border-error/30 flex items-start gap-2">
              <span className="material-symbols-outlined text-[18px]">error</span>
              {error}
            </div>
          )}

          {/* Section A: Threshold */}
          <section className="bg-surface-container-low border border-outline-variant rounded-xl p-4">
            <h3 className="text-label-md font-inter font-semibold text-on-surface mb-3 flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px] text-secondary">notifications</span>
              Ngưỡng cảnh báo
            </h3>
            <div className="flex gap-3">
              <div className="flex-1">
                <input
                  type="number"
                  placeholder="VD: 200"
                  value={thresholdInput}
                  onChange={e => setThresholdInput(e.target.value)}
                  className="w-full h-9 px-3 rounded-md border border-outline-variant bg-surface focus:border-primary focus:outline-none text-sm font-mono transition-colors"
                />
                <p className="text-[11px] text-secondary mt-1 font-inter">Hệ thống cảnh báo khi tồn kho xuống dưới mức này.</p>
              </div>
              <button
                onClick={handleSaveThreshold}
                disabled={isSavingThreshold}
                className="h-9 px-4 bg-primary text-on-primary text-sm font-medium rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50 shrink-0"
              >
                {isSavingThreshold ? 'Lưu...' : 'Save'}
              </button>
            </div>
          </section>

          {/* Section B: Add Transaction */}
          <section>
            <h3 className="text-label-md font-inter font-semibold text-on-surface mb-3 flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px] text-secondary">add_circle</span>
              Thêm giao dịch
            </h3>
            <form onSubmit={handleAddTransaction} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-secondary mb-1">Loại giao dịch <span className="text-error">*</span></label>
                <select
                  value={txType}
                  onChange={e => setTxType(e.target.value)}
                  className="w-full h-9 px-3 rounded-md border border-outline-variant bg-surface focus:border-primary focus:outline-none text-sm font-inter transition-colors"
                >
                  <option value="in">Nhập kho (in)</option>
                  <option value="out_using">Xuất sử dụng (out_using)</option>
                  <option value="out_broken">Xuất hỏng (out_broken)</option>
                  <option value="out_tape">Xuất bìa (out_tape)</option>
                  <option value="out_reject">Xuất reject (out_reject)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-secondary mb-1">Số lượng (kg) <span className="text-error">*</span></label>
                  <input
                    type="number"
                    min={0.01}
                    step={0.01}
                    required
                    value={quantity}
                    onChange={e => setQuantity(e.target.value)}
                    className="w-full h-9 px-3 rounded-md border border-outline-variant bg-surface focus:border-primary focus:outline-none text-sm font-mono transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-secondary mb-1">Ngày <span className="text-error">*</span></label>
                  <input
                    type="date"
                    required
                    value={txDate}
                    onChange={e => setTxDate(e.target.value)}
                    className="w-full h-9 px-3 rounded-md border border-outline-variant bg-surface focus:border-primary focus:outline-none text-sm font-mono transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-secondary mb-1">Ghi chú</label>
                <input
                  type="text"
                  placeholder="Optional"
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  className="w-full h-9 px-3 rounded-md border border-outline-variant bg-surface focus:border-primary focus:outline-none text-sm font-inter transition-colors"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isAddingTx}
                  className="w-full h-9 flex items-center justify-center border border-primary text-primary bg-transparent hover:bg-surface-container text-sm font-medium rounded-md transition-colors disabled:opacity-50"
                >
                  {isAddingTx ? 'Đang thêm...' : 'Thêm giao dịch'}
                </button>
              </div>
            </form>
          </section>

          {/* Section C: History */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-label-md font-inter font-semibold text-on-surface flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px] text-secondary">history</span>
                10 giao dịch gần nhất
              </h3>
            </div>
            
            {isLoadingHistory ? (
              <p className="text-sm text-secondary italic">Đang tải...</p>
            ) : transactions.length === 0 ? (
              <p className="text-sm text-secondary italic">Chưa có giao dịch nào.</p>
            ) : (
              <div className="space-y-2">
                {transactions.map(tx => {
                  const info = formatTxType(tx.txType)
                  const isAdd = tx.txType === 'in'
                  return (
                    <div key={tx.id} className="p-3 bg-surface-container-lowest border border-outline-variant rounded-lg">
                      <div className="flex items-center justify-between mb-1">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-inter font-semibold uppercase tracking-wider border ${info.bg} ${info.color} ${info.border}`}>
                          {info.label}
                        </span>
                        <span className="text-xs font-inter text-secondary">
                          {new Date(tx.txDate).toLocaleDateString('vi-VN')}
                        </span>
                      </div>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-xs font-inter text-secondary truncate max-w-[200px]">
                          {tx.note || <span className="italic">Không ghi chú</span>}
                        </span>
                        <span className={`text-sm font-mono font-semibold ${isAdd ? 'text-[#15803d]' : 'text-[#b45309]'}`}>
                          {isAdd ? '+' : '-'}{parseFloat(tx.quantityKg).toLocaleString('vi-VN')} kg
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>

        </div>
      </div>
    </>
  )
}
