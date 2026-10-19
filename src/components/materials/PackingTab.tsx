'use client'

// src/components/materials/PackingTab.tsx
// Tab displaying factory total daily outputs for Packing (SẢN LƯỢNG ĐÓNG GÓI).

import { useState } from 'react'
import { SerializedPackingOutput } from '@/types'
import ImportPackingReportModal from './ImportPackingReportModal'
import TablePager from './TablePager'
import { useMaterialPage } from './useMaterialPage'

interface ApiResponse {
  success: boolean
  error?: string
  records: SerializedPackingOutput[]
  pagination: { total: number }
  stats: { uniqueDaysCount: number; sumTotalMeters: number; sumTotalWeightKg: number }
}

export default function PackingTab() {
  // Filters
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  // Modal State
  const [showImportModal, setShowImportModal] = useState(false)

  const pagination = useMaterialPage<ApiResponse>('/api/materials/packing/records', new URLSearchParams({ ...(startDate ? { startDate } : {}), ...(endDate ? { endDate } : {}) }).toString())
  const { data, loading: isLoading, error, retry: fetchRecords } = pagination
  const records = data?.records ?? [], total = data?.pagination.total ?? 0
  const uniqueDaysCount = data?.stats.uniqueDaysCount ?? 0, sumTotalMeters = data?.stats.sumTotalMeters ?? 0, sumTotalWeightKg = data?.stats.sumTotalWeightKg ?? 0
  const summaryUnavailable = isLoading || !!error
  const pager = <TablePager {...pagination} total={total} label="Đóng gói" />

  const handleClearFilters = () => {
    setStartDate('')
    setEndDate('')
  }

  return (
    <div ref={pagination.tableRef} className="space-y-6 scroll-mt-20">
      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Total Days */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-wider">
              TỔNG SỐ NGÀY CÓ DỮ LIỆU
            </span>
            <span className="material-symbols-outlined rounded-lg bg-surface-container p-2 text-primary">calendar_month</span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-slate-800" suppressHydrationWarning>
              {summaryUnavailable ? '—' : uniqueDaysCount.toLocaleString('vi-VN')}
            </span>
            <span className="text-xs text-slate-500">ngày</span>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Các ngày có báo cáo sản lượng Đóng gói
          </p>
        </div>

        {/* Card 2: Total Meters */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-wider">
              TỔNG SẢN LƯỢNG (M)
            </span>
            <span className="material-symbols-outlined rounded-lg bg-emerald-50 p-2 text-emerald-600">inventory_2</span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-emerald-600">
              {summaryUnavailable ? '—' : sumTotalMeters.toLocaleString('vi-VN')}
            </span>
            <span className="text-xs text-slate-500">m</span>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Tổng sản lượng Đóng gói ca ngày + ca đêm
          </p>
        </div>

        {/* Card 3: Total Weight */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-wider">
              TỔNG TRỌNG LƯỢNG (KG)
            </span>
            <span className="material-symbols-outlined rounded-lg bg-purple-50 p-2 text-purple-600">scale</span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-purple-600">
              {summaryUnavailable ? '—' : sumTotalWeightKg.toLocaleString('vi-VN')}
            </span>
            <span className="text-xs text-slate-500">kg</span>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Tổng trọng lượng Đóng gói ca ngày + ca đêm
          </p>
        </div>
      </div>

      {/* Filter Bar & Import Button */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          {/* Start Date */}
          <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
            <span>Từ ngày:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value)
              }}
              className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs text-slate-700 focus:border-blue-500 focus:outline-none"
            />
          </div>

          {/* End Date */}
          <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
            <span>Đến ngày:</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value)
              }}
              className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs text-slate-700 focus:border-blue-500 focus:outline-none"
            />
          </div>

          {/* Clear Filters */}
          {(startDate || endDate) && (
            <button
              onClick={handleClearFilters}
              className="rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-200"
            >
              Xóa bộ lọc <span className="material-symbols-outlined align-middle text-[14px]">close</span>
            </button>
          )}
        </div>

        {/* Action Button: Import Report */}
        <button
          onClick={() => setShowImportModal(true)}
          className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-on-primary shadow-sm hover:bg-primary/90 flex items-center justify-center gap-2 transition-colors"
        >
          <span className="material-symbols-outlined text-base">upload</span>
          Import báo cáo Đóng gói
        </button>
      </div>

      {/* Data Table / Empty State / Loading State */}
      {pager}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {isLoading && records.length === 0 ? (
          <div className="p-12 text-center text-slate-400 space-y-2">
            <span className="material-symbols-outlined text-3xl animate-spin">progress_activity</span>
            <div className="text-sm">Đang tải dữ liệu Đóng gói...</div>
          </div>
        ) : error ? (
          <div className="p-8 text-center text-rose-600 space-y-2">
            <span className="material-symbols-outlined text-2xl">warning</span>
            <div className="text-sm font-semibold">{error}</div>
            <button
              onClick={fetchRecords}
              className="mt-2 text-xs text-blue-600 hover:underline"
            >
              Thử lại
            </button>
          </div>
        ) : records.length === 0 ? (
          /* Friendly Empty State Requirement */
          <div className="p-16 text-center space-y-4">
            <span className="material-symbols-outlined text-5xl">inventory_2</span>
            <div className="max-w-md mx-auto space-y-1">
              <h3 className="text-base font-bold text-slate-800">
                Chưa có dữ liệu Đóng gói
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Nhấn <strong>Import báo cáo Đóng gói</strong> phía trên để tải lên file Excel từ xưởng khi có số liệu sản lượng.
              </p>
            </div>
            <button
              onClick={() => setShowImportModal(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-50 px-4 py-2 text-xs font-semibold text-blue-600 hover:bg-blue-100 transition-colors"
            >
              <span className="material-symbols-outlined text-base">upload</span>
              Import báo cáo ngay
            </button>
          </div>
        ) : (
          <>
            <div data-material-scroll aria-busy={isLoading} className={`max-h-[60vh] overflow-auto ${isLoading ? 'opacity-50 pointer-events-none' : ''}`}>
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 z-10 bg-slate-50 text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Ngày</th>
                    <th className="px-4 py-3 font-semibold text-right">SL Ca Ngày</th>
                    <th className="px-4 py-3 font-semibold text-right">Mét Ca Ngày</th>
                    <th className="px-4 py-3 font-semibold text-right">KG Ca Ngày</th>
                    <th className="px-4 py-3 font-semibold text-right">SL Ca Đêm</th>
                    <th className="px-4 py-3 font-semibold text-right">Mét Ca Đêm</th>
                    <th className="px-4 py-3 font-semibold text-right">KG Ca Đêm</th>
                    <th className="px-4 py-3 font-semibold">Nguồn file</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {records.map((row) => (
                    <tr key={row.id} data-record-id={row.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap">
                        {row.date.split('-').reverse().join('/')}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-600 whitespace-nowrap" suppressHydrationWarning>
                        {row.qtyDay != null ? row.qtyDay.toLocaleString('vi-VN') : '-'}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-emerald-700 whitespace-nowrap" suppressHydrationWarning>
                        {row.totalMDay != null ? Number(row.totalMDay).toLocaleString('vi-VN') : '-'}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-600 whitespace-nowrap" suppressHydrationWarning>
                        {row.weightDay != null ? Number(row.weightDay).toLocaleString('vi-VN') : '-'}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-600 whitespace-nowrap" suppressHydrationWarning>
                        {row.qtyNight != null ? row.qtyNight.toLocaleString('vi-VN') : '-'}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-emerald-700 whitespace-nowrap">
                        {row.totalMNight != null ? Number(row.totalMNight).toLocaleString('vi-VN') : '-'}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-600 whitespace-nowrap">
                        {row.weightNight != null ? Number(row.weightNight).toLocaleString('vi-VN') : '-'}
                      </td>
                      <td className="px-4 py-3 text-slate-400 max-w-xs truncate" title={row.dataSource}>
                        {row.dataSource}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

          </>
        )}
      </div>

      {/* Import Modal */}
      {showImportModal && (
        <ImportPackingReportModal
          onImported={() => {
            fetchRecords()
          }}
          onClose={() => setShowImportModal(false)}
        />
      )}
    </div>
  )
}
