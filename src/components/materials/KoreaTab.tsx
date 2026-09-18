'use client'

import { useState, useMemo } from 'react'
import type { SerializedMaterial } from './EditMaterialModal'

interface Props {
  materials: SerializedMaterial[] // pre-filtered to KOREA
  onEdit: (material: SerializedMaterial) => void
  onDelete: (material: SerializedMaterial) => void
  onHistory: (material: SerializedMaterial) => void
  onRowClick: (material: SerializedMaterial) => void
  onImport: () => void
}

function StatusBadge({ stock, threshold }: { stock: number; threshold: number | null }) {
  if (threshold === null) {
    return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-inter font-semibold bg-surface-container text-secondary border border-outline-variant">Chưa đặt ngưỡng</span>
  }
  if (stock < threshold) {
    return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-inter font-semibold bg-error-container text-error border border-error/30">Cần nhập thêm</span>
  }
  return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-inter font-semibold bg-[#f0fdf4] text-[#15803d] border border-[#22c55e]/30">Đủ hàng</span>
}

export default function KoreaTab({ materials, onEdit, onDelete, onHistory, onRowClick, onImport }: Props) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return materials
    return materials.filter(m => m.name.toLowerCase().includes(q))
  }, [materials, query])

  return (
    <div className="space-y-4">
      {/* Tab Header Actions */}
      <div className="flex items-center justify-between">
        <div className="relative w-72">
          <span className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-outline">
            <span className="material-symbols-outlined text-[18px]">search</span>
          </span>
          <input
            type="search"
            placeholder="Tìm kiếm NVL Korea & Khác..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="w-full bg-surface-container-lowest border-[0.5px] border-outline-variant rounded pl-9 pr-4 py-2 text-sm text-on-surface focus:outline-none focus:border-primary transition-colors"
          />
        </div>

        <div className="flex gap-2">
          <a
            href="/api/materials/template/korea"
            className="inline-flex items-center gap-2 px-4 py-2 border border-outline text-on-surface-variant hover:bg-surface-container-lowest rounded-md text-sm font-medium transition-colors"
            download
          >
            <span className="material-symbols-outlined text-[18px]">download</span>
            Tải mẫu Korea
          </a>
          <button
            onClick={onImport}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-on-primary hover:bg-primary/90 rounded-md text-sm font-medium transition-colors shadow-sm"
          >
            <span className="material-symbols-outlined text-[18px]">upload</span>
            Import báo cáo Korea
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-surface-container-lowest border-[0.5px] border-outline-variant rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-surface-container border-b-[0.5px] border-outline-variant">
              {['Tên NVL', 'Tồn kho (kg)', 'Ngưỡng TT (kg)', 'Trạng thái', 'Ghi chú', 'Actions'].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-inter font-medium text-secondary uppercase tracking-widest whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/50">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-secondary">
                  Không tìm thấy nguyên liệu nào.
                </td>
              </tr>
            ) : (
              filtered.map((mat) => {
                const stock = parseFloat(mat.currentStock)
                const threshold = mat.minThreshold != null ? parseFloat(mat.minThreshold) : null

                return (
                  <tr
                    key={mat.id}
                    onClick={() => onRowClick(mat)}
                    className="hover:bg-[#f0eded] cursor-pointer transition-colors duration-150"
                  >
                    <td className="px-4 py-3 font-mono text-sm font-semibold text-on-surface whitespace-nowrap">
                      {mat.name}
                    </td>
                    <td className={`px-4 py-3 font-mono text-sm tabular-nums whitespace-nowrap ${threshold !== null && stock < threshold ? 'text-error font-semibold' : 'text-on-surface'}`}>
                      {stock.toLocaleString('vi-VN')}
                    </td>
                    <td className="px-4 py-3 font-mono text-sm text-on-surface-variant tabular-nums whitespace-nowrap">
                      {threshold != null ? threshold.toLocaleString('vi-VN') : <span className="italic text-outline">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge stock={stock} threshold={threshold} />
                    </td>
                    <td className="px-4 py-3 text-sm text-on-surface-variant max-w-[200px] truncate">
                      {mat.note ?? <span className="italic text-outline">—</span>}
                    </td>
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-2">
                        <button onClick={() => onHistory(mat)} title="Lịch sử" className="inline-flex items-center justify-center w-8 h-8 rounded-md border border-outline-variant text-secondary bg-transparent hover:bg-surface-container">
                          <span className="material-symbols-outlined text-[16px]">history</span>
                        </button>
                        <button onClick={() => onEdit(mat)} title="Chỉnh sửa" className="inline-flex items-center justify-center w-8 h-8 rounded-md border border-primary text-primary bg-transparent hover:bg-surface-container">
                          <span className="material-symbols-outlined text-[16px]">edit</span>
                        </button>
                        <button onClick={() => onDelete(mat)} title="Xóa" className="inline-flex items-center justify-center w-8 h-8 rounded-md border border-[#ba1a1a] text-[#ba1a1a] bg-transparent hover:bg-[#ba1a1a]/10">
                          <span className="material-symbols-outlined text-[16px]">delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
