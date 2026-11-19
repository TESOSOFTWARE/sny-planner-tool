'use client'

import { useEffect, useMemo, useState, type FormEvent } from 'react'

type Stage = 'extruder' | 'warping' | 'knitting' | 'rolling' | 'packing'
type HandoffOrder = { id: string; piNumber: string; subLineIndex: number; color: string | null; orderType: string }
type Handoff = {
  id: string
  fromStage: Stage
  toStage: Stage
  sourceMetricLabel: string
  quantity: string
  unit: string
  transferredAt: string
  shift: string
  handedOffBy: string
  receivedBy: string
  note: string | null
  createdByEmail: string
  createdAt: string
  voidedAt: string | null
  voidedByEmail: string | null
  voidReason: string | null
}
type Transition = { fromStage: Stage; toStage: Stage; sourceMetricLabel: string; unit: string; available: string | null; transferred: string; remaining: string | null }

const stages: Record<Stage, string> = { extruder: 'Kéo sợi', warping: 'Mắc sợi', knitting: 'Dệt', rolling: 'Cuộn', packing: 'Đóng gói' }
const unitLabel = (unit: string) => unit === 'kg' ? 'kg' : unit === 'beam' ? 'beam' : unit === 'm' ? 'm' : unit === 'rolls' ? 'cuộn' : unit === 'pieces' ? 'tấm' : unit
const todayVN = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date())
const control = 'mt-1 block w-full rounded border border-outline px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary'
const button = 'rounded border border-outline px-3 py-2 text-sm text-primary hover:bg-surface-container-low disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary'

export default function ProductionHandoffPanel({ orders, canEnter, defaultOpen = false }: { orders: HandoffOrder[]; canEnter: boolean; defaultOpen?: boolean }) {
  const [orderId, setOrderId] = useState(orders[0]?.id ?? '')
  const [fromStage, setFromStage] = useState<Stage>('extruder')
  const [handoffs, setHandoffs] = useState<Handoff[]>([])
  const [transitions, setTransitions] = useState<Transition[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [quantity, setQuantity] = useState('')
  const [date, setDate] = useState(todayVN)
  const [shift, setShift] = useState<'D' | 'N'>('D')
  const [handedOffBy, setHandedOffBy] = useState('')
  const [receivedBy, setReceivedBy] = useState('')
  const [note, setNote] = useState('')
  const [voidingId, setVoidingId] = useState<string | null>(null)
  const [voidReason, setVoidReason] = useState('')

  const transition = transitions.find(item => item.fromStage === fromStage)
  const isUnavailable = transition?.remaining == null || Number(transition.remaining) <= 0

  async function load() {
    if (!orderId) return
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/handoffs`, { cache: 'no-store' })
      const result = await response.json()
      if (!response.ok || !result.success) throw new Error(result.error ?? 'Không tải được lịch sử bàn giao.')
      setHandoffs(result.handoffs)
      setTransitions(result.transitions)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tải được lịch sử bàn giao.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [orderId]) // eslint-disable-line react-hooks/exhaustive-deps

  const activeHandoffs = useMemo(() => handoffs.filter(row => !row.voidedAt), [handoffs])

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!orderId || !transition || isUnavailable) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/handoffs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromStage, quantity, date, shift, handedOffBy, receivedBy, note }),
      })
      const result = await response.json()
      if (!response.ok || !result.success) throw new Error(result.error ?? 'Không lưu được bàn giao.')
      setNotice('Đã ghi nhận bàn giao WIP.')
      setQuantity('')
      setNote('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không lưu được bàn giao.')
    } finally {
      setBusy(false)
    }
  }

  async function voidHandoff(id: string) {
    if (!orderId || !voidReason.trim()) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/handoffs/${encodeURIComponent(id)}/void`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: voidReason }),
      })
      const result = await response.json()
      if (!response.ok || !result.success) throw new Error(result.error ?? 'Không hủy được bàn giao.')
      setNotice('Đã hủy bản ghi; lịch sử vẫn được lưu.')
      setVoidingId(null)
      setVoidReason('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không hủy được bàn giao.')
    } finally {
      setBusy(false)
    }
  }

  if (orders.length === 0) return null

  return <details open={defaultOpen} className="rounded-lg border border-outline-variant bg-surface-container-lowest">
    <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-primary">Bàn giao WIP giữa công đoạn</summary>
    <div className="space-y-4 border-t border-outline-variant p-4">
      <p className="text-xs text-secondary">Chỉ ghi nhận khi có actual đã liên kết đúng item. Đơn vị cố định theo chặng; không tự quy đổi.</p>
      <label className="block max-w-xl text-sm">Dòng hàng<select className={control} value={orderId} onChange={event => setOrderId(event.target.value)}>{orders.map(order => <option key={order.id} value={order.id}>#{order.subLineIndex} · {order.color ?? 'Chưa có màu'} · {order.piNumber}</option>)}</select></label>

      {canEnter && <form onSubmit={save} className="grid gap-3 rounded border border-outline-variant p-3 sm:grid-cols-2 xl:grid-cols-4">
        <label className="text-sm">Công đoạn giao<select className={control} value={fromStage} onChange={event => setFromStage(event.target.value as Stage)}>{transitions.map(item => <option key={item.fromStage} value={item.fromStage}>{stages[item.fromStage]} → {stages[item.toStage]}</option>)}</select></label>
        <div className="text-sm"><span>Actual khả dụng</span><p className="mt-1 rounded border border-outline-variant bg-surface-container-low px-3 py-2 font-mono">{transition?.available == null ? 'Chưa có actual liên kết' : `${Number(transition.remaining).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} ${unitLabel(transition.unit)} còn trong ${Number(transition.available).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} ${unitLabel(transition.unit)}`}</p></div>
        <label className="text-sm">Số lượng<input className={control} required type="number" min="0.01" step="0.01" max={transition?.remaining ?? undefined} value={quantity} onChange={event => setQuantity(event.target.value)} /></label>
        <label className="text-sm">Ngày bàn giao<input className={control} required type="date" value={date} onChange={event => setDate(event.target.value)} /></label>
        <label className="text-sm">Ca<select className={control} value={shift} onChange={event => setShift(event.target.value as 'D' | 'N')}><option value="D">Ca ngày</option><option value="N">Ca đêm</option></select></label>
        <label className="text-sm">Người giao<input className={control} required maxLength={100} value={handedOffBy} onChange={event => setHandedOffBy(event.target.value)} /></label>
        <label className="text-sm">Người nhận<input className={control} required maxLength={100} value={receivedBy} onChange={event => setReceivedBy(event.target.value)} /></label>
        <label className="text-sm sm:col-span-2">Ghi chú<input className={control} maxLength={1000} value={note} onChange={event => setNote(event.target.value)} /></label>
        <div className="sm:col-span-2 xl:col-span-4"><button className="rounded bg-primary px-4 py-2 text-sm text-on-primary disabled:opacity-50" disabled={busy || loading || isUnavailable}>{busy ? 'Đang lưu…' : `Ghi bàn giao ${transition ? unitLabel(transition.unit) : ''}`}</button></div>
      </form>}

      {notice && <p role="status" className="text-sm text-green-700">{notice}</p>}
      {error && <p role="alert" className="text-sm text-error">{error}</p>}

      <section aria-labelledby="handoff-history-title" className="space-y-2">
        <h3 id="handoff-history-title" className="font-medium">Lịch sử bàn giao</h3>
        {loading ? <p role="status" className="text-sm text-secondary">Đang tải…</p> : handoffs.length === 0 ? <p className="text-sm text-secondary">Chưa có bàn giao WIP.</p> : <div className="overflow-x-auto rounded border border-outline-variant"><table className="w-full text-sm"><thead className="bg-surface-container"><tr>{['Ngày / ca', 'Công đoạn', 'Số lượng', 'Người giao → nhận', 'Người ghi', 'Trạng thái', ...(canEnter ? [''] : [])].map(label => <th key={label} className="p-2 text-left whitespace-nowrap">{label}</th>)}</tr></thead><tbody>{handoffs.map(row => <tr key={row.id} className="border-t border-outline-variant"><td className="p-2 whitespace-nowrap">{new Date(row.transferredAt).toLocaleDateString('vi-VN')} · {row.shift === 'D' ? 'Ngày' : 'Đêm'}</td><td className="p-2 whitespace-nowrap">{stages[row.fromStage]} → {stages[row.toStage]}</td><td className="p-2 font-mono">{Number(row.quantity).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} {unitLabel(row.unit)}</td><td className="p-2">{row.handedOffBy} → {row.receivedBy}</td><td className="p-2">{row.createdByEmail}</td><td className="p-2">{row.voidedAt ? `Đã hủy: ${row.voidReason}` : 'Hiệu lực'}</td>{canEnter && <td className="p-2">{!row.voidedAt && <button type="button" className="text-sm text-error underline" onClick={() => { setVoidingId(row.id); setVoidReason('') }}>Hủy</button>}{voidingId === row.id && <div className="mt-2 flex gap-1"><input aria-label="Lý do hủy" className="min-w-32 rounded border border-outline px-2 py-1 text-xs" value={voidReason} onChange={event => setVoidReason(event.target.value)} placeholder="Lý do hủy" maxLength={500}/><button type="button" className={button} disabled={busy || !voidReason.trim()} onClick={() => voidHandoff(row.id)}>Xác nhận</button><button type="button" className={button} onClick={() => setVoidingId(null)}>Đóng</button></div>}</td>}</tr>)}</tbody></table></div>}
        <p className="text-xs text-secondary">{activeHandoffs.length} bản ghi đang hiệu lực; bản ghi hủy được giữ trong audit.</p>
      </section>
    </div>
  </details>
}
