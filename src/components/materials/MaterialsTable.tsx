'use client'

// src/components/materials/MaterialsTable.tsx
// Table + row actions for the Materials page.
// Receives serialized materials from parent; all mutations go through parent callbacks.

import type { SerializedMaterial } from './EditMaterialModal'

interface Props {
  materials: SerializedMaterial[]
  onEdit: (material: SerializedMaterial) => void
  onDelete: (material: SerializedMaterial) => void
  onHistory: (material: SerializedMaterial) => void
  onRowClick: (material: SerializedMaterial) => void
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ stock, threshold }: { stock: number; threshold: number | null }) {
  if (threshold === null) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-inter font-semibold bg-surface-container text-secondary border border-outline-variant">
        Chưa đặt ngưỡng
      </span>
    )
  }
  if (stock < threshold) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-inter font-semibold bg-error-container text-error border border-error/30">
        Cần nhập thêm
      </span>
    )
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-inter font-semibold bg-[#f0fdf4] text-[#15803d] border border-[#22c55e]/30">
      Đủ hàng
    </span>
  )
}

// ── Table ─────────────────────────────────────────────────────────────────────

const HEADERS = ['Tên nguyên liệu', 'Tồn kho (kg)', 'Ngưỡng tối thiểu (kg)', 'Trạng thái', 'Ghi chú', 'Actions']

export default function MaterialsTable({ materials, onEdit, onDelete, onHistory, onRowClick }: Props) {
  if (materials.length === 0) {
    return (
      <div className="bg-surface-container-lowest border-[0.5px] border-outline-variant rounded-lg">
        <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
          <span className="material-symbols-outlined text-[48px] text-outline mb-4">inventory_2</span>
          <p className="text-body-md font-noto text-on-surface-variant">
            Chưa có nguyên liệu nào. Bấm &apos;Add material&apos; để bắt đầu.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-surface-container-lowest border-[0.5px] border-outline-variant rounded-lg overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="bg-surface-container border-b-[0.5px] border-outline-variant">
            {HEADERS.map((h) => (
              <th
                key={h}
                className="px-4 py-3 text-left text-xs font-inter font-medium text-secondary uppercase tracking-widest whitespace-nowrap"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-outline-variant/50">
          {materials.map((mat) => {
            const stock     = parseFloat(mat.currentStock)
            const threshold = mat.minThreshold != null ? parseFloat(mat.minThreshold) : null

            return (
              <tr
                key={mat.id}
                onClick={() => onRowClick(mat)}
                className="hover:bg-[#f0eded] cursor-pointer transition-colors duration-150"
              >
                {/* Tên nguyên liệu */}
                <td className="px-4 py-3 font-mono text-sm font-semibold text-on-surface whitespace-nowrap">
                  {mat.name}
                </td>

                {/* Tồn kho — red if below threshold */}
                <td className={`px-4 py-3 font-mono text-sm tabular-nums whitespace-nowrap ${threshold !== null && stock < threshold ? 'text-error font-semibold' : 'text-on-surface'}`}>
                  {stock.toLocaleString('vi-VN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                </td>

                {/* Ngưỡng tối thiểu */}
                <td className="px-4 py-3 font-mono text-sm text-on-surface-variant tabular-nums whitespace-nowrap">
                  {threshold != null
                    ? threshold.toLocaleString('vi-VN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
                    : <span className="italic text-outline">—</span>}
                </td>

                {/* Trạng thái */}
                <td className="px-4 py-3">
                  <StatusBadge stock={stock} threshold={threshold} />
                </td>

                {/* Ghi chú */}
                <td className="px-4 py-3 text-sm text-on-surface-variant max-w-[200px] truncate">
                  {mat.note ?? <span className="italic text-outline">—</span>}
                </td>

                {/* Actions */}
                <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); onHistory(mat) }}
                      title="Lịch sử xuất nhập"
                      className="inline-flex items-center justify-center w-8 h-8 rounded-md border border-outline-variant text-secondary bg-transparent hover:bg-surface-container transition-colors"
                    >
                      <span className="material-symbols-outlined text-[16px]">history</span>
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onEdit(mat) }}
                      title="Chỉnh sửa"
                      className="inline-flex items-center justify-center w-8 h-8 rounded-md border border-primary text-primary bg-transparent hover:bg-surface-container transition-colors"
                    >
                      <span className="material-symbols-outlined text-[16px]">edit</span>
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onDelete(mat) }}
                      title="Xóa"
                      className="inline-flex items-center justify-center w-8 h-8 rounded-md border border-[#ba1a1a] text-[#ba1a1a] bg-transparent hover:bg-[#ba1a1a]/10 transition-colors"
                    >
                      <span className="material-symbols-outlined text-[16px]">delete</span>
                    </button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {/* Footer */}
      <div className="border-t-[0.5px] border-outline-variant px-4 py-2 bg-surface-container">
        <p className="text-xs font-inter text-secondary">
          {materials.length} nguyên liệu
        </p>
      </div>
    </div>
  )
}
