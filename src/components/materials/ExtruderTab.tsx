'use client'

// src/components/materials/ExtruderTab.tsx
// Tab hiển thị Extruder Daily Output — bảng dữ liệu, filter ngày + máy, summary cards.

import { useState, useEffect } from 'react'
import TablePager from './TablePager'
import { useMaterialPage } from './useMaterialPage'
import { formatMaterialNumber } from './display'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ExtruderRecord {
  id:         string
  machineId:  string
  reportDate: string
  shift:      string
  color:      string
  denier:     string | null
  weightKgs:  string
  beamNote:   string | null
  orderRef:   string | null
}

interface ApiResponse {
  success: boolean
  records: ExtruderRecord[]
  total:   number
  totalWeightKgs: string
  machineCount:   number
  error?:  string
}

interface Props {
  onImport: () => void
}

// ── Summary card ──────────────────────────────────────────────────────────────

function StatCard({ label, value, icon }: { label: string; value: string | number; icon: string }) {
  return (
    <div className="bg-surface-container-lowest border-[0.5px] border-outline-variant rounded-xl px-5 py-4">
      <div className="flex items-center gap-2 mb-1">
        <span className="material-symbols-outlined text-[20px] text-secondary">{icon}</span>
        <p className="text-xs font-inter font-medium text-secondary uppercase tracking-widest">{label}</p>
      </div>
      <p className="text-2xl font-inter font-semibold tabular-nums text-on-surface">{value}</p>
    </div>
  )
}

// ── Shift badge ───────────────────────────────────────────────────────────────

function ShiftBadge({ shift }: { shift: string }) {
  const isDay = shift === 'D'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
      isDay
        ? 'bg-[#fef9c3] text-[#713f12] border border-[#fde047]/50'
        : 'bg-[#1e293b] text-[#e2e8f0] border border-[#334155]'
    }`}>
      {isDay ? 'Ca ngày' : 'Ca đêm'}
    </span>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

const formatNumber = formatMaterialNumber

export default function ExtruderTab({ onImport }: Props) {
  // Filter state
  const [filterDate, setFilterDate]         = useState('')
  const [filterMachine, setFilterMachine]   = useState('')

  // Derived list of machines for dropdown (from loaded records)
  const [availableMachines, setAvailableMachines] = useState<string[]>([])

  const pagination = useMaterialPage<ApiResponse>('/api/extruder/records', new URLSearchParams({ ...(filterDate ? { date: filterDate } : {}), ...(filterMachine ? { machineId: filterMachine } : {}) }).toString())
  const { data, loading: isLoading, error: fetchError, retry: fetchRecords } = pagination
  const records = data?.records ?? [], total = data?.total ?? 0
  const pager = <TablePager {...pagination} total={total} label="Extruder" />
  useEffect(() => {
    if (data && !filterMachine) setAvailableMachines(previous => Array.from(new Set([...previous, ...data.records.map(record => record.machineId)])).sort())
  }, [data, filterMachine])

  // Summary stats: server totals over every filtered row, not only the loaded page (N12)
  const totalKg = Number(data?.totalWeightKgs ?? 0)
  const machineCount = data?.machineCount ?? 0
  const summaryUnavailable = isLoading || !!fetchError

  return (
    <div ref={pagination.tableRef} className="space-y-4 scroll-mt-20">

      {/* Header Actions */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="date"
            value={filterDate}
            onChange={e => setFilterDate(e.target.value)}
            className="h-9 px-3 rounded-md border-[0.5px] border-outline-variant bg-surface-container-lowest text-sm text-on-surface focus:outline-none focus:border-primary transition-colors"
          />
          <select
            value={filterMachine}
            onChange={e => setFilterMachine(e.target.value)}
            className="h-9 px-3 rounded-md border-[0.5px] border-outline-variant bg-surface-container-lowest text-sm text-on-surface focus:outline-none focus:border-primary transition-colors"
          >
            <option value="">Tất cả máy</option>
            {availableMachines.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          {(filterDate || filterMachine) && (
            <button
              onClick={() => { setFilterDate(''); setFilterMachine('') }}
              className="h-9 px-3 text-xs text-secondary border border-outline-variant rounded-md hover:bg-surface-container transition-colors"
            >
              Xóa filter
            </button>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          <a
            href="/api/extruder/template"
            className="inline-flex items-center gap-2 px-4 py-2 border border-outline text-on-surface-variant hover:bg-surface-container-lowest rounded-md text-sm font-medium transition-colors"
            download
          >
            <span className="material-symbols-outlined text-[18px]">download</span>
            Tải mẫu Extruder
          </a>
          <button
            onClick={onImport}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-on-primary hover:bg-primary/90 rounded-md text-sm font-medium transition-colors shadow-sm"
          >
            <span className="material-symbols-outlined text-[18px]">upload</span>
            Import báo cáo
          </button>
        </div>
      </div>

      {/* Error banner */}
      {fetchError && (
        <div role="alert" className="flex flex-wrap items-center gap-2 p-3 bg-error-container border border-error/30 rounded-lg text-error text-sm">
          <span className="material-symbols-outlined text-[18px]">error</span>
          {fetchError}
          <button type="button" onClick={() => void fetchRecords()} disabled={isLoading} className="ml-auto rounded border border-error px-3 py-1 font-medium focus-visible:ring-2 focus-visible:ring-error disabled:opacity-50">Thử lại</button>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Tổng dòng" value={summaryUnavailable ? '—' : total}                                                                                    icon="format_list_numbered" />
        <StatCard label="Số máy"    value={summaryUnavailable ? '—' : machineCount}                                                                             icon="precision_manufacturing" />
        <StatCard label="Tổng sản lượng" value={summaryUnavailable ? '—' : `${totalKg.toLocaleString('vi-VN', { maximumFractionDigits: 0 })} kg`} icon="scale" />
      </div>

      {/* Table */}
      {pager}
      <div className="bg-surface-container-lowest border-[0.5px] border-outline-variant rounded-lg overflow-hidden">
        {isLoading && records.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <svg className="w-6 h-6 animate-spin text-primary" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
          </div>
        ) : fetchError ? null : records.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <span className="material-symbols-outlined text-[48px] text-outline mb-3">precision_manufacturing</span>
            <p className="text-sm text-secondary">
              {filterDate || filterMachine
                ? 'Không có dữ liệu với filter đã chọn.'
                : 'Chưa có dữ liệu Extruder. Bấm "Import báo cáo" để bắt đầu.'}
            </p>
          </div>
        ) : (
          <div data-material-scroll aria-busy={isLoading} className={`max-h-[60vh] overflow-auto ${isLoading ? 'opacity-50 pointer-events-none' : ''}`}>
            <table className="w-full">
              <thead className="sticky top-0 z-10 bg-surface-container">
                <tr className="bg-surface-container border-b-[0.5px] border-outline-variant">
                  {['Ngày', 'Máy', 'Ca', 'Màu sắc', 'Denier', 'Weight (kg)', 'Beam Note', 'Ghi chú', ].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-inter font-medium text-secondary uppercase tracking-widest whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/50">
                {records.map(rec => (
                  <tr key={rec.id} data-record-id={rec.id} className="hover:bg-[#f0eded] transition-colors duration-150">
                    <td className="px-4 py-3 font-mono text-sm text-on-surface whitespace-nowrap">
                      {new Date(rec.reportDate).toLocaleDateString('vi-VN', { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric' })}
                    </td>
                    <td className="px-4 py-3 font-mono text-sm font-semibold text-primary whitespace-nowrap">
                      {rec.machineId}
                    </td>
                    <td className="px-4 py-3">
                      <ShiftBadge shift={rec.shift} />
                    </td>
                    <td className="px-4 py-3 text-sm text-on-surface max-w-[180px] truncate" title={rec.color}>
                      {rec.color}
                    </td>
                    <td className="px-4 py-3 font-mono text-sm text-on-surface-variant tabular-nums whitespace-nowrap">
                      {formatNumber(rec.denier)}
                    </td>
                    <td className="px-4 py-3 font-mono text-sm tabular-nums font-semibold text-on-surface whitespace-nowrap">
                      {parseFloat(rec.weightKgs).toLocaleString('vi-VN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 text-sm text-on-surface-variant max-w-[160px] truncate" title={rec.beamNote ?? ''}>
                      {rec.beamNote ?? <span className="italic text-outline">—</span>}
                    </td>
                    <td className="px-4 py-3 font-mono text-sm text-on-surface-variant whitespace-nowrap">
                      {rec.orderRef ?? <span className="italic text-outline">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

          </div>
        )}
      </div>
    </div>
  )
}
