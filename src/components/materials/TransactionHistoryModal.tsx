'use client'

// src/components/materials/TransactionHistoryModal.tsx
// Shows all transactions for a material with summary stats + delete capability.
// Also opens AddTransactionModal for manual entries.

import { useState, useEffect, useCallback } from 'react'
import type { SerializedMaterial } from './EditMaterialModal'
import AddTransactionModal from './AddTransactionModal'

interface Props {
  material: SerializedMaterial
  onClose: () => void
  onStockChanged: () => void // refresh parent after stock changes
}

interface SerializedTransaction {
  id: string
  txType: string
  quantityKg: string
  txDate: string
  mbPct: string | null
  orderId: string | null
  note: string | null
  createdAt: string
}

const TX_LABEL: Record<string, string> = {
  in:          'Nhập kho',
  out_using:   'Xuất SD',
  out_broken:  'Xuất hỏng',
  out_tape:    'Xuất tape',
  out_reject:  'Reject',
}

function TxBadge({ txType }: { txType: string }) {
  const isIn = txType === 'in'
  const label = TX_LABEL[txType] ?? txType

  if (isIn) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-[#f0fdf4] text-[#15803d] border border-[#22c55e]/30 whitespace-nowrap">
        ↑ {label}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-error-container text-error border border-error/30 whitespace-nowrap">
      ↓ {label}
    </span>
  )
}

function formatDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function TransactionHistoryModal({ material, onClose, onStockChanged }: Props) {
  const [transactions, setTransactions] = useState<SerializedTransaction[]>([])
  const [isLoading, setIsLoading]       = useState(true)
  const [error, setError]               = useState<string | null>(null)
  const [deletingId, setDeletingId]     = useState<string | null>(null)
  const [showAddTx, setShowAddTx]       = useState(false)

  const fetchTx = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/materials/${material.id}/transactions`)
      const data = await res.json() as { success: boolean; transactions?: SerializedTransaction[]; error?: string }
      if (!res.ok || !data.success) { setError(data.error ?? 'Không thể tải lịch sử.'); return }
      setTransactions(data.transactions ?? [])
    } catch {
      setError('Lỗi mạng — không thể kết nối máy chủ.')
    } finally {
      setIsLoading(false)
    }
  }, [material.id])

  useEffect(() => { fetchTx() }, [fetchTx])

  const handleDelete = async (txId: string) => {
    setDeletingId(txId)
    try {
      const res = await fetch(`/api/materials/${material.id}/transactions/${txId}`, { method: 'DELETE' })
      const data = await res.json() as { success: boolean; error?: string }
      if (!res.ok || !data.success) { alert(data.error ?? 'Không thể xóa giao dịch.'); return }
      await fetchTx()
      onStockChanged()
    } catch {
      alert('Lỗi mạng.')
    } finally {
      setDeletingId(null)
    }
  }

  // Summary stats
  const totalIn  = transactions
    .filter(t => t.txType === 'in')
    .reduce((s, t) => s + parseFloat(t.quantityKg), 0)
  const totalOut = transactions
    .filter(t => t.txType !== 'in')
    .reduce((s, t) => s + parseFloat(t.quantityKg), 0)
  const currentStock = parseFloat(material.currentStock)

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
        onClick={onClose}
      >
        <div
          className="bg-surface rounded-xl shadow-lg w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-6 py-4 border-b-[0.5px] border-outline-variant flex justify-between items-center shrink-0">
            <div>
              <h3 className="text-base font-inter font-semibold text-on-surface">Lịch sử xuất nhập</h3>
              <p className="text-xs text-secondary font-mono mt-0.5">{material.name}</p>
            </div>
            <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface transition-colors">
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>

          {/* Summary strip */}
          <div className="px-6 py-3 bg-surface-container-low border-b-[0.5px] border-outline-variant shrink-0">
            <div className="flex gap-6 text-sm">
              <div>
                <span className="text-secondary mr-1">Tồn hiện tại:</span>
                <span className={`font-mono font-semibold ${currentStock < 0 ? 'text-error' : 'text-primary'}`}>
                  {currentStock.toLocaleString('vi-VN', { maximumFractionDigits: 2 })} kg
                </span>
              </div>
              <div>
                <span className="text-secondary mr-1">Tổng nhập:</span>
                <span className="font-mono text-[#15803d] font-semibold">
                  +{totalIn.toLocaleString('vi-VN', { maximumFractionDigits: 2 })} kg
                </span>
              </div>
              <div>
                <span className="text-secondary mr-1">Tổng xuất:</span>
                <span className="font-mono text-error font-semibold">
                  -{totalOut.toLocaleString('vi-VN', { maximumFractionDigits: 2 })} kg
                </span>
              </div>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <svg className="w-5 h-5 animate-spin text-primary" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
              </div>
            ) : error ? (
              <div className="p-4 text-sm text-error">{error}</div>
            ) : transactions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-secondary text-sm">
                <span className="material-symbols-outlined text-[36px] mb-2 text-outline">history</span>
                Chưa có giao dịch nào.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-surface-container border-b-[0.5px] border-outline-variant">
                  <tr>
                    {['Ngày', 'Loại', 'Số kg', '% MB', 'Mã đơn', 'Ghi chú', ''].map(h => (
                      <th key={h} className="px-4 py-2 text-left text-xs font-inter font-medium text-secondary uppercase tracking-widest whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/50">
                  {transactions.map(tx => (
                    <tr key={tx.id} className="hover:bg-[#f0eded] transition-colors">
                      <td className="px-4 py-2 font-mono text-xs whitespace-nowrap">{formatDate(tx.txDate)}</td>
                      <td className="px-4 py-2 whitespace-nowrap"><TxBadge txType={tx.txType} /></td>
                      <td className="px-4 py-2 font-mono text-xs tabular-nums whitespace-nowrap">
                        {parseFloat(tx.quantityKg).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} kg
                      </td>
                      <td className="px-4 py-2 font-mono text-xs text-on-surface-variant">
                        {tx.mbPct ? `${parseFloat(tx.mbPct)}%` : '—'}
                      </td>
                      <td className="px-4 py-2 font-mono text-xs text-on-surface-variant">
                        {tx.orderId ?? '—'}
                      </td>
                      <td className="px-4 py-2 text-xs text-on-surface-variant max-w-[150px] truncate">
                        {tx.note ?? '—'}
                      </td>
                      <td className="px-4 py-2">
                        <button
                          onClick={() => handleDelete(tx.id)}
                          disabled={deletingId === tx.id}
                          title="Xóa giao dịch"
                          className="inline-flex items-center justify-center w-7 h-7 rounded border border-[#ba1a1a] text-[#ba1a1a] bg-transparent hover:bg-[#ba1a1a]/10 transition-colors disabled:opacity-40"
                        >
                          <span className="material-symbols-outlined text-[14px]">delete</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-3 border-t-[0.5px] border-outline-variant bg-surface-container-low shrink-0 flex justify-between items-center">
            <span className="text-xs text-secondary">{transactions.length} giao dịch</span>
            <button
              onClick={() => setShowAddTx(true)}
              className="inline-flex items-center gap-2 bg-primary text-on-primary text-sm font-medium px-4 py-2 h-9 rounded-md hover:bg-primary/90 transition-colors"
            >
              <span className="material-symbols-outlined text-[16px]">add</span>
              Nhập / Xuất kho
            </button>
          </div>
        </div>
      </div>

      {/* Nested AddTransactionModal */}
      {showAddTx && (
        <AddTransactionModal
          material={material}
          onAdded={() => { fetchTx(); onStockChanged() }}
          onClose={() => setShowAddTx(false)}
        />
      )}
    </>
  )
}
