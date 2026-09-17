'use client'

// src/components/orders/OrderTable.tsx
// Client component: renders the production orders table with live search.
// R1 redesign — light theme, navy PI badge, color dots, hover View button.
// All search/navigation logic unchanged from S1/S3.

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import type { SerializedProductionOrder } from '@/types'
import { OrderStatus, calcOrderStatus } from '@/lib/orderStatus'
import OrderStatusBadge from './OrderStatusBadge'
import DraftBadge from './DraftBadge'

interface OrderTableProps {
  orders: SerializedProductionOrder[]
}

/** Format an ISO date string as DD/MM/YYYY */
function formatDate(iso: string): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

/**
 * Simple map of colour names → CSS hex for the colour swatch dot.
 * Falls back to outline for unknown colours.
 */
const COLOR_MAP: Record<string, string> = {
  BLACK:         '#1e293b',
  WHITE:         '#e2e8f0',
  RED:           '#ef4444',
  BLUE:          '#3b82f6',
  'NAVY BLUE':   '#1e3a5f',
  GREY:          '#6b7280',
  'GREY MELANGE':'#9ca3af',
  GREEN:         '#22c55e',
  YELLOW:        '#eab308',
  ORANGE:        '#f97316',
}

export default function OrderTable({ orders }: OrderTableProps) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'ALL' | OrderStatus>('ALL')

  const ordersWithStatus = useMemo(() => {
    return orders.map(o => ({
      ...o,
      calculatedStatus: calcOrderStatus(o.assignments),
    }))
  }, [orders])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    let result = ordersWithStatus

    if (statusFilter !== 'ALL') {
      result = result.filter(o => o.calculatedStatus === statusFilter)
    }

    if (!q) return result
    const isNum = /^\d+$/.test(q)
    const numQuery = isNum ? parseInt(q, 10) : null

    return result.filter(
      (o) =>
        o.piNumber.toLowerCase().includes(q) ||
        o.customer.toLowerCase().includes(q) ||
        (o.color != null && o.color.toLowerCase().includes(q)) ||
        (numQuery !== null && o.gsm === numQuery),
    )
  }, [ordersWithStatus, query, statusFilter])

  return (
    <div className="space-y-md">

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 border-b border-outline-variant pb-2">
        {(['ALL', 'PENDING', 'SCHEDULED', 'RUNNING', 'DONE'] as const).map((tab) => {
          const isActive = statusFilter === tab
          const label = 
            tab === 'ALL' ? 'Tất cả' :
            tab === 'PENDING' ? 'Chưa lên lịch' :
            tab === 'SCHEDULED' ? 'Đã lên lịch' :
            tab === 'RUNNING' ? 'Đang sản xuất' : 'Hoàn thành'
            
          return (
            <button
              key={tab}
              onClick={() => setStatusFilter(tab)}
              className={`px-4 py-2 text-sm font-medium rounded-t-md transition-colors border-b-2 -mb-[9px] ${
                isActive 
                  ? 'border-primary text-primary bg-surface-container' 
                  : 'border-transparent text-secondary hover:text-on-surface hover:bg-surface-container-lowest'
              }`}
            >
              {label}
            </button>
          )
        })}
      </div>

      {/* Search + count row */}
      <div className="flex items-center gap-md pt-2">
        {/* Search input */}
        <div className="relative flex-1 max-w-md">
          <span className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-outline">
            <span className="material-symbols-outlined text-[18px]">search</span>
          </span>
          <input
            id="search-orders"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm theo PI Number, Khách hàng, Màu sắc, GSM..."
            className="w-full bg-surface-container-lowest border-[0.5px] border-outline-variant rounded pl-9 pr-4 py-[10px] text-body-md font-noto text-on-surface placeholder:text-outline focus:outline-none focus:border-b-2 focus:border-primary transition-colors"
            aria-label="Search orders by PI Number, Customer, Color, GSM"
          />
        </div>

        {/* Count */}
        <p className="text-label-sm font-inter text-secondary shrink-0">
          Showing{' '}
          <span className="font-semibold text-on-surface">{filtered.length}</span>
          {' '}of{' '}
          <span className="font-semibold text-on-surface">{orders.length}</span>
          {' '}orders
        </p>
      </div>

      {/* True empty state — no orders in DB at all */}
      {orders.length === 0 ? (
        <div className="bg-surface-container-lowest border-[0.5px] border-outline-variant rounded-lg">
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <span className="material-symbols-outlined text-[48px] text-outline mb-4">description</span>
            <p className="text-body-md font-noto font-medium text-on-surface mb-1">
              {/* Chưa có đơn hàng nào */}
              Ch&#432;a c&#243; &#273;&#417;n h&#224;ng n&#224;o
            </p>
            <p className="text-label-sm font-inter text-secondary">
              {/* Bấm 'New order' để bắt đầu */}
              B&#7845;m &apos;New order&apos; &#273;&#7875; b&#7855;t &#273;&#7847;u
            </p>
          </div>
        </div>
      ) : (
        /* Table card */
        <div className="bg-surface-container-lowest border-[0.5px] border-outline-variant rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-surface-container border-b border-[0.5px] border-outline-variant">
                  {['PI Number', 'Status', 'Customer', 'Order Date', 'Width (m)', 'Length (m)', 'GSM', 'Color', ''].map((h) => (
                    <th
                      key={h}
                      className={`px-md py-sm text-left text-label-sm font-inter font-medium text-secondary uppercase tracking-widest ${
                        ['Width (m)', 'Length (m)', 'GSM'].includes(h) ? 'text-right' : ''
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[0.5px] divide-outline-variant">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-md py-[48px] text-center">
                      <div className="flex flex-col items-center gap-sm">
                        <span className="material-symbols-outlined text-[40px] text-outline-variant">search_off</span>
                        <p className="text-body-md font-noto text-secondary">No orders found</p>
                        {query && (
                          <button
                            onClick={() => setQuery('')}
                            className="text-label-sm font-inter text-primary hover:underline"
                          >
                            Clear search
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  filtered.map((order) => (
                    <tr
                      key={`${order.piNumber}-${order.subLineIndex}`}
                      className="group hover:bg-[#f0eded] cursor-pointer transition-colors duration-150"
                      onClick={() => router.push(`/orders/${order.id}`)}
                      role="button"
                      aria-label={`View order ${order.piNumber}`}
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ')
                          router.push(`/orders/${order.id}`)
                      }}
                    >
                      {/* PI Number — navy badge */}
                      <td className="px-md py-sm whitespace-nowrap">
                        <div className="flex items-center gap-sm">
                          <span className="bg-primary text-on-primary rounded text-label-sm font-inter font-medium px-sm py-xs">
                            {order.piNumber}
                          </span>
                          {order.subLineIndex > 0 && (
                            <span className="text-label-sm font-inter text-outline bg-surface-container rounded px-xs py-xs">
                              /{order.subLineIndex}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Status Badge */}
                      <td className="px-md py-sm whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          {order.isDraft && <DraftBadge />}
                          <OrderStatusBadge status={order.calculatedStatus} />
                        </div>
                      </td>

                      {/* Customer */}
                      <td className="px-md py-sm text-body-md font-noto text-on-surface whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          {order.customer}
                          {order.customerId === null && (
                            <span className="text-[10px] font-medium bg-[#F59E0B]/10 text-[#D97706] px-1.5 py-0.5 rounded uppercase tracking-wider" title="Khách hàng này chưa có trong danh sách — vào Customers để thêm">
                              KH mới
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Order Date */}
                      <td className="px-md py-sm text-label-md font-inter text-on-surface-variant whitespace-nowrap tabular-nums">
                        {formatDate(order.orderDate)}
                      </td>

                      {/* Width */}
                      <td className="px-md py-sm text-right text-type-mono font-mono text-on-surface tabular-nums">
                        {order.widthM != null ? Number(order.widthM).toFixed(1) : <span className="text-outline italic">—</span>}
                      </td>

                      {/* Length */}
                      <td className="px-md py-sm text-right text-type-mono font-mono text-on-surface tabular-nums">
                        {order.lengthM != null ? Number(order.lengthM).toLocaleString() : <span className="text-outline italic">—</span>}
                      </td>

                      {/* GSM */}
                      <td className="px-md py-sm text-right text-type-mono font-mono text-on-surface tabular-nums">
                        {order.gsm != null ? order.gsm : <span className="text-outline italic">—</span>}
                      </td>

                      {/* Color — dot + name */}
                      <td className="px-md py-sm">
                        {order.color ? (
                          <span className="inline-flex items-center gap-sm">
                            <span
                              className="w-3 h-3 rounded-full border border-gray-300 shrink-0"
                              style={{ backgroundColor: COLOR_MAP[order.color.toUpperCase()] ?? '#73777f' }}
                              aria-hidden="true"
                            />
                            <span className="text-body-md font-noto text-on-surface">
                              {order.color}
                            </span>
                          </span>
                        ) : (
                          <span className="text-outline italic">—</span>
                        )}
                      </td>

                      {/* Action — View button, visible on row hover */}
                      <td className="px-md py-sm text-right whitespace-nowrap">
                        <span className="opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center gap-xs text-label-sm font-inter text-primary border border-[0.5px] border-outline-variant rounded px-sm py-xs hover:bg-surface-container">
                          <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                          View
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Table footer */}
          {filtered.length > 0 && (
            <div className="border-t border-[0.5px] border-outline-variant px-md py-sm bg-surface-container">
              <p className="text-label-sm font-inter text-secondary">
                Showing {filtered.length} of {orders.length} orders
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
