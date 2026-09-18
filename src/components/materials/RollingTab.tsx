'use client'

// src/components/materials/RollingTab.tsx
// Tab Rolling — displays RollingDailyMetric records with summary cards, filters, and data table.

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

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
  const [records, setRecords]                     = useState<RollingRecord[]>([])
  const [total, setTotal]                         = useState(0)
  const [uniqueOrdersCount, setUniqueOrdersCount] = useState(0)
  const [sumMeters, setSumMeters]                 = useState(0)
  const [sumWeightKg, setSumWeightKg]             = useState(0)
  const [availableOrders, setAvailableOrders]     = useState<string[]>([])
  const [page, setPage]                           = useState(1)
  const [totalPages, setTotalPages]               = useState(1)
  const [isLoading, setIsLoading]                 = useState(false)
  const [fetchError, setFetchError]               = useState<string | null>(null)

  // Filters
  const [filterDate, setFilterDate]         = useState('')
  const [filterOrderRef, setFilterOrderRef] = useState('')

  const fetchRecords = useCallback(async (targetPage = 1) => {
    setIsLoading(true)
    setFetchError(null)
    try {
      const params = new URLSearchParams({
        page: targetPage.toString(),
        limit: '100',
      })
      if (filterDate)     params.set('date', filterDate)
      if (filterOrderRef) params.set('orderRef', filterOrderRef)

      const res = await fetch(`/api/materials/rolling/records?${params}`)
      const data = (await res.json()) as ApiResponse

      if (!res.ok || !data.success) {
        setFetchError(data.error ?? 'Không thể tải dữ liệu Rolling.')
        return
      }

      setRecords(data.records)
      setTotal(data.total)
      setPage(data.page)
      setTotalPages(data.totalPages)
      setUniqueOrdersCount(data.uniqueOrdersCount)
      setSumMeters(data.sumMeters)
      setSumWeightKg(data.sumWeightKg)
      if (data.availableOrders) {
        setAvailableOrders(data.availableOrders)
      }
    } catch {
      setFetchError('Lỗi mạng — không thể kết nối máy chủ.')
    } finally {
      setIsLoading(false)
    }
  }, [filterDate, filterOrderRef])

  useEffect(() => {
    fetchRecords(1)
  }, [fetchRecords])

  const clearFilters = () => {
    setFilterDate('')
    setFilterOrderRef('')
  }

  return (
    <div className="space-y-6">
      {/* 4 Summary Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          label="TỔNG BẢN GHI"
          value={total.toLocaleString()}
          icon="format_list_bulleted"
        />
        <StatCard
          label="TỔNG ĐƠN HÀNG"
          value={uniqueOrdersCount.toLocaleString()}
          icon="shopping_cart"
          accent="text-primary"
        />
        <StatCard
          label="TỔNG SẢN LƯỢNG (M)"
          value={sumMeters > 0 ? `${sumMeters.toLocaleString('vi-VN')} m` : '0 m'}
          icon="straighten"
          accent="text-emerald-700"
        />
        <StatCard
          label="TỔNG TRỌNG LƯỢNG (KG)"
          value={sumWeightKg > 0 ? `${sumWeightKg.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} kg` : '0 kg'}
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
            <span className="text-xs font-inter font-medium text-secondary">Mã đơn:</span>
            <div className="relative">
              <input
                type="text"
                list="rolling-order-list"
                placeholder="Lọc theo PI..."
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
            Import Báo Cáo Rolling
          </button>
        </div>
      </div>

      {/* Error banner */}
      {fetchError && (
        <div className="p-3 bg-error-container/40 border border-error/30 rounded-lg flex items-center gap-2 text-error text-sm">
          <span className="material-symbols-outlined text-[18px]">error</span>
          <span>{fetchError}</span>
        </div>
      )}

      {/* Data Table */}
      <div className="bg-surface-container-lowest border-[0.5px] border-outline-variant rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-surface-container text-secondary font-medium uppercase border-b border-outline-variant">
              <tr>
                <th className="px-4 py-3 font-semibold">Ngày</th>
                <th className="px-4 py-3 font-semibold">Mã PI (OrderRef)</th>
                <th className="px-4 py-3 font-semibold">Màu</th>
                <th className="px-4 py-3 font-semibold text-right">Khổ (m)</th>
                <th className="px-4 py-3 font-semibold text-right">Dài (m)</th>
                <th className="px-4 py-3 font-semibold">Chỉ số (MetricLabel)</th>
                <th className="px-4 py-3 font-semibold text-right">Giá trị</th>
                <th className="px-4 py-3 font-semibold">Nguồn file</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-secondary">
                    <span className="material-symbols-outlined text-[24px] animate-spin mb-1 block mx-auto">progress_activity</span>
                    Đang tải dữ liệu Rolling...
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-secondary">
                    Không tìm thấy bản ghi sản lượng Rolling nào phù hợp.
                  </td>
                </tr>
              ) : (
                records.map((r) => {
                  const numValue = r.metricValue ? parseFloat(r.metricValue) : 0
                  return (
                    <tr key={r.id} className="hover:bg-surface-container-high/40 transition-colors">
                      <td className="px-4 py-2.5 font-mono text-on-surface">{r.date}</td>
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
                      <td className="px-4 py-2.5 text-right font-mono text-on-surface">{r.widthM != null ? `${r.widthM}m` : '—'}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-on-surface">{r.lengthM != null ? `${r.lengthM}m` : '—'}</td>
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

        {/* Pagination footer */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-outline-variant bg-surface-container/30 text-xs">
            <span className="text-secondary">
              Hiển thị page <strong>{page}</strong> / <strong>{totalPages}</strong> ({total.toLocaleString()} bản ghi)
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => fetchRecords(page - 1)}
                disabled={page <= 1 || isLoading}
                className="px-3 py-1 border border-outline-variant rounded hover:bg-surface-container disabled:opacity-40"
              >
                Trước
              </button>
              <button
                onClick={() => fetchRecords(page + 1)}
                disabled={page >= totalPages || isLoading}
                className="px-3 py-1 border border-outline-variant rounded hover:bg-surface-container disabled:opacity-40"
              >
                Sau
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
