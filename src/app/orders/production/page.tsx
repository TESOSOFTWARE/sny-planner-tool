'use client'
import Link from 'next/link'
import { useState, useEffect } from 'react'
import { useMaterialPage } from '@/components/materials/useMaterialPage'
import TablePager from '@/components/materials/TablePager'

interface Output { id: string; date: string; orderRef: string | null; orderId: string | null; color: string | null; machine: string | null; shift: string | null; kilograms: string | null; meters: string | null; metric: string | null; value: string | null }
interface Result { success: boolean; error?: string; records: Output[]; total: number }
const format = (value: string | null) => value == null ? '—' : Number(value).toLocaleString('vi-VN', { maximumFractionDigits: 2 })
const stages = [['extruder', 'Kéo sợi'], ['warping', 'Mắc sợi'], ['knitting', 'Dệt'], ['rolling', 'Cuộn']] as const
const control = 'rounded border border-outline px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary'

export default function ProductionRecordsPage() {
  const [stage, setStage] = useState('extruder'), [state, setState] = useState('all'), [text, setText] = useState(''), [query, setQuery] = useState('')
  useEffect(() => { const timer = setTimeout(() => setQuery(text.trim()), 300); return () => clearTimeout(timer) }, [text])
  const paging = useMaterialPage<Result>('/api/production-records', new URLSearchParams({ stage, state, q: query }).toString())
  const rows = paging.data?.records ?? [], total = paging.data?.total ?? 0
  return <div className="space-y-5 px-4 py-6 md:px-8" ref={paging.tableRef}>
    <nav className="flex flex-wrap gap-4 text-sm"><Link href="/orders" className="text-primary underline">Đơn hàng</Link><span aria-current="page">Sản lượng theo mã PI</span><Link href="/reports" className="text-primary underline">Báo cáo thống kê / Nhập Excel</Link></nav>
    <div><h1 className="text-2xl font-semibold text-primary">Sản lượng theo mã PI</h1><p className="mt-2 text-sm text-secondary">Tra cứu số thực tế theo mã ghi trong báo cáo. Dòng chưa liên kết vẫn giữ nguyên mã nguồn để rà soát.</p></div>
    <div className="flex flex-wrap gap-3">
      <label className="text-sm">Công đoạn <select className={control} value={stage} onChange={e => setStage(e.target.value)}>{stages.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      <label className="text-sm">Mã PI nguồn <input className={control} type="search" value={text} maxLength={150} onChange={e => setText(e.target.value)} placeholder="Tìm theo mã ghi trong file" /></label>
      <label className="text-sm">Liên kết <select className={control} value={state} onChange={e => setState(e.target.value)}><option value="all">Tất cả</option><option value="linked">Đã gắn item</option><option value="unlinked">Chưa gắn item</option></select></label>
    </div>
    {paging.loading ? <p role="status">Đang tải sản lượng…</p> : paging.error ? <div role="alert" className="text-error">{paging.error} <button className={control} onClick={paging.retry}>Thử lại</button></div> : !rows.length ? <p role="status">Chưa có dữ liệu phù hợp bộ lọc.</p> : <div data-material-scroll className="overflow-x-auto rounded border border-outline-variant"><table className="w-full text-sm"><thead className="bg-surface-container"><tr>{['Ngày', 'PI nguồn', 'Liên kết', 'Máy / Ca', 'Màu', 'Kg', 'Mét', 'Chỉ tiêu nguồn', 'Giá trị'].map(label => <th key={label} scope="col" className="p-3 text-left whitespace-nowrap">{label}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.id} className="border-t border-outline-variant"><td className="p-3 whitespace-nowrap">{row.date.slice(0, 10).split('-').reverse().join('/')}</td><td className="p-3">{row.orderRef ?? 'Chưa ghi mã'}</td><td className="p-3 whitespace-nowrap">{row.orderId ? <Link href={'/orders/' + encodeURIComponent(row.orderId)} className="text-primary underline">Xem item</Link> : 'Chưa gắn item'}</td><td className="p-3 whitespace-nowrap">{row.machine ?? '—'} / {row.shift === 'D' ? 'Ngày' : row.shift === 'N' ? 'Đêm' : '—'}</td><td className="p-3">{row.color ?? '—'}</td><td className="p-3 tabular-nums">{format(row.kilograms)}</td><td className="p-3 tabular-nums">{format(row.meters)}</td><td className="p-3">{row.metric ?? '—'}</td><td className="p-3 tabular-nums">{format(row.value)}</td></tr>)}</tbody></table></div>}
    <TablePager {...paging} total={total} label="Sản lượng" />
  </div>
}
