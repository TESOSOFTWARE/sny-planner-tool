'use client'

import { useEffect, useState } from 'react'

type Summary = { success: boolean; error?: string; month?: string; imported?: { extruder: { rows: number; kilograms: string }; warping: { rows: number; kilograms: string }; knitting: { rows: number; kilograms: string; meters: string }; rolling: { metric: string; rows: number; value: string }[]; packing: { days: number; kilograms: string; meters: string } }; manual?: { stage: string; unit: string; rows: number; value: string }[] }
const labels: Record<string, string> = { extruder: 'Kéo sợi', warping: 'Mắc sợi', knitting: 'Dệt', rolling: 'Cuộn', packing: 'Đóng gói' }
const n = (value: string) => Number(value).toLocaleString('vi-VN', { maximumFractionDigits: 2 })

export default function ProductionSummary() {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7)), [data, setData] = useState<Summary | null>(null), [error, setError] = useState(''), [loading, setLoading] = useState(false)
  useEffect(() => {
    let stopped = false
    setLoading(true); setError('')
    fetch(`/api/reports/production-summary?month=${encodeURIComponent(month)}`).then(async response => {
      const result = await response.json() as Summary
      if (!response.ok || !result.success) throw new Error(result.error ?? 'Không tải được báo cáo.')
      if (!stopped) setData(result)
    }).catch(e => { if (!stopped) setError(e instanceof Error ? e.message : 'Không tải được báo cáo.') }).finally(() => { if (!stopped) setLoading(false) })
    return () => { stopped = true }
  }, [month])
  const stages = data?.imported ? [
    { label: 'Kéo sợi', rows: data.imported.extruder.rows, value: `${n(data.imported.extruder.kilograms)} kg` },
    { label: 'Mắc sợi', rows: data.imported.warping.rows, value: `${n(data.imported.warping.kilograms)} kg` },
    { label: 'Dệt', rows: data.imported.knitting.rows, value: `${n(data.imported.knitting.kilograms)} kg · ${n(data.imported.knitting.meters)} m` },
    { label: 'Cuộn', rows: data.imported.rolling.reduce((a, r) => a + r.rows, 0), value: `${data.imported.rolling.length} chỉ tiêu nguồn` },
    { label: 'Đóng gói', rows: data.imported.packing.days, value: `${n(data.imported.packing.kilograms)} kg · ${n(data.imported.packing.meters)} m` },
  ] : []
  return <section aria-labelledby="production-summary-title" className="mb-7 rounded border border-outline-variant bg-surface p-4 md:p-6">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 id="production-summary-title" className="text-lg font-semibold text-primary">Tổng quan sản lượng theo tháng</h2><p className="mt-1 text-sm text-secondary">Số liệu nhập từ báo cáo và nhập trực tiếp được tách riêng; các chỉ tiêu cuộn giữ nhãn nguồn.</p></div><label className="text-sm">Kỳ báo cáo<input className="ml-2 rounded border border-outline px-3 py-2" type="month" value={month} onChange={e => setMonth(e.target.value)} /></label></div>
    {loading ? <p role="status" className="mt-4">Đang tải báo cáo…</p> : error ? <p role="alert" className="mt-4 text-sm text-error">{error}</p> : data?.imported && <>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{stages.map(stage=><article key={stage.label} className="rounded border border-outline-variant p-4"><h3 className="text-sm font-medium">{stage.label}</h3><p className="mt-2 text-xl font-semibold tabular-nums text-primary">{stage.value}</p><p className="mt-1 text-xs text-secondary">{stage.rows.toLocaleString('vi-VN')} dòng/ngày nguồn</p></article>)}</div>
      <details className="mt-4"><summary className="cursor-pointer text-sm font-medium text-primary">Xem chỉ tiêu Rolling theo nhãn nguồn</summary><ul className="mt-2 grid gap-2 sm:grid-cols-2">{data.imported.rolling.map(r=><li key={r.metric} className="rounded bg-surface-container p-3 text-sm">{r.metric}: {n(r.value)} · {r.rows} dòng</li>)}</ul></details>
      <details className="mt-3"><summary className="cursor-pointer text-sm font-medium text-primary">Sản lượng nhập trực tiếp (tách khỏi import)</summary>{data.manual?.length ? <ul className="mt-2 grid gap-2 sm:grid-cols-2">{data.manual.map(r=><li key={`${r.stage}:${r.unit}`} className="rounded bg-surface-container p-3 text-sm">{labels[r.stage] ?? r.stage}: {n(r.value)} {r.unit} · {r.rows} dòng</li>)}</ul> : <p className="mt-2 text-sm text-secondary">Chưa có số liệu nhập tay trong kỳ.</p>}</details>
    </>}
  </section>
}
