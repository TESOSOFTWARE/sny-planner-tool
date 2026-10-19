'use client'

// src/components/materials/RollingTab.tsx
// Tab Rolling — displays RollingDailyMetric records with summary cards, filters, and data table.

import { useState } from 'react'
import Link from 'next/link'
import TablePager from './TablePager'
import { useMaterialPage } from './useMaterialPage'

interface RollingRecord {
  id:             string
  date:           string
  orderRef:       string | null
  orderId:        string | null
  color:          string | null
  widthM:         number | null
  lengthM:        number | null
  weightKgsOrder: string | null
  metricLabel:    string
  metricValue:    string | null
  dataSource:     string
}

interface ApiResponse {
  success:           boolean
  records:           RollingRecord[]
  total:             number
  page:              number
  limit:             number
  totalPages:        number
  uniqueOrdersCount: number
  sumMeters:         number
  sumWeightKg:       number
  availableOrders:   string[]
  error?:            string
}

interface Props {
  onImport: () => void
}

function StatCard({ label, value, icon, accent }: { label: string; value: string | number; icon: string; accent?: string }) {
  return (
    <div className="bg-surface-container-lowest border-[0.5px] border-outline-variant rounded-xl px-5 py-4">
      <div className="flex items-center gap-2 mb-1">
        <span className={`material-symbols-outlined text-[20px] ${accent || 'text-secondary'}`}>{icon}</span>
        <p className="text-xs font-inter font-medium text-secondary uppercase tracking-widest">{label}</p>
      </div>
      <p className={`text-2xl font-inter font-semibold tabular-nums ${accent || 'text-on-surface'}`}>{value}</p>
    </div>
  )
}

export default function RollingTab({ onImport }: Props) {
  // Filters
  const [filterDate, setFilterDate]         = useState('')
  const [filterOrderRef, setFilterOrderRef] = useState('')

  const pagination = useMaterialPage<ApiResponse>('/api/materials/rolling/records', new URLSearchParams({ ...(filterDate ? { date: filterDate } : {}), ...(filterOrderRef ? { orderRef: filterOrderRef } : {}) }).toString())
  const { data, loading: isLoading, error: fetchError, retry } = pagination
  const records = data?.records ?? [], total = data?.total ?? 0
  const uniqueOrdersCount = data?.uniqueOrdersCount ?? 0, sumMeters = data?.sumMeters ?? 0, sumWeightKg = data?.sumWeightKg ?? 0
  const availableOrders = data?.availableOrders ?? []
  const summaryUnavailable = isLoading || !!fetchError
  const pager = <TablePager {...pagination} total={total} label="Rolling" />

  const clearFilters = () => {
    setFilterDate('')
    setFilterOrderRef('')
  }

  return (
    <div ref={pagination.tableRef} className="space-y-6 scroll-mt-20">
      {/* 4 Summary Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          label="TỔNG BẢN GHI"
          value={summaryUnavailable ? '—' : total.toLocaleString('vi-VN')}
          icon="format_list_bulleted"
        />
        <StatCard
          label="Số mã ORDER"
          value={summaryUnavailable ? '—' : uniqueOrdersCount.toLocaleString('vi-VN')}
          icon="shopping_cart"
          accent="text-primary"
        />
        <StatCard
          label="TỔNG SẢN LƯỢNG (M)"
          value={summaryUnavailable ? '—' : sumMeters > 0 ? `${sumMeters.toLocaleString('vi-VN')} m` : '0 m'}
          icon="straighten"
          accent="text-emerald-700"
        />
        <StatCard
          label="TỔNG TRỌNG LƯỢNG (KG)"
          value={summaryUnavailable ? '—' : sumWeightKg > 0 ? `${sumWeightKg.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} kg` : '0 kg'}
          icon="scale"
          accent="text-amber-700"
        />
      </div>

      {/* Filter bar & Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-surface-container-lowest border-[0.5px] border-outline-variant p-4 rounded-xl">
        <div className="flex flex-wrap items-center gap-3 flex-1">
          {/* Date Picker */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-inter font-medium text-secondary">Ngày:</span>
            <input
              type="date"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              className="bg-surface border border-outline-variant rounded-md px-3 py-1.5 text-xs text-on-surface focus:outline-none focus:border-primary"
            />
          </div>

          {/* Order Ref Dropdown / Input */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-inter font-medium text-secondary">ORDER/khách:</span>
            <div className="relative">
              <input
                type="text"
                list="rolling-order-list"
                placeholder="Lọc theo ORDER/khách..."
                value={filterOrderRef}
                onChange={(e) => setFilterOrderRef(e.target.value)}
                className="bg-surface border border-outline-variant rounded-md px-3 py-1.5 text-xs text-on-surface focus:outline-none focus:border-primary w-40"
              />
              <datalist id="rolling-order-list">
                {availableOrders.map((ref) => (
                  <option key={ref} value={ref} />
                ))}
              </datalist>
            </div>
          </div>

          {(filterDate || filterOrderRef) && (
            <button
              onClick={clearFilters}
              className="text-xs text-secondary hover:text-primary transition-colors flex items-center gap-1 border border-outline-variant px-2.5 py-1.5 rounded-md"
            >
              <span className="material-symbols-outlined text-[14px]">close</span>
              Xóa bộ lọc
            </button>
          )}
        </div>

        {/* Action Button */}
        <div className="flex items-center gap-2">
          <button
            onClick={onImport}
            className="inline-flex items-center justify-center gap-2 bg-primary text-on-primary text-xs font-semibold px-4 py-2 h-9 rounded-md hover:bg-primary/90 transition-colors shadow-sm"
          >
            <span className="material-symbols-outlined text-[18px]">upload_file</span>
            Import báo cáo Rolling
          </button>
        </div>
      </div>

      {/* Error banner */}
      {fetchError && (
        <div className="p-3 bg-error-container/40 border border-error/30 rounded-lg flex items-center gap-2 text-error text-sm">
          <span className="material-symbols-outlined text-[18px]">error</span>
          <span>{fetchError}</span>
          <button type="button" onClick={retry} disabled={isLoading} className="ml-auto rounded border border-error px-3 py-1 disabled:opacity-50">Thử lại</button>
        </div>
      )}

      {/* Data Table */}
      {pager}
      <div className="bg-surface-container-lowest border-[0.5px] border-outline-variant rounded-xl overflow-hidden shadow-sm">
        <div data-material-scroll aria-busy={isLoading} className={`max-h-[60vh] overflow-auto ${isLoading ? 'opacity-50 pointer-events-none' : ''}`}>
          <table className="w-full text-xs text-left">
            <thead className="sticky top-0 z-10 bg-surface-container text-secondary font-medium uppercase border-b border-outline-variant">
              <tr>
                <th className="px-4 py-3 font-semibold">Ngày</th>
                <th className="px-4 py-3 font-semibold">ORDER/khách</th>
                <th className="px-4 py-3 font-semibold">Màu</th>
                <th className="px-4 py-3 font-semibold text-right">Khổ (m)</th>
                <th className="px-4 py-3 font-semibold text-right">Dài (m)</th>
                <th className="px-4 py-3 font-semibold">Chỉ số (MetricLabel)</th>
                <th className="px-4 py-3 font-semibold text-right">Giá trị</th>
                <th className="px-4 py-3 font-semibold">Nguồn file</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {isLoading && records.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-secondary">
                    <span className="material-symbols-outlined text-[24px] animate-spin mb-1 block mx-auto">progress_activity</span>
                    Đang tải dữ liệu Rolling...
                  </td>
                </tr>
              ) : fetchError ? null : records.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-secondary">
                    Không tìm thấy bản ghi sản lượng Rolling nào phù hợp.
                  </td>
                </tr>
              ) : (
                records.map((r) => {
                  const numValue = r.metricValue ? parseFloat(r.metricValue) : 0
                  return (
                    <tr key={r.id} data-record-id={r.id} className="hover:bg-surface-container-high/40 transition-colors">
                      <td className="px-4 py-2.5 font-mono tabular-nums text-on-surface">{r.date.split('-').reverse().join('/')}</td>
                      <td className="px-4 py-2.5 font-semibold text-primary">
                        {r.orderId ? (
                          <Link href={`/orders/${r.orderId}`} className="hover:underline flex items-center gap-1">
                            {r.orderRef}
                            <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                          </Link>
                        ) : (
                          r.orderRef || '—'
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-on-surface">{r.color || '—'}</td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums text-on-surface">{r.widthM != null ? `${r.widthM.toLocaleString('vi-VN', { maximumFractionDigits: 20 })} m` : '—'}</td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums text-on-surface">{r.lengthM != null ? `${r.lengthM.toLocaleString('vi-VN', { maximumFractionDigits: 20 })} m` : '—'}</td>
                      <td className="px-4 py-2.5 font-mono text-on-surface">
                        <span className="px-2 py-0.5 bg-surface-container rounded border border-outline-variant/60">
                          {r.metricLabel}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono font-semibold text-on-surface">
                        {numValue.toLocaleString('vi-VN')}
                      </td>
                      <td className="px-4 py-2.5 text-secondary text-[11px] max-w-[160px] truncate" title={r.dataSource}>
                        {r.dataSource}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

      </div>
    </div>
  )
}
