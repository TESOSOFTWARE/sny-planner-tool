'use client'

// src/components/materials/ExtruderTab.tsx
// Tab hiển thị Extruder Daily Output — bảng dữ liệu, filter ngày + máy, summary cards.

import { useState, useEffect, useCallback } from 'react'

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
      {isDay ? '☀ Ca ngày' : '🌙 Ca đêm'}
    </span>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ExtruderTab({ onImport }: Props) {
  const [records, setRecords]   = useState<ExtruderRecord[]>([])
  const [total, setTotal]       = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)

  // Filter state
  const [filterDate, setFilterDate]         = useState('')
  const [filterMachine, setFilterMachine]   = useState('')

  // Derived list of machines for dropdown (from loaded records)
  const [availableMachines, setAvailableMachines] = useState<string[]>([])

  const fetchRecords = useCallback(async () => {
    setIsLoading(true)
    setFetchError(null)
    try {
      const params = new URLSearchParams({ limit: '200' })
      if (filterDate)    params.set('date',      filterDate)
      if (filterMachine) params.set('machineId', filterMachine)

      const res  = await fetch(`/api/extruder/records?${params}`)
      const data = await res.json() as ApiResponse
      if (!res.ok || !data.success) { setFetchError(data.error ?? 'Không thể tải dữ liệu.'); return }

      setRecords(data.records)
      setTotal(data.total)

      // Cập nhật danh sách máy có sẵn (chỉ từ lần load không filter theo máy)
      if (!filterMachine) {
        const machines = Array.from(new Set(data.records.map(r => r.machineId))).sort()
        setAvailableMachines(machines)
      }
    } catch {
      setFetchError('Lỗi mạng — không thể kết nối máy chủ.')
    } finally {
      setIsLoading(false)
    }
  }, [filterDate, filterMachine])

  useEffect(() => { fetchRecords() }, [fetchRecords])

  // Summary stats
  const totalKg = records.reduce((s, r) => s + parseFloat(r.weightKgs), 0)
  const machineCount = new Set(records.map(r => r.machineId)).size

  return (
    <div className="space-y-4">

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
        <div className="flex items-center gap-2 p-3 bg-error-container border border-error/30 rounded-lg text-error text-sm">
          <span className="material-symbols-outlined text-[18px]">error</span>
          {fetchError}
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Tổng dòng" value={total}                                                                                    icon="format_list_numbered" />
        <StatCard label="Số máy"    value={machineCount}                                                                             icon="precision_manufacturing" />
        <StatCard label="Tổng sản lượng" value={`${totalKg.toLocaleString('vi-VN', { maximumFractionDigits: 0 })} kg`}              icon="scale" />
      </div>

      {/* Table */}
      <div className="bg-surface-container-lowest border-[0.5px] border-outline-variant rounded-lg overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <svg className="w-6 h-6 animate-spin text-primary" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
          </div>
        ) : records.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <span className="material-symbols-outlined text-[48px] text-outline mb-3">precision_manufacturing</span>
            <p className="text-sm text-secondary">
              {filterDate || filterMachine
                ? 'Không có dữ liệu với filter đã chọn.'
                : 'Chưa có dữ liệu Extruder. Bấm "Import báo cáo" để bắt đầu.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-surface-container border-b-[0.5px] border-outline-variant">
                  {['Ngày', 'Máy', 'Ca', 'Màu sắc', 'Denier', 'Weight (kg)', 'Beam Note', 'Mã PI', ].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-inter font-medium text-secondary uppercase tracking-widest whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/50">
                {records.map(rec => (
                  <tr key={rec.id} className="hover:bg-[#f0eded] transition-colors duration-150">
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
                      {rec.denier != null ? rec.denier : <span className="italic text-outline">—</span>}
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

            {/* Footer count */}
            <div className="border-t-[0.5px] border-outline-variant px-4 py-2 bg-surface-container">
              <p className="text-xs font-inter text-secondary">
                {records.length} dòng{total > records.length ? ` (hiển thị) / ${total} tổng` : ''}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
