import type { Metadata } from 'next'
import Link from 'next/link'
import { prisma } from '@/lib/db'
import type { OrderTableItem } from '@/types'
import OrderTable from '@/components/orders/OrderTable'
import ImportOrdersModal from '@/components/orders/ImportOrdersModal'

export const metadata: Metadata = {
  title: 'Production Orders — SNY Planner',
  description: 'View and manage all SNY production orders.',
}

export const dynamic = 'force-dynamic'

function KpiCard({ label, value, icon }: { label: string; value: number; icon: string }) {
  return (
    <div className="bg-surface-container-lowest border-[0.5px] border-outline-variant rounded-xl p-lg flex flex-col gap-sm">
      <div className="flex items-center justify-between">
        <span className="text-label-sm font-inter font-medium text-secondary uppercase tracking-widest">
          {label}
        </span>
        <span className="material-symbols-outlined text-[20px] text-outline">{icon}</span>
      </div>
      <p className="text-headline-lg font-inter font-semibold text-on-surface tabular-nums" suppressHydrationWarning>
        {value.toLocaleString('vi-VN')}
      </p>
    </div>
  )
}

export default async function OrdersPage() {
  let orders: OrderTableItem[] = []
  let fetchError: string | null = null
  let totalCustomers = 0

  try {
    const raw = await prisma.productionOrder.findMany({
      orderBy: [
        { orderDate: 'desc' },
        { id: 'desc' },
      ],
      select: {
        id: true,
        piNumber: true,
        subLineIndex: true,
        customer: true,
        customerId: true,
        orderDate: true,
        widthM: true,
        lengthM: true,
        gsm: true,
        color: true,
        itemCode: true,
        lifecycleStatus: true,
        isDraft: true,
        isPlaceholder: true,
        assignments: {
          select: {
            startDate: true,
            endDate: true,
          },
        },
      },
    })

    totalCustomers = await prisma.customer.count()

    orders = raw.map((o) => ({
      ...o,
      orderDate: o.orderDate.toISOString(),
      assignments: o.assignments.map((a) => ({
        startDate: a.startDate.toISOString(),
        endDate: a.endDate.toISOString(),
      })),
    }))
  } catch (err) {
    console.error('[OrdersPage] DB fetch failed:', err)
    fetchError = err instanceof Error ? err.message : 'Unknown database error'
  }

  const now = new Date()
  const totalOrders = orders.length
  const thisMonth = orders.filter((o) => {
    const d = new Date(o.orderDate)
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  }).length

  return (
    <div className="max-w-[1440px] mx-auto px-container-margin py-xl">
      <div className="flex items-start justify-between mb-lg">
        <div>
          <h1 className="text-display font-inter font-semibold text-primary tracking-tight">
            Production orders
          </h1>
          <p className="text-body-md font-noto text-secondary mt-xs">
            Manage and track all manufacturing orders
          </p>
        </div>

        <div className="flex items-center gap-md mt-1">
          <a
            id="btn-download-template"
            href="/api/orders/template"
            download="order_import_template.xlsx"
            className="inline-flex items-center justify-center gap-sm border border-outline-variant bg-surface-container-lowest hover:bg-surface-container text-on-surface text-sm font-medium px-3 py-2 h-9 rounded-md transition-colors"
          >
            <span className="material-symbols-outlined text-[18px] text-primary">download</span>
            Tải mẫu Excel
          </a>
          <ImportOrdersModal />
          <Link
            id="btn-bulk-paste"
            href="/orders/bulk"
            className="inline-flex items-center justify-center gap-sm border border-primary bg-transparent hover:bg-surface-container text-primary text-sm font-medium px-4 py-2 h-9 rounded-md transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">content_paste</span>
            Bulk paste
          </Link>
          <Link
            id="btn-po-summary"
            href="/orders/summary"
            className="inline-flex items-center justify-center gap-sm border border-primary bg-transparent hover:bg-surface-container text-primary text-sm font-medium px-4 py-2 h-9 rounded-md transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">table_chart</span>
            PO Summary
          </Link>
          <Link
            id="btn-new-order"
            href="/orders/new-multi"
            className="inline-flex items-center justify-center gap-sm bg-primary text-on-primary text-sm font-medium px-4 py-2 h-9 rounded-md hover:bg-primary/90 transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            New order
          </Link>
        </div>
      </div>

      {!fetchError && (
        <div className="grid grid-cols-3 gap-md mb-lg">
          <KpiCard label="Total orders" value={totalOrders} icon="receipt_long" />
          <KpiCard label="đơn mới tháng này" value={thisMonth} icon="calendar_month" />
          <KpiCard label="khách hàng" value={totalCustomers} icon="groups" />
        </div>
      )}

      {fetchError && (
        <div
          role="alert"
          className="flex items-start gap-3 border border-error/40 bg-error-container rounded-xl px-5 py-4 mb-lg"
        >
          <span className="material-symbols-outlined text-[20px] text-error shrink-0 mt-0.5">error</span>
          <div>
            <p className="text-label-md font-inter font-semibold text-error">
              Could not load orders
            </p>
            <p className="text-label-sm font-inter text-on-error-container mt-0.5 font-mono">
              {fetchError}
            </p>
            <p className="text-label-sm font-inter text-secondary mt-2">
              Make sure DATABASE_URL is set in .env.local and{' '}
              <code className="text-on-surface-variant">npx prisma db push</code> has been run.
            </p>
          </div>
        </div>
      )}

      {!fetchError && <OrderTable orders={orders} />}
    </div>
  )
}
