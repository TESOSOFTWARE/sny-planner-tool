'use client'

// src/components/materials/KnittingDetailTab.tsx
// Tab hiển thị Knitting Daily Detail — bảng dữ liệu chi tiết ca/màu/đơn + thông số máy dệt.

import { useState, useEffect, useCallback } from 'react'

interface KnittingDetailRecord {
  id:             string
  machineId:      string
  reportDate:     string
  shift:          string
  width:          string | null
  color:          string
  weightSpec:     string | null
  lengthM:        string | null
  tapeRoll:       string | null
  mValue:         string | null
  avgPerRoll:     string | null
  quantity:       string | null
  weightKgs:      string
  orderRef:       string | null
  machineNote:    string | null
  machineSizeM:   string | null
  cmPerMin:       string | null
  meterPerDay:    string | null
  operatingGrade: string | null
  totalPct:       string | null
}

interface ApiResponse {
  success: boolean
  records: KnittingDetailRecord[]
  total:   number
  error?:  string
}

interface Props {
  onImport: () => void
}

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

export default function KnittingDetailTab({ onImport }: Props) {
  const [records, setRecords]   = useState<KnittingDetailRecord[]>([])
  const [total, setTotal]       = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const [filterDate, setFilterDate]       = useState('')
  const [filterMachine, setFilterMachine] = useState('')
  const [availableMachines, setAvailableMachines] = useState<string[]>([])

  const fetchRecords = useCallback(async () => {
    setIsLoading(true)
    setFetchError(null)
    try {
      const params = new URLSearchParams({ limit: '300' })
      if (filterDate)    params.set('date',      filterDate)
      if (filterMachine) params.set('machineId', filterMachine)

      const res  = await fetch(`/api/knitting/detail/records?${params}`)
      const data = await res.json() as ApiResponse
      if (!res.ok || !data.success) { setFetchError(data.error ?? 'Không thể tải dữ liệu.'); return }

      setRecords(data.records)
      setTotal(data.total)

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

  const totalKg = records.reduce((s, r) => s + parseFloat(r.weightKgs), 0)
  const totalM = records.reduce((s, r) => s + (r.lengthM ? parseFloat(r.lengthM) : 0), 0)
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
            <option value="">Tất cả 40 máy dệt</option>
            {Array.from({ length: 40 }, (_, i) => `M-${String(i + 1).padStart(3, '0')}`).map(m => (
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
            href="/api/knitting/detail/template"
            className="inline-flex items-center gap-2 px-4 py-2 border border-outline text-on-surface-variant hover:bg-surface-container-lowest rounded-md text-sm font-medium transition-colors"
            download
          >
            <span className="material-symbols-outlined text-[18px]">download</span>
            Tải mẫu Knitting Detail
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
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Tổng dòng"     value={total}                                                                                    icon="format_list_numbered" />
        <StatCard label="Máy dệt hoạt động" value={machineCount}                                                                         icon="grid_view" />
        <StatCard label="Tổng sản lượng" value={`${totalKg.toLocaleString('vi-VN', { maximumFractionDigits: 0 })} kg`}              icon="scale" />
        <StatCard label="Tổng chiều dài" value={`${totalM.toLocaleString('vi-VN', { maximumFractionDigits: 0 })} m`}                icon="straighten" />
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
            <span className="material-symbols-outlined text-[48px] text-outline mb-3">format_list_bulleted</span>
            <p className="text-sm text-secondary">
              {filterDate || filterMachine
                ? 'Không có dữ liệu với filter đã chọn.'
                : 'Chưa có dữ liệu Knitting Detail. Bấm "Import báo cáo" để bắt đầu.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-inter">
              <thead>
                <tr className="bg-surface-container border-b-[0.5px] border-outline-variant">
                  {['Ngày', 'Máy Dệt', 'Size(m)', 'Cm/Phút', 'M/Ngày', 'Ca', 'Khổ(m)', 'Màu sắc', 'Trọng lượng(kg)', 'Chiều dài(m)', 'Quantity', 'Ghi chú vận hành', 'Mã PI'].map(h => (
                    <th key={h} className="px-3 py-3 text-left font-medium text-secondary uppercase tracking-wider whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/50">
                {records.map(rec => (
                  <tr key={rec.id} className="hover:bg-[#f0eded] transition-colors duration-150">
                    <td className="px-3 py-2.5 font-mono text-on-surface whitespace-nowrap">
                      {new Date(rec.reportDate).toLocaleDateString('vi-VN', { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric' })}
                    </td>
                    <td className="px-3 py-2.5 font-mono font-semibold text-primary whitespace-nowrap">
                      {rec.machineId}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-on-surface-variant tabular-nums whitespace-nowrap">
                      {rec.machineSizeM ? `${rec.machineSizeM}m` : <span className="italic text-outline">—</span>}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-on-surface-variant tabular-nums whitespace-nowrap">
                      {rec.cmPerMin ?? <span className="italic text-outline">—</span>}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-on-surface-variant tabular-nums whitespace-nowrap">
                      {rec.meterPerDay ?? <span className="italic text-outline">—</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      <ShiftBadge shift={rec.shift} />
                    </td>
                    <td className="px-3 py-2.5 font-mono text-on-surface-variant tabular-nums whitespace-nowrap">
                      {rec.width != null ? `${rec.width}m` : <span className="italic text-outline">—</span>}
                    </td>
                    <td className="px-3 py-2.5 font-medium text-on-surface max-w-[130px] truncate" title={rec.color}>
                      {rec.color}
                    </td>
                    <td className="px-3 py-2.5 font-mono font-semibold tabular-nums text-on-surface whitespace-nowrap">
                      {parseFloat(rec.weightKgs).toLocaleString('vi-VN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-on-surface-variant tabular-nums whitespace-nowrap">
                      {rec.lengthM ? `${parseFloat(rec.lengthM).toLocaleString('vi-VN')} m` : <span className="italic text-outline">—</span>}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-on-surface-variant tabular-nums whitespace-nowrap">
                      {rec.quantity ?? <span className="italic text-outline">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-xs font-medium min-w-[180px]" title={rec.machineNote ?? ''}>
                      {rec.machineNote ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-[#fef2f2] border border-[#fecaca] text-[#b91c1c] font-medium text-[11px] leading-tight">
                          <span className="material-symbols-outlined text-[14px] shrink-0">info</span>
                          {rec.machineNote}
                        </span>
                      ) : (
                        <span className="italic text-outline">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-on-surface-variant whitespace-nowrap">
                      {rec.orderRef ?? <span className="italic text-outline">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

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
