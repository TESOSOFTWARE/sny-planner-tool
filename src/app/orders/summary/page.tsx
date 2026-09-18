// src/app/orders/summary/page.tsx
// Server component — PO Summary view.
// Fetches all ProductionOrder records, passes them to the client POSummaryTable
// which groups by piNumber and handles expand/collapse + search.

import type { Metadata } from 'next'
import Link from 'next/link'
import { prisma } from '@/lib/db'
import type { SerializedProductionOrder } from '@/types'
import POSummaryTable from '@/components/orders/POSummaryTable'

export const metadata: Metadata = {
  title: 'PO Summary — SNY Planner',
  description: 'View all production orders grouped by PI Number.',
}

export const dynamic = 'force-dynamic'

export default async function POSummaryPage() {
  let orders: SerializedProductionOrder[] = []
  let fetchError: string | null = null

  try {
    const raw = await prisma.productionOrder.findMany({
      orderBy: [{ piNumber: 'asc' }, { subLineIndex: 'asc' }],
      include: { assignments: { select: { startDate: true, endDate: true } } },
    })

    orders = raw.map((o) => ({
      ...o,
      orderDate:     o.orderDate.toISOString(),
      createdAt:     o.createdAt.toISOString(),
      updatedAt:     o.updatedAt.toISOString(),
      uvPct:         o.uvPct         != null ? o.uvPct.toFixed(2)         : null,
      rollLength:    o.rollLength    != null ? o.rollLength.toFixed(2)    : null,
      pieceLength:   o.pieceLength   != null ? o.pieceLength.toFixed(2)   : null,
      qtySqm:        o.qtySqm        != null ? o.qtySqm.toFixed(2)        : null,
      totalWeightKgs: o.totalWeightKgs != null ? o.totalWeightKgs.toFixed(2) : null,
      requiredYarnKg: o.requiredYarnKg != null ? o.requiredYarnKg.toFixed(2) : null,
      deliveryDate: o.deliveryDate != null ? o.deliveryDate.toISOString() : null,
      frPct: o.frPct != null ? o.frPct.toString() : null,
      assignments: o.assignments.map(a => ({
        startDate: a.startDate.toISOString(),
        endDate: a.endDate.toISOString(),
      })),
    })) as SerializedProductionOrder[]
  } catch (err) {
    console.error('[PO_SUMMARY_PAGE]', err)
    fetchError = 'Không thể tải dữ liệu đơn hàng. Vui lòng thử lại.'
  }

  return (
    <div className="px-xl py-lg space-y-lg max-w-[1600px]">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-xs text-label-sm font-inter text-secondary">
        <Link href="/orders" className="hover:text-on-surface transition-colors">
          Production
        </Link>
        <span className="material-symbols-outlined text-[14px]">chevron_right</span>
        <span className="text-on-surface">PO Summary</span>
      </nav>

      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-headline-md font-inter font-semibold text-on-surface">
            PO Summary
          </h1>
          <p className="text-body-sm font-inter text-secondary mt-xs">
            Tất cả đơn hàng nhóm theo PI Number — nhấn để xem chi tiết từng dòng.
          </p>
        </div>
        <Link
          href="/orders"
          className="inline-flex items-center justify-center gap-sm border border-primary bg-transparent hover:bg-surface-container text-primary text-sm font-medium px-4 py-2 h-9 rounded-md transition-colors shrink-0"
        >
          <span className="material-symbols-outlined text-[18px]">arrow_back</span>
          Danh sách đơn
        </Link>
      </div>

      {/* Error state */}
      {fetchError && (
        <div className="p-md rounded-xl border border-[#F59E0B] bg-[#FFF8E7] text-[#92400E] text-body-sm font-inter">
          {fetchError}
        </div>
      )}

      {/* Summary table */}
      {!fetchError && <POSummaryTable orders={orders} />}
    </div>
  )
}
