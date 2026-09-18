'use client'

// src/components/materials/PackingTab.tsx
// Tab displaying factory total daily outputs for Packing (SẢN LƯỢNG ĐÓNG GÓI).

import { useState, useEffect, useCallback } from 'react'
import { SerializedPackingOutput } from '@/types'
import ImportPackingReportModal from './ImportPackingReportModal'

export default function PackingTab() {
  const [records, setRecords] = useState<SerializedPackingOutput[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [limit] = useState(50)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filters
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  // Stats
  const [uniqueDaysCount, setUniqueDaysCount] = useState(0)
  const [sumTotalMeters, setSumTotalMeters] = useState(0)
  const [sumTotalWeightKg, setSumTotalWeightKg] = useState(0)

  // Modal State
  const [showImportModal, setShowImportModal] = useState(false)

  const fetchRecords = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      params.set('page', page.toString())
      params.set('limit', limit.toString())
      if (startDate) params.set('startDate', startDate)
      if (endDate) params.set('endDate', endDate)

      const res = await fetch(`/api/materials/packing/records?${params.toString()}`)
      const data = await res.json()

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Lỗi khi tải dữ liệu Đóng gói')
      }

      setRecords(data.records || [])
      setTotal(data.pagination?.total || 0)
      setUniqueDaysCount(data.stats?.uniqueDaysCount || 0)
      setSumTotalMeters(data.stats?.sumTotalMeters || 0)
      setSumTotalWeightKg(data.stats?.sumTotalWeightKg || 0)
    } catch (err: any) {
      setError(err.message || 'Không thể kết nối đến máy chủ')
    } finally {
      setIsLoading(false)
    }
  }, [page, limit, startDate, endDate])

  useEffect(() => {
    fetchRecords()
  }, [fetchRecords])

  const totalPages = Math.ceil(total / limit) || 1

  const handleClearFilters = () => {
    setStartDate('')
    setEndDate('')
    setPage(1)
  }

  return (
    <div className="space-y-6">
      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Total Days */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-wider">
              TỔNG SỐ NGÀY CÓ DỮ LIỆU
            </span>
            <span className="rounded-lg bg-blue-50 p-2 text-blue-600 text-lg">📅</span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-slate-800">
              {uniqueDaysCount.toLocaleString()}
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
            <span className="rounded-lg bg-emerald-50 p-2 text-emerald-600 text-lg">📦</span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-emerald-600">
              {sumTotalMeters.toLocaleString('vi-VN')}
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
            <span className="rounded-lg bg-purple-50 p-2 text-purple-600 text-lg">⚖️</span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-purple-600">
              {sumTotalWeightKg.toLocaleString('vi-VN')}
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
                setPage(1)
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
                setPage(1)
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
              Xóa bộ lọc ✕
            </button>
          )}
        </div>

        {/* Action Button: Import Report */}
        <button
          onClick={() => setShowImportModal(true)}
          className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 flex items-center justify-center gap-2 transition-colors"
        >
          <span>📥</span>
          Import Báo Cáo Đóng Gói
        </button>
      </div>

      {/* Data Table / Empty State / Loading State */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {isLoading ? (
          <div className="p-12 text-center text-slate-400 space-y-2">
            <div className="text-3xl animate-spin">⏳</div>
            <div className="text-sm">Đang tải dữ liệu Đóng gói...</div>
          </div>
        ) : error ? (
          <div className="p-8 text-center text-rose-600 space-y-2">
            <div className="text-2xl">⚠️</div>
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
            <div className="text-5xl">📦</div>
            <div className="max-w-md mx-auto space-y-1">
              <h3 className="text-base font-bold text-slate-800">
                Chưa có dữ liệu Đóng gói
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Nhấn <strong>Import Báo Cáo Đóng Gói</strong> phía trên để tải lên file Excel từ xưởng khi có số liệu sản lượng.
              </p>
            </div>
            <button
              onClick={() => setShowImportModal(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-50 px-4 py-2 text-xs font-semibold text-blue-600 hover:bg-blue-100 transition-colors"
            >
              <span>📥</span>
              Import Báo Cáo Ngay
            </button>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
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
                    <tr key={row.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap">
                        {row.date}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-600 whitespace-nowrap">
                        {row.qtyDay != null ? row.qtyDay.toLocaleString() : '-'}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-emerald-700 whitespace-nowrap">
                        {row.totalMDay != null ? Number(row.totalMDay).toLocaleString('vi-VN') : '-'}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-600 whitespace-nowrap">
                        {row.weightDay != null ? Number(row.weightDay).toLocaleString('vi-VN') : '-'}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-600 whitespace-nowrap">
                        {row.qtyNight != null ? row.qtyNight.toLocaleString() : '-'}
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

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 bg-slate-50 text-xs text-slate-500">
                <div>
                  Hiển thị <strong>{records.length}</strong> / <strong>{total}</strong> bản ghi
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="rounded-lg border bg-white px-2.5 py-1 text-slate-600 disabled:opacity-40 hover:bg-slate-100"
                  >
                    ← Trước
                  </button>
                  <span className="px-2 font-medium">
                    Trang {page} / {totalPages}
                  </span>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="rounded-lg border bg-white px-2.5 py-1 text-slate-600 disabled:opacity-40 hover:bg-slate-100"
                  >
                    Sau →
                  </button>
                </div>
              </div>
            )}
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
