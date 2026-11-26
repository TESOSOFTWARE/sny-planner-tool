'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import type { ProductionProgressRow } from '@/lib/production/progressSummary'

type ApiResponse = { success: boolean; error?: string; progress?: ProductionProgressRow[]; piCount?: number; unmatchedActualMetrics?: number }
const stageLabels: Record<string, string> = { extruder: 'Kéo sợi', warping: 'Mắc sợi', knitting: 'Dệt', rolling: 'Cuộn' }
const stateLabels: Record<ProductionProgressRow['state'], string> = {
  NO_PLAN: 'Chưa có kế hoạch', NO_ACTUAL: 'Chưa có actual', IN_PROGRESS: 'Đang thực hiện',
  PLAN_REACHED: 'Đạt/vượt kế hoạch', ZERO_PLAN: 'Kế hoạch 0',
}
const control = 'rounded border border-outline px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary'
const format = (value: number | null) => value == null ? '—' : value.toLocaleString('vi-VN', { maximumFractionDigits: 2 })

export default function ProductionProgressWorkspace() {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7))
  const [query, setQuery] = useState('')
  const [progress, setProgress] = useState<ProductionProgressRow[]>([])
  const [piCount, setPiCount] = useState(0)
  const [unmatchedActualMetrics, setUnmatchedActualMetrics] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true); setError('')
    setProgress([]); setPiCount(0); setUnmatchedActualMetrics(0)
    fetch(`/api/orders/progress-summary?month=${encodeURIComponent(month)}`)
      .then(async response => {
        const data = await response.json() as ApiResponse
        if (!response.ok || !data.success) throw new Error(data.error ?? 'Không tải được tiến độ.')
        if (!cancelled) {
          setProgress(data.progress ?? [])
          setPiCount(data.piCount ?? 0)
          setUnmatchedActualMetrics(data.unmatchedActualMetrics ?? 0)
        }
      })
      .catch(problem => { if (!cancelled) setError(problem instanceof Error ? problem.message : 'Không tải được tiến độ.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [month])

  const visible = useMemo(() => {
    const text = query.trim().toLowerCase()
    return progress.filter(row => !text || row.piNumber.toLowerCase().includes(text))
  }, [progress, query])
  const comparableCount = progress.filter(row => row.achievedPercent != null).length

  return <section className="space-y-4 px-4 py-6 md:px-8">
    <header><h2 className="text-xl font-semibold text-primary">Tiến độ theo PI</h2><p className="mt-1 text-sm text-secondary">So kế hoạch và actual trong cùng tháng báo cáo; chỉ tính khi PI, công đoạn, chỉ tiêu và đơn vị khớp.</p></header>
    <div className="flex flex-wrap items-end gap-3">
      <label className="text-sm">Tháng báo cáo<input type="month" className={`${control} ml-2`} value={month} onChange={event => setMonth(event.target.value)} /></label>
      <label className="text-sm">Tìm PI<input type="search" className={`${control} ml-2`} value={query} onChange={event => setQuery(event.target.value)} placeholder="Nhập mã PI" /></label>
    </div>
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded border border-outline-variant bg-surface-container-lowest p-3"><p className="text-xs text-secondary">PI có kế hoạch hoặc actual</p><p className="mt-1 text-xl font-semibold">{piCount.toLocaleString('vi-VN')}</p></div>
      <div className="rounded border border-outline-variant bg-surface-container-lowest p-3"><p className="text-xs text-secondary">Chỉ tiêu so sánh được</p><p className="mt-1 text-xl font-semibold">{comparableCount.toLocaleString('vi-VN')}</p></div>
      <div className="rounded border border-outline-variant bg-surface-container-lowest p-3"><p className="text-xs text-secondary">Chỉ tiêu actual chưa ghép được PI</p><p className="mt-1 text-xl font-semibold">{unmatchedActualMetrics.toLocaleString('vi-VN')}</p></div>
    </div>
    <p className="text-xs text-secondary">Actual lấy từ các báo cáo Excel đã nhập. Kế hoạch và actual được cộng trong tháng đã chọn. Báo cáo hiện không gồm Đóng gói; đạt kế hoạch ở Cuộn không đồng nghĩa đơn đã đóng gói xong.</p>
    {error && <p role="alert" className="text-sm text-error">{error}</p>}
    {loading ? <p role="status" className="text-sm">Đang tải tiến độ…</p> : !error && visible.length === 0 ? <p role="status" className="text-sm text-secondary">Chưa có kế hoạch hoặc actual cho PI trong tháng này.</p> : visible.length > 0 && <div className="overflow-x-auto rounded border border-outline-variant"><table className="w-full min-w-[900px] text-sm"><thead className="bg-surface-container"><tr>{['PI', 'Công đoạn', 'Chỉ tiêu', 'Đơn vị', 'Kế hoạch', 'Actual', '% đạt', 'Tình trạng'].map(label => <th key={label} className="whitespace-nowrap p-3 text-left">{label}</th>)}</tr></thead><tbody>{visible.map((row, index) => <tr key={`${row.piNumber}:${row.stage}:${row.metricLabel}:${row.unit}:${index}`} className="border-t border-outline-variant"><td className="p-3 whitespace-nowrap"><Link className="text-primary underline" href={`/orders/pi/${encodeURIComponent(row.piNumber)}`}>{row.piNumber}</Link></td><td className="p-3">{stageLabels[row.stage] ?? row.stage}</td><td className="p-3">{row.metricLabel}</td><td className="p-3">{row.unit}</td><td className="p-3 tabular-nums">{format(row.planned)}</td><td className="p-3 tabular-nums">{format(row.actual)}</td><td className="p-3 tabular-nums">{row.achievedPercent == null ? '—' : `${row.achievedPercent.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%`}</td><td className="p-3">{stateLabels[row.state]}{row.lastActualDate ? ` · cập nhật ${row.lastActualDate.split('-').reverse().join('/')}` : ''}</td></tr>)}</tbody></table></div>}
  </section>
}
