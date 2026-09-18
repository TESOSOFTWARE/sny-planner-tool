'use client'

// src/components/materials/EditMaterialModal.tsx
// Modal for editing an existing material. Name is read-only.

import { useState } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SerializedMaterial {
  id: string
  name: string
  group: 'HDPE' | 'MB' | 'KOREA'
  color: string | null
  brand: string | null
  currentStock: string
  minThreshold: string | null  // null = chưa đặt ngưỡng
  unit: string
  note: string | null
  createdAt: string
  updatedAt: string
}

interface Props {
  material: SerializedMaterial
  onUpdated: () => void
  onClose: () => void
}

export default function EditMaterialModal({ material, onUpdated, onClose }: Props) {
  const [group, setGroup]               = useState<'HDPE' | 'MB' | 'KOREA'>(material.group)
  const [color, setColor]               = useState(material.color ?? '')
  const [brand, setBrand]               = useState(material.brand ?? '')
  const [currentStock, setCurrentStock] = useState(parseFloat(material.currentStock).toString())
  const [minThreshold, setMinThreshold] = useState(
    material.minThreshold != null ? parseFloat(material.minThreshold).toString() : ''
  )
  const [note, setNote]                 = useState(material.note ?? '')
  const [error, setError]               = useState('')
  const [isLoading, setIsLoading]       = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    const stock = parseFloat(currentStock)
    if (isNaN(stock) || stock < 0) { setError('Tồn kho phải là số không âm'); return }
    // minThreshold is optional — null means "chưa đặt ngưỡng"
    const threshold = minThreshold.trim() === '' ? null : parseFloat(minThreshold)
    if (threshold !== null && (isNaN(threshold) || threshold < 0)) {
      setError('Ngưỡng tối thiểu phải là số không âm')
      return
    }

    setIsLoading(true)
    try {
      const res = await fetch(`/api/materials/${material.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          group,
          color: color.trim() || null,
          brand: brand.trim() || null,
          currentStock: stock,
          minThreshold: threshold,
          note: note.trim() || null,
        }),
      })

      const data = await res.json() as { success: boolean; error?: string }
      if (!res.ok || !data.success) {
        setError(data.error ?? 'Không thể cập nhật nguyên liệu.')
        return
      }

      onUpdated()
      onClose()
    } catch {
      setError('Lỗi mạng — không thể kết nối máy chủ.')
    } finally {
      setIsLoading(false)
    }
  }

  const inputCls = () =>
    'w-full h-10 px-3 rounded-lg border-[0.5px] border-outline bg-surface text-on-surface text-sm ' +
    'focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-surface rounded-xl shadow-lg w-full max-w-md overflow-hidden">

        {/* Header */}
        <div className="px-6 py-4 border-b-[0.5px] border-outline-variant flex justify-between items-center">
          <h3 className="text-base font-inter font-semibold text-on-surface">Edit material</h3>
          <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface transition-colors">
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">

          {/* Error banner */}
          {error && (
            <div className="p-3 rounded-lg bg-[#FFF8E7] border border-[#F59E0B] text-[#92400E] text-sm">
              {error}
            </div>
          )}

          {/* Name (readonly) */}
          <div>
            <label className="block text-xs font-medium text-secondary mb-1">Tên nguyên liệu</label>
            <input
              type="text"
              readOnly
              value={material.name}
              className={inputCls() + ' bg-surface-container opacity-60 cursor-not-allowed'}
            />
          </div>

          {/* Group */}
          <div>
            <label className="block text-xs font-medium text-secondary mb-1">
              Nhóm NVL <span className="text-error">*</span>
            </label>
            <select
              value={group}
              onChange={e => setGroup(e.target.value as 'HDPE' | 'MB' | 'KOREA')}
              className={inputCls()}
            >
              <option value="HDPE">HDPE</option>
              <option value="MB">Masterbatch (MB)</option>
              <option value="KOREA">Korea & Khác</option>
            </select>
          </div>

          {/* Màu và Hãng (chỉ hiện khi nhóm MB) */}
          {group === 'MB' && (
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-xs font-medium text-secondary mb-1">Màu sắc</label>
                <input
                  type="text"
                  value={color}
                  onChange={e => setColor(e.target.value)}
                  placeholder="e.g. ORANGE"
                  className={inputCls()}
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-secondary mb-1">Hãng sản xuất</label>
                <input
                  type="text"
                  value={brand}
                  onChange={e => setBrand(e.target.value)}
                  placeholder="e.g. ARIRANG"
                  className={inputCls()}
                />
              </div>
            </div>
          )}

          {/* Tồn kho + Ngưỡng tối thiểu */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-secondary mb-1">
                Tồn kho hiện tại (kg) <span className="text-error">*</span>
              </label>
              <input
                id="edit-material-stock"
                type="number"
                required
                min={0}
                step={0.01}
                value={currentStock}
                onChange={e => setCurrentStock(e.target.value)}
                className={inputCls()}
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-secondary mb-1">
                Ngưỡng tối thiểu (kg)
              </label>
              <input
                id="edit-material-threshold"
                type="number"
                min={0}
                step={0.01}
                value={minThreshold}
                onChange={e => setMinThreshold(e.target.value)}
                placeholder="Để trống = chưa đặt ngưỡng"
                className={inputCls()}
              />
            </div>
          </div>

          {/* Ghi chú */}
          <div>
            <label className="block text-xs font-medium text-secondary mb-1">Ghi chú</label>
            <input
              id="edit-material-note"
              type="text"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Ghi chú tuỳ chọn…"
              className={inputCls()}
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center justify-center border border-primary bg-transparent hover:bg-surface-container text-primary text-sm font-medium px-4 py-2 h-9 rounded-md transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="inline-flex items-center justify-center bg-primary text-on-primary text-sm font-medium px-4 py-2 h-9 rounded-md hover:bg-primary/90 disabled:opacity-60 transition-colors"
            >
              {isLoading ? 'Đang lưu…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
