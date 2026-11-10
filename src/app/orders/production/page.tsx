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

function ProductionRecordsTable() {
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

type Stage = 'extruder' | 'warping' | 'knitting' | 'rolling' | 'packing'
type Entry = { id: string; stage: Stage; reportDate?: string; planDate?: string; machineId: string | null; shift: string | null; orderRef: string | null; orderId: string | null; color: string | null; metricLabel: string; metricValue?: string; plannedValue?: string; unit: string; note: string | null; revision?: number; updatedAt: string }
type OrderCandidate = { id: string; piNumber: string; subLineIndex: number; customer: string; itemCode: string | null; color: string | null; lifecycleStatus: string }
type DropdownOptions = { machines: string[]; colors: string[]; orderRefs: string[]; metrics: string[]; units: string[] }
type PrintPlan = {
  id: string; date: string; machineId: string | null; shift: string | null; orderRef: string | null; orderId: string | null;
  color: string | null; metricLabel: string; plannedValue: string; unit: string; note: string | null; revision: number;
  order: { piNumber: string; subLineIndex: number; customer: string; itemCode: string | null; color: string | null; mbCode: string | null; widthM: number | null; gsm: number | null; productionGsm: number | null } | null;
}
type PrintPayload = { success: boolean; error?: string; stage: 'extruder' | 'knitting'; from: string; to: string; plans: PrintPlan[] }
const stageOptions: [Stage, string][] = [['extruder', 'Kéo sợi'], ['warping', 'Mắc sợi'], ['knitting', 'Dệt'], ['rolling', 'Cuộn'], ['packing', 'Đóng gói']]
const blankForm = { machineId: '', shift: '', orderRef: '', orderId: '', color: '', metricLabel: '', value: '', unit: 'kg', note: '' }

function printDateRange(date: string, mode: 'week' | 'month') {
  const [year, month, day] = date.split('-').map(Number)
  if (mode === 'month') return { from: `${year}-${String(month).padStart(2, '0')}-01`, to: `${year}-${String(month).padStart(2, '0')}-${String(new Date(Date.UTC(year, month, 0)).getUTCDate()).padStart(2, '0')}` }
  const selected = new Date(Date.UTC(year, month - 1, day))
  const mondayOffset = (selected.getUTCDay() + 6) % 7
  const from = new Date(selected.getTime() - mondayOffset * 86400000)
  const to = new Date(from.getTime() + 6 * 86400000)
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) }
}

const printDate = (value: string) => value.split('-').reverse().join('/')
const printNumber = (value: string | number | null | undefined) => value == null ? '—' : Number(value).toLocaleString('vi-VN', { maximumFractionDigits: 2 })

function ProductionPlanPrint({ stage, date, onClose }: { stage: 'extruder' | 'knitting'; date: string; onClose: () => void }) {
  const [mode, setMode] = useState<'week' | 'month'>('week')
  const [payload, setPayload] = useState<PrintPayload | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const range = stage === 'extruder' ? { from: date, to: date } : printDateRange(date, mode)
  const title = stage === 'extruder' ? 'KẾ HOẠCH KÉO SỢI HẰNG NGÀY' : mode === 'week' ? 'KẾ HOẠCH DỆT THEO TUẦN' : 'KẾ HOẠCH DỆT THEO THÁNG'

  async function loadPreview() {
    setLoading(true); setError(''); setPayload(null)
    try {
      const query = new URLSearchParams({ stage, from: range.from, to: range.to })
      const response = await fetch(`/api/production-plans/print-data?${query}`)
      const result = await response.json()
      if (!response.ok || !result.success) throw new Error(result.error ?? 'Không tải được bản in.')
      setPayload(result as PrintPayload)
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Không tải được bản in.') }
    finally { setLoading(false) }
  }

  const plans = payload?.plans ?? []
  const totalsByUnit = Array.from(plans.reduce((totals, plan) => totals.set(plan.unit, (totals.get(plan.unit) ?? 0) + Number(plan.plannedValue)), new Map<string, number>()).entries())
  const printGroups = stage === 'extruder' ? plans.reduce<PrintPlan[][]>((groups, plan) => {
    const current = groups[groups.length - 1]
    if (!current || current[0].machineId !== plan.machineId) groups.push([plan])
    else current.push(plan)
    return groups
  }, []) : [plans]
  return <section className="space-y-3 rounded border border-outline-variant p-4" aria-label="Mẫu in kế hoạch">
    <div className="no-print flex flex-wrap items-end gap-3">
      <div className="mr-auto"><h2 className="font-semibold text-primary">Mẫu in cho xưởng</h2><p className="mt-1 text-xs text-secondary">{stage === 'extruder' ? 'Lịch theo ngày, tách theo máy kéo sợi.' : 'Chọn tuần hoặc tháng; lịch được nhóm theo máy và PI/item.'}</p></div>
      {stage === 'knitting' && <label className="text-sm">Kỳ in<select className={control} value={mode} onChange={e => { setMode(e.target.value as 'week' | 'month'); setPayload(null) }}><option value="week">Theo tuần (T2–CN)</option><option value="month">Theo tháng</option></select></label>}
      <p className="text-sm">Khoảng ngày: <strong>{printDate(range.from)} – {printDate(range.to)}</strong></p>
      <button type="button" disabled={loading} onClick={loadPreview} className="rounded border border-primary px-4 py-2 text-sm text-primary disabled:opacity-60">{loading ? 'Đang tải…' : 'Xem trước bản in'}</button>
      {payload && <button type="button" onClick={() => window.print()} className="rounded bg-primary px-4 py-2 text-sm text-white">In lịch</button>}
      <button type="button" onClick={onClose} className="rounded border px-3 py-2 text-sm">Đóng</button>
    </div>
    {error && <p role="alert" className="no-print text-sm text-error">{error}</p>}
    {payload && <div id="production-print-sheet" className={stage === 'extruder' ? 'print-extruder' : 'print-knitting'}>
      <header className="print-header">
        <div className="font-bold tracking-wide">SNY VINA</div><h1>{title}</h1>
        <div>{stage === 'extruder' ? 'Ngày sản xuất' : 'Kỳ kế hoạch'}: {printDate(payload.from)}{payload.from !== payload.to && ` – ${printDate(payload.to)}`}</div>
        <div>Ngày in: {printDate(new Date().toLocaleDateString('sv-SE'))}　|　Đơn vị kế hoạch được giữ theo dữ liệu đã lập</div>
      </header>
      {!plans.length ? <p className="print-empty">Không có kế hoạch trong khoảng thời gian đã chọn.</p> : <div className="print-table-stack">{printGroups.map((group, groupIndex) => {
        const columns = stage === 'extruder'
          ? ['STT', 'Máy / Ca', 'PI / Mã đơn', 'Item', 'Khách hàng', 'Màu / MB Code', 'GSM', 'Chỉ tiêu', 'Kế hoạch', 'Thực tế', 'Phiên bản', 'Ghi chú']
          : ['STT', 'Ngày', 'Máy dệt', 'PI / Mã đơn', 'Item', 'Khách hàng', 'Màu', 'Khổ (m)', 'GSM', 'Kế hoạch', 'Thực tế', 'Phiên bản', 'Ghi chú']
        return <table key={`${group[0]?.machineId ?? 'machine'}-${groupIndex}`} className={`print-table ${stage === 'extruder' ? 'print-machine-table' : ''}`}>
        <thead><tr><th colSpan={columns.length} className="print-report-title">{title} · {printDate(payload.from)}{payload.from !== payload.to && ` – ${printDate(payload.to)}`}{stage === 'extruder' ? ` · Máy ${group[0]?.machineId ?? 'chưa phân máy'}` : ''}</th></tr><tr>{columns.map(column => <th key={column}>{column}</th>)}</tr></thead>
        <tbody>{group.map((plan, index) => {
          const order = plan.order, item = order ? (order.itemCode || `Dòng ${order.subLineIndex + 1}`) : plan.orderId ? 'Item' : 'Chưa gắn item'
          const pi = order?.piNumber ?? plan.orderRef ?? '—', color = order?.color ?? plan.color ?? '—', gsm = order?.productionGsm ?? order?.gsm
          return <tr key={plan.id}>
            <td>{index + 1}</td>
            {stage === 'extruder' ? <>
              <td>{plan.machineId ?? '—'}{plan.shift ? ` / ${plan.shift === 'D' ? 'Ngày' : 'Đêm'}` : ''}</td><td>{pi}</td><td>{item}</td><td>{order?.customer ?? '—'}</td>
              <td>{color}{order?.mbCode ? ` / ${order.mbCode}` : ''}</td><td>{printNumber(gsm)}</td><td>{plan.metricLabel}</td><td>{printNumber(plan.plannedValue)} {plan.unit}</td>
              <td className="print-handwritten"></td><td>v{plan.revision}</td><td>{plan.note || '—'}</td>
            </> : <>
              <td>{printDate(plan.date)}</td><td>{plan.machineId ?? '—'}{plan.shift ? ` / ${plan.shift === 'D' ? 'Ngày' : 'Đêm'}` : ''}</td><td>{pi}</td><td>{item}</td>
              <td>{order?.customer ?? '—'}</td><td>{color}</td><td>{printNumber(order?.widthM)}</td><td>{printNumber(gsm)}</td>
              <td>{printNumber(plan.plannedValue)} {plan.unit}</td><td className="print-handwritten"></td><td>v{plan.revision}</td><td>{plan.note || '—'}</td>
            </>}
          </tr>
        })}</tbody>
      </table>})}</div>}
      {plans.length > 0 && <div className="print-totals"><strong>Tổng kế hoạch:</strong> {totalsByUnit.map(([unit, total]) => `${printNumber(total)} ${unit}`).join('　|　')}<span>Thực tế: ____________________</span></div>}
      <footer className="print-signatures"><span>Người vận hành: ____________________</span><span>Quản đốc xác nhận: ____________________</span><span>Người lập kế hoạch: ____________________</span></footer>
    </div>}
  </section>
}

function EntryForm({ kind, stage, date, onSaved, editing, onCancel }: { kind: 'actual' | 'plan'; stage: Stage; date: string; onSaved: () => void; editing?: Entry | null; onCancel?: () => void }) {
  const [form, setForm] = useState(blankForm), [saving, setSaving] = useState(false), [error, setError] = useState(''), [candidates, setCandidates] = useState<OrderCandidate[]>([]), [lookupError, setLookupError] = useState('')
  const [options, setOptions] = useState<DropdownOptions>({ machines: [], colors: [], orderRefs: [], metrics: [], units: [] }), [optionsError, setOptionsError] = useState('')
  const [other, setOther] = useState({ machine: false, pi: false, color: false, metric: false, unit: false })
  useEffect(() => { setForm(editing ? { machineId: editing.machineId ?? '', shift: editing.shift ?? '', orderRef: editing.orderRef ?? '', orderId: editing.orderId ?? '', color: editing.color ?? '', metricLabel: editing.metricLabel, value: editing.plannedValue ?? '', unit: editing.unit, note: editing.note ?? '' } : blankForm); setCandidates([]); setOther({ machine: false, pi: false, color: false, metric: false, unit: false }) }, [editing])
  useEffect(() => {
    let ignore = false
    setOptionsError('')
    fetch(`/api/production-records/dropdown-options?stage=${stage}`).then(async response => {
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.error ?? 'Không tải được danh sách lựa chọn.')
      if (!ignore) setOptions(data.options)
    }).catch(e => { if (!ignore) setOptionsError(e instanceof Error ? e.message : 'Không tải được danh sách lựa chọn.') })
    return () => { ignore = true }
  }, [stage])
  const control = 'w-full rounded border border-outline px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary'
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError('')
    try {
      const body = { stage, date, ...form, orderId: form.orderId || undefined, value: Number(form.value), ...(form.shift ? {} : { shift: undefined }), ...(editing ? { expectedUpdatedAt: editing.updatedAt } : {}) }
      const url = editing ? `/api/production-plans/${editing.id}` : kind === 'plan' ? '/api/production-plans' : '/api/production-records/manual'
      const res = await fetch(url, { method: editing ? 'PATCH' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      const result = await res.json()
      if (!res.ok || !result.success) { setError(result.error ?? 'Không lưu được dữ liệu.'); return }
      setForm(blankForm); setOther({ machine: false, pi: false, color: false, metric: false, unit: false }); onSaved(); onCancel?.()
    } catch { setError('Lỗi kết nối — chưa lưu được dữ liệu.') }
    finally { setSaving(false) }
  }
  async function lookupOrder(pi = form.orderRef) {
    setLookupError(''); setCandidates([])
    if (!pi.trim()) return
    try { const response = await fetch(`/api/production-records/order-candidates?pi=${encodeURIComponent(pi.trim())}`); const data = await response.json(); if (!response.ok || !data.success) throw new Error(data.error ?? 'Không tra được PI.'); setCandidates(data.orders) }
    catch (e) { setLookupError(e instanceof Error ? e.message : 'Không tra được PI.') }
  }
  const machineOptions = Array.from(new Set([...options.machines, ...(form.machineId ? [form.machineId] : [])]))
  const piOptions = Array.from(new Set([...options.orderRefs, ...(form.orderRef ? [form.orderRef] : [])]))
  const colorOptions = Array.from(new Set([...options.colors, ...(form.color ? [form.color] : [])]))
  const metricOptions = Array.from(new Set([...options.metrics, ...(form.metricLabel ? [form.metricLabel] : [])]))
  const unitOptions = Array.from(new Set([...options.units, ...(form.unit ? [form.unit] : [])]))
  return <form onSubmit={submit} className="grid gap-3 rounded border border-outline-variant p-4 md:grid-cols-4">
    <label className="text-sm">Ngày<input type="date" className={control} value={date} readOnly /></label>
    <label className="text-sm">Máy<select className={control} value={other.machine ? '__other__' : form.machineId} onChange={e => e.target.value === '__other__' ? (setOther({ ...other, machine: true }),setForm({ ...form, machineId: '' })) : (setOther({ ...other, machine: false }),setForm({ ...form, machineId: e.target.value }))}><option value="">Chọn máy</option>{machineOptions.map(value=><option key={value} value={value}>{value}</option>)}<option value="__other__">Nhập máy khác…</option></select>{other.machine&&<input className={`${control} mt-1`} aria-label="Nhập mã máy khác" maxLength={40} value={form.machineId} onChange={e=>setForm({...form,machineId:e.target.value})}/>}</label>
    <label className="text-sm">Ca<select className={control} value={form.shift} onChange={e => setForm({ ...form, shift: e.target.value })}><option value="">Không áp dụng</option><option value="D">Ngày</option><option value="N">Đêm</option></select></label>
    <label className="text-sm">PI nguồn<select className={control} value={other.pi ? '__other__' : form.orderRef} onChange={e=>{const value=e.target.value;if(value==='__other__'){setOther({...other,pi:true});setForm({...form,orderRef:'',orderId:''});setCandidates([])}else{setOther({...other,pi:false});setForm({...form,orderRef:value,orderId:''});void lookupOrder(value)}}}><option value="">Chọn PI</option>{piOptions.map(value=><option key={value} value={value}>{value}</option>)}<option value="__other__">Nhập PI khác…</option></select>{other.pi&&<input className={`${control} mt-1`} aria-label="Nhập PI nguồn khác" maxLength={150} value={form.orderRef} onChange={e=>setForm({...form,orderRef:e.target.value,orderId:''})} onBlur={()=>void lookupOrder()}/>}</label>
    <label className="text-sm">Màu<select className={control} value={other.color ? '__other__' : form.color} onChange={e=>e.target.value==='__other__'?(setOther({...other,color:true}),setForm({...form,color:''})):(setOther({...other,color:false}),setForm({...form,color:e.target.value}))}><option value="">Chọn màu</option>{colorOptions.map(value=><option key={value} value={value}>{value}</option>)}<option value="__other__">Nhập màu khác…</option></select>{other.color&&<input className={`${control} mt-1`} aria-label="Nhập màu khác" maxLength={120} value={form.color} onChange={e=>setForm({...form,color:e.target.value})}/>}</label>
    <label className="text-sm">Chỉ tiêu<select required className={control} value={other.metric ? '__other__' : form.metricLabel} onChange={e=>e.target.value==='__other__'?(setOther({...other,metric:true}),setForm({...form,metricLabel:''})):(setOther({...other,metric:false}),setForm({...form,metricLabel:e.target.value}))}><option value="">Chọn chỉ tiêu</option>{metricOptions.map(value=><option key={value} value={value}>{value}</option>)}<option value="__other__">Nhập chỉ tiêu khác…</option></select>{other.metric&&<input className={`${control} mt-1`} aria-label="Nhập chỉ tiêu khác" required maxLength={80} value={form.metricLabel} onChange={e=>setForm({...form,metricLabel:e.target.value})}/>}</label>
    <label className="text-sm">Số lượng<input required type="number" min="0" step="0.01" className={control} value={form.value} onChange={e => setForm({ ...form, value: e.target.value })} /></label>
    <label className="text-sm">Đơn vị<select required className={control} value={other.unit ? '__other__' : form.unit} onChange={e=>e.target.value==='__other__'?(setOther({...other,unit:true}),setForm({...form,unit:''})):(setOther({...other,unit:false}),setForm({...form,unit:e.target.value}))}><option value="">Chọn đơn vị</option>{unitOptions.map(value=><option key={value} value={value}>{value}</option>)}<option value="__other__">Nhập đơn vị khác…</option></select>{other.unit&&<input className={`${control} mt-1`} aria-label="Nhập đơn vị khác" required maxLength={24} value={form.unit} onChange={e=>setForm({...form,unit:e.target.value})}/>}</label>
    {candidates.length > 0 && <label className="text-sm md:col-span-2">Dòng đơn (chọn đúng item)<select className={control} value={form.orderId} onChange={e => {const candidate=candidates.find(order=>order.id===e.target.value);setForm({ ...form, orderId: e.target.value, color: candidate?.color ?? form.color })}}><option value="">Giữ chưa liên kết</option>{candidates.map(order=><option key={order.id} value={order.id}>Dòng {order.subLineIndex + 1} · {order.color ?? 'Chưa có màu'} · {order.itemCode ?? 'Chưa có mã item'} · {order.customer}</option>)}</select></label>}
    {lookupError && <p role="alert" className="text-xs text-error md:col-span-2">{lookupError}</p>}
    {optionsError && <p role="status" className="text-xs text-secondary md:col-span-4">Không tải được danh sách có sẵn; chọn “Nhập … khác” để điền thủ công.</p>}
    <label className="text-sm md:col-span-3">Ghi chú<input className={control} maxLength={1000} value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} /></label>
    {error && <p role="alert" className="text-sm text-error md:col-span-4">{error}</p>}
    <div className="flex gap-2 md:col-span-4"><button disabled={saving} className="rounded bg-primary px-4 py-2 text-sm text-white disabled:opacity-60">{saving ? 'Đang lưu…' : editing ? 'Lưu phiên bản kế hoạch' : kind === 'plan' ? 'Tạo kế hoạch' : 'Lưu sản lượng'}</button>{editing && <button type="button" className="rounded border px-4 py-2 text-sm" onClick={onCancel}>Hủy sửa</button>}</div>
  </form>
}

function ProductionEntryWorkspace({ kind }: { kind: 'actual' | 'plan' }) {
  const [stage, setStage] = useState<Stage>('extruder'), [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [rows, setRows] = useState<Entry[]>([]), [loading, setLoading] = useState(false), [error, setError] = useState(''), [editing, setEditing] = useState<Entry | null>(null)
  const [showPrint, setShowPrint] = useState(false)
  const endpoint = kind === 'plan' ? '/api/production-plans' : '/api/production-records/manual'
  const load = async () => {
    setLoading(true); setError('')
    try { const res = await fetch(`${endpoint}?stage=${stage}&date=${date}`); const data = await res.json(); if (!res.ok || !data.success) throw new Error(data.error ?? 'Không tải được dữ liệu.'); setRows(kind === 'plan' ? data.plans : data.entries) }
    catch (e) { setError(e instanceof Error ? e.message : 'Không tải được dữ liệu.') }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [stage, date])
  const control = 'rounded border border-outline px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary'
  return <section className="space-y-4">
    {kind === 'plan' && (stage === 'extruder' || stage === 'knitting') && <div>{showPrint
      ? <ProductionPlanPrint key={`${stage}-${date}`} stage={stage} date={date} onClose={() => setShowPrint(false)} />
      : <button type="button" onClick={() => setShowPrint(true)} className="no-print rounded border border-primary px-4 py-2 text-sm text-primary">Mở mẫu in</button>}</div>}
    <div className="flex flex-wrap items-end gap-3"><label className="text-sm">Công đoạn<select className={control} value={stage} onChange={e => setStage(e.target.value as Stage)}>{stageOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="text-sm">Ngày<input type="date" className={control} value={date} onChange={e => setDate(e.target.value)} /></label></div>
    <EntryForm key={`${kind}-${stage}-${date}-${editing?.id ?? 'new'}`} kind={kind} stage={stage} date={date} editing={editing} onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); void load() }} />
    {kind === 'actual' && <p className="text-sm text-secondary">Máy, PI, màu, chỉ tiêu và đơn vị có danh sách chọn từ dữ liệu sẵn có. Nếu giá trị chưa có, chọn mục “Nhập … khác”. Các file báo cáo Excel theo công đoạn được nhập ở <Link href="/reports" className="text-primary underline">Báo cáo thống kê</Link>. Dòng PI chưa xác minh được item được giữ nguyên và chưa gắn đơn.</p>}
    {error && <p role="alert" className="text-sm text-error">{error}</p>}{loading ? <p role="status">Đang tải…</p> : !rows.length ? <p role="status">Chưa có dữ liệu cho bộ lọc này.</p> : <div className="overflow-x-auto rounded border border-outline-variant"><table className="w-full text-sm"><thead className="bg-surface-container"><tr>{['Ngày','Công đoạn','Máy','PI nguồn','Chỉ tiêu','Số lượng','Đơn vị','Phiên bản',''].map(x=><th key={x} className="p-3 text-left">{x}</th>)}</tr></thead><tbody>{rows.map(row=><tr key={row.id} className="border-t border-outline-variant"><td className="p-3 whitespace-nowrap">{(row.planDate ?? row.reportDate ?? '').slice(0,10).split('-').reverse().join('/')}</td><td className="p-3">{stageOptions.find(([v])=>v===row.stage)?.[1]}</td><td className="p-3">{row.machineId ?? '—'}</td><td className="p-3">{row.orderRef ?? '—'}{row.orderRef && <span className="ml-2 text-xs text-secondary">(chưa gắn item)</span>}</td><td className="p-3">{row.metricLabel}</td><td className="p-3 tabular-nums">{Number(row.plannedValue ?? row.metricValue).toLocaleString('vi-VN',{maximumFractionDigits:2})}</td><td className="p-3">{row.unit}</td><td className="p-3">{kind==='plan' ? `v${row.revision}` : 'Nhập tay'}</td><td className="p-3">{kind==='plan' && <button className="text-primary underline" onClick={()=>setEditing(row)}>Sửa</button>}</td></tr>)}</tbody></table></div>}
  </section>
}

export default function ProductionRecordsPage() {
  const [tab, setTab] = useState<'imported'|'manual'|'plans'>('imported')
  const tabs = [['imported','Sản lượng từ báo cáo'],['manual','Nhập sản lượng trực tiếp'],['plans','Kế hoạch sản xuất']] as const
  return <div className="space-y-4"><div role="tablist" aria-label="Sản lượng và kế hoạch" className="flex gap-2 overflow-x-auto border-b border-outline-variant px-4 pt-4 md:px-8">{tabs.map(([id,label])=><button key={id} role="tab" aria-selected={tab===id} onClick={()=>setTab(id)} className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm ${tab===id?'border-primary font-semibold text-primary':'border-transparent text-secondary'}`}>{label}</button>)}</div>{tab==='imported'?<ProductionRecordsTable/>:<div className="px-4 pb-6 md:px-8"><ProductionEntryWorkspace key={tab} kind={tab==='plans'?'plan':'actual'}/></div>}</div>
}
