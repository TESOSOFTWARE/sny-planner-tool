// src/app/orders/new-multi/page.tsx
// Multi-sub-line order entry page — enter all sub-lines of a PI in one form.

import type { Metadata } from 'next'
import Link from 'next/link'
import MultiLineOrderForm from '@/components/orders/MultiLineOrderForm'

export const metadata: Metadata = {
  title: 'New Production Order — SNY Planner',
  description: 'Tạo đơn hàng sản xuất mới.',
}

export default function NewMultiOrderPage() {
  return (
    <div className="max-w-[1100px] mx-auto px-8 py-8">

      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="mb-6">
        <ol className="flex items-center gap-2 text-sm font-inter text-on-surface-variant">
          <li>
            <Link href="/orders" className="hover:text-primary transition-colors">
              Production orders
            </Link>
          </li>
          <li aria-hidden="true">
            <span className="material-symbols-outlined text-[16px] text-outline">chevron_right</span>
          </li>
          <li className="text-on-surface font-medium" aria-current="page">
            New production order
          </li>
        </ol>
      </nav>

      {/* Page title */}
      <div className="mb-6">
        <h1 className="text-2xl font-inter font-semibold text-primary tracking-tight">
          Tạo đơn hàng mới
        </h1>
        <p className="text-sm font-noto text-secondary mt-1">
          Nhập 1 hoặc nhiều sub-line của cùng một PI Number — 1 dòng = 1 đơn hàng.
        </p>
      </div>

      {/* Form card */}
      <div className="bg-surface rounded-lg">
        <MultiLineOrderForm />
      </div>
    </div>
  )
}
