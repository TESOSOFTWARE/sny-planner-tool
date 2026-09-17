'use client'

// src/components/orders/DraftBadge.tsx
// Reusable amber badge for draft orders (Sprint F1).
// Rendered in parallel with OrderStatusBadge on OrderTable, OrderDetail, and POSummaryTable.

export default function DraftBadge() {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-[#FFF8E7] text-[#D97706] border border-[#F59E0B]/30 whitespace-nowrap">
      <span className="material-symbols-outlined text-[13px] leading-none">edit_note</span>
      NHÁP
    </span>
  )
}
