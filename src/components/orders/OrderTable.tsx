'use client'

// src/components/orders/OrderTable.tsx
// Client component: renders the production orders table with live search.
// R1 redesign — light theme, navy PI badge, color dots, hover View button.
// All search/navigation logic unchanged from S1/S3.

import { useState, useMemo, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import type { OrderTableItem } from '@/types'
import { OrderStatus, calcOrderStatus } from '@/lib/orderStatus'
import { PiStatusBadge, MachinePlanBadge } from './DraftBadge'

interface OrderTableProps {
  orders: OrderTableItem[]
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
  const searchParams = useSearchParams()

  const rawPage = parseInt(searchParams.get('page') || '1', 10)
  const requestedPage = isNaN(rawPage) || rawPage < 1 ? 1 : rawPage
  const rawPageSize = parseInt(searchParams.get('pageSize') || '25', 10)
  const pageSize = [25, 50, 100].includes(rawPageSize) ? rawPageSize : 25
  const statusParam = searchParams.get('status') || 'ALL'
  const statusFilter = (['ALL', 'PENDING', 'SCHEDULED', 'RUNNING', 'DONE'].includes(statusParam)
    ? statusParam
    : 'ALL') as 'ALL' | OrderStatus
  const query = searchParams.get('q') || ''
  const [jumpInput, setJumpInput] = useState('')

  const updateUrl = useCallback((updates: Record<string, string | null>, isPush = false) => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === '' || (key === 'page' && value === '1') || (key === 'pageSize' && value === '25') || (key === 'status' && value === 'ALL')) params.delete(key)
      else params.set(key, value)
    }
    const search = params.toString()
    const newUrl = `${window.location.pathname}${search ? `?${search}` : ''}`
    if (isPush) window.history.pushState(null, '', newUrl)
    else window.history.replaceState(null, '', newUrl)
  }, [])

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

  const totalItems = filtered.length
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  const safePage = Math.min(Math.max(1, requestedPage), totalPages)
  const startIndex = (safePage - 1) * pageSize
  const endIndex = Math.min(startIndex + pageSize, totalItems)
  const paginatedOrders = useMemo(() => filtered.slice(startIndex, endIndex), [filtered, startIndex, endIndex])
  const pageItems = useMemo(() => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1)
    const items: (number | '...')[] = [1]
    if (safePage > 3) items.push('...')
    for (let i = Math.max(2, safePage - 1); i <= Math.min(totalPages - 1, safePage + 1); i++) items.push(i)
    if (safePage < totalPages - 2) items.push('...')
    items.push(totalPages)
    return items
  }, [safePage, totalPages])

  return (
    <div className="space-y-md">

       {/* Filter Tabs — lọc theo trạng thái sản xuất */}
       <div className="flex items-center gap-1.5 overflow-x-auto border-b border-outline-variant pb-2">
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
              onClick={() => updateUrl({ status: tab, page: '1' }, false)}
              className={`px-3.5 py-1.5 text-sm font-medium rounded-t-md transition-colors border-b-2 -mb-[9px] whitespace-nowrap ${
                isActive 
                  ? 'border-primary text-primary bg-surface-container font-semibold' 
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
            onChange={(e) => updateUrl({ q: e.target.value, page: '1' }, false)}
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
                  {['PI Number', 'Tình trạng PI', 'Kế hoạch máy', 'Customer', 'Order Date', 'Width (m)', 'Length (m)', 'GSM', 'Color', 'Item Code', ''].map((h) => (
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
                    <td colSpan={11} className="px-md py-[48px] text-center">
                      <div className="flex flex-col items-center gap-sm">
                        <span className="material-symbols-outlined text-[40px] text-outline-variant">search_off</span>
                        <p className="text-body-md font-noto text-secondary">No orders found</p>
                        {query && (
                          <button
                            onClick={() => updateUrl({ q: null, page: '1' }, false)}
                            className="text-label-sm font-inter text-primary hover:underline"
                          >
                            Clear search
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedOrders.map((order) => (
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

                      {/* 1. Tình trạng PI (Thương mại / Hợp đồng) */}
                      <td className="px-md py-sm whitespace-nowrap">
                        <PiStatusBadge
                          lifecycleStatus={order.lifecycleStatus}
                          isDraft={order.isDraft}
                        />
                      </td>

                      {/* 2. Kế hoạch máy (Phân bổ thiết bị xưởng dệt) */}
                      <td className="px-md py-sm whitespace-nowrap">
                        <MachinePlanBadge
                          lifecycleStatus={order.lifecycleStatus}
                          isPlaceholder={order.isPlaceholder}
                          calculatedStatus={order.calculatedStatus}
                        />
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
                      <td className="px-md py-sm text-right text-type-mono font-mono text-on-surface tabular-nums" suppressHydrationWarning>
                        {order.lengthM != null ? Number(order.lengthM).toLocaleString('vi-VN') : <span className="text-outline italic">—</span>}
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

                      {/* Item Code */}
                      <td className="px-md py-sm">
                        {order.itemCode ? (
                          <span className="text-body-md font-mono text-on-surface">
                            {order.itemCode}
                          </span>
                        ) : (
                          <span className="text-outline italic">—</span>
                        )}
                      </td>

                      {/* Action — View & Edit PI buttons, visible on row hover */}
                      <td className="px-md py-sm text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Link
                            href={`/orders/pi/${encodeURIComponent(order.piNumber)}`}
                            onClick={(e) => e.stopPropagation()}
                            title="Chỉnh sửa toàn bộ PI"
                            className="inline-flex items-center gap-xs text-label-sm font-inter text-primary border border-primary/30 bg-primary/10 rounded px-sm py-xs hover:bg-primary/20"
                          >
                            <span className="material-symbols-outlined text-[14px]">table_rows</span>
                            Sửa PI
                          </Link>
                          <span className="inline-flex items-center gap-xs text-label-sm font-inter text-secondary border border-[0.5px] border-outline-variant rounded px-sm py-xs hover:bg-surface-container">
                            <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                            Chi tiết
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {filtered.length > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-md border-t border-[0.5px] border-outline-variant px-md py-sm bg-surface-container">
              <div className="flex items-center gap-md">
                <p className="text-label-sm font-inter text-secondary">
                  Hiển thị <span className="font-semibold text-on-surface">{startIndex + 1}–{endIndex}</span> trong số <span className="font-semibold text-on-surface">{totalItems.toLocaleString('vi-VN')}</span> dòng sản xuất
                </p>
                <div className="flex items-center gap-xs text-label-sm font-inter text-secondary">
                  <span>Xem:</span>
                  <select value={pageSize} onChange={(e) => updateUrl({ pageSize: e.target.value, page: '1' }, false)} className="bg-surface-container-lowest border border-outline-variant rounded px-sm py-[3px] text-label-sm font-inter text-on-surface focus:outline-none focus:border-primary" aria-label="Chọn số dòng sản xuất hiển thị trên một trang">
                    <option value={25}>25 / trang</option><option value={50}>50 / trang</option><option value={100}>100 / trang</option>
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-xs">
                <button onClick={() => updateUrl({ page: '1' }, true)} disabled={safePage === 1} className="p-1 rounded text-secondary hover:text-on-surface hover:bg-surface-container-high disabled:opacity-30 disabled:pointer-events-none transition-colors" title="Trang đầu" aria-label="Đến trang đầu tiên"><span className="material-symbols-outlined text-[18px]">first_page</span></button>
                <button onClick={() => updateUrl({ page: String(Math.max(1, safePage - 1)) }, true)} disabled={safePage === 1} className="p-1 rounded text-secondary hover:text-on-surface hover:bg-surface-container-high disabled:opacity-30 disabled:pointer-events-none transition-colors" title="Trang trước" aria-label="Quay lại trang trước"><span className="material-symbols-outlined text-[18px]">chevron_left</span></button>
                <div className="flex items-center gap-1 mx-1">{pageItems.map((item, idx) => item === '...' ? <span key={`dots-${idx}`} className="px-1 text-label-sm font-inter text-outline" aria-hidden="true">…</span> : <button key={item} onClick={() => updateUrl({ page: String(item) }, true)} className={`min-w-[28px] h-7 px-1 rounded text-label-sm font-inter transition-colors ${item === safePage ? 'bg-primary text-on-primary font-semibold shadow-sm' : 'text-on-surface hover:bg-surface-container-high'}`} aria-label={`Trang ${item}`} aria-current={item === safePage ? 'page' : undefined}>{item}</button>)}</div>
                <button onClick={() => updateUrl({ page: String(Math.min(totalPages, safePage + 1)) }, true)} disabled={safePage === totalPages} className="p-1 rounded text-secondary hover:text-on-surface hover:bg-surface-container-high disabled:opacity-30 disabled:pointer-events-none transition-colors" title="Trang sau" aria-label="Chuyển sang trang sau"><span className="material-symbols-outlined text-[18px]">chevron_right</span></button>
                <button onClick={() => updateUrl({ page: String(totalPages) }, true)} disabled={safePage === totalPages} className="p-1 rounded text-secondary hover:text-on-surface hover:bg-surface-container-high disabled:opacity-30 disabled:pointer-events-none transition-colors" title="Trang cuối" aria-label="Đến trang cuối cùng"><span className="material-symbols-outlined text-[18px]">last_page</span></button>
                <div className="flex items-center gap-1 ml-sm pl-sm border-l border-outline-variant">
                  <input type="number" min={1} max={totalPages} value={jumpInput} placeholder={String(safePage)} onChange={(e) => setJumpInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { const val = parseInt(jumpInput, 10); if (!isNaN(val)) { updateUrl({ page: String(Math.min(Math.max(1, val), totalPages)) }, true); setJumpInput('') } } }} className="w-12 h-7 bg-surface-container-lowest border border-outline-variant rounded px-1.5 text-center text-label-sm font-mono text-on-surface focus:outline-none focus:border-primary" aria-label="Nhập số trang muốn đến" />
                  <button onClick={() => { const val = parseInt(jumpInput, 10); if (!isNaN(val)) { updateUrl({ page: String(Math.min(Math.max(1, val), totalPages)) }, true); setJumpInput('') } }} className="h-7 px-2 rounded border border-outline-variant bg-surface-container-lowest hover:bg-surface-container-high text-label-sm font-inter text-secondary hover:text-on-surface transition-colors">Đến</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
