'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { CalendarException, CalendarExceptionKind } from './useFactoryCalendar'
import { useDismissable } from './useDismissable'
import { DISPLAY_WEEKDAYS } from '@/lib/schedule/piDisplay'
import { vnFixedHolidays, holidayPeriod, type CalendarHoliday } from '@/lib/schedule/vnHolidays'

const WEEK = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']
const LABEL: Record<CalendarExceptionKind, string> = { HOLIDAY: 'Ngày lễ', CLOSURE: 'Ngày nghỉ', MAKEUP: 'Làm bù' }
type Props = {
  yearMonth: string; weekdays: readonly number[]; configured: boolean; note: string;
  exceptions: CalendarException[]; disabled: boolean;
  onSave: (weekdays: number[] | null, note?: string) => Promise<void>;
  onDayChange: (day: number, kind: CalendarExceptionKind | null, note?: string) => Promise<void>;
  onCalendarReload: () => Promise<void>;
}
export default function CalendarMonthPopover({ yearMonth, weekdays, configured, note, exceptions, disabled, onSave, onDayChange, onCalendarReload }: Props) {
  const [open, setOpen] = useState(false), [selected, setSelected] = useState<number[]>([]), [draftNote, setDraftNote] = useState('')
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [holidays, setHolidays] = useState<(CalendarHoliday & { kind: 'HOLIDAY' | 'CLOSURE'; note: string; existing?: CalendarExceptionKind })[]>([])
  const [checkedDates, setCheckedDates] = useState<string[]>([]), [result, setResult] = useState('')
  const [periodFrom, setPeriodFrom] = useState(''), [periodTo, setPeriodTo] = useState(''), [periodName, setPeriodName] = useState('')
  const [periodKind, setPeriodKind] = useState<'HOLIDAY' | 'CLOSURE'>('HOLIDAY')
  const container = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const close = useCallback(() => setOpen(false), [])
  useDismissable(open, close, container, triggerRef)
  // Popover không phải modal: chỉ đưa focus vào phần tử đầu khi mở, không giữ Tab trong khung.
  useEffect(() => {
    if (!open) return
    const frame = requestAnimationFrame(() => container.current?.querySelector<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled)')?.focus())
    return () => cancelAnimationFrame(frame)
  }, [open])
  useEffect(() => { if (open) { setSelected([...weekdays]); setDraftNote(note); setError('') } }, [open, yearMonth, weekdays, note])
  useEffect(() => { setHolidays([]); setCheckedDates([]); setResult('') }, [yearMonth])
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError('')
    try { await action() } catch (e) { setError(e instanceof Error ? e.message : 'Không lưu được lịch nghỉ') } finally { setBusy(false) }
  }
  const previewHolidays = async (rows: CalendarHoliday[], kind: 'HOLIDAY' | 'CLOSURE', fixed: boolean) => {
    const from = fixed ? `${yearMonth.slice(0, 4)}-01-01` : rows[0].date
    const to = fixed ? `${yearMonth.slice(0, 4)}-12-31` : rows[rows.length - 1].date
    const response = await fetch(`/api/calendar?from=${from}&to=${to}`)
    const data = await response.json()
    if (!response.ok || !data.success) throw new Error(data.error ?? 'Không tải được ngoại lệ để xem trước')
    const existing = new Map<string, CalendarExceptionKind>((data.exceptions as CalendarException[]).map(e => [e.date, e.kind]))
    setHolidays(rows.map(h => ({ ...h, kind, note: fixed ? `Lễ VN — ${h.name}` : h.name, existing: existing.get(h.date) })))
    setCheckedDates(rows.filter(h => !existing.has(h.date)).map(h => h.date))
    setResult('')
  }
  const confirmHolidays = async () => {
    const selectedRows = holidays.filter(h => checkedDates.includes(h.date))
    const omittedExisting = holidays.filter(h => h.existing && !checkedDates.includes(h.date)).length
    if (!selectedRows.length) { setResult(`0 thêm · ${omittedExisting} bỏ qua (đã có ngoại lệ; không gửi yêu cầu ghi)`); setHolidays([]); return }
    const response = await fetch('/api/calendar/batch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ days: selectedRows.map(h => ({ date: h.date, kind: h.kind, note: h.note })) }) })
    const data = await response.json()
    if (!response.ok || !data.success) throw new Error(data.error ?? 'Không lưu được ngày nghỉ')
    await onCalendarReload()
    setResult(`${data.added} thêm · ${data.skipped.length + omittedExisting} bỏ qua (ngày đã có ngoại lệ được giữ nguyên)`)
    setHolidays([])
  }
  const monthLabel = `${yearMonth.slice(5)}/${yearMonth.slice(0, 4)}`
  const selectedSummary = DISPLAY_WEEKDAYS.filter(day => selected.includes(day)).map(day => WEEK[day]).join(', ')
  const summary = [...weekdays].sort((a, b) => (a === 0 ? 7 : a) - (b === 0 ? 7 : b)).map(d => WEEK[d]).join(', ') || 'Không nghỉ'
  return <div className="relative">
    <button ref={triggerRef} type="button" disabled={disabled} aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen(!open)} className="rounded-md border border-outline-variant bg-white px-3 py-2 text-xs text-primary focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50">Lịch nghỉ tháng: {summary} · {configured ? 'Đã cấu hình' : 'Mặc định'}</button>
    {open && <div ref={container} role="dialog" aria-label={`Lịch nghỉ tháng ${monthLabel}`} className="absolute left-0 top-full z-40 mt-2 max-h-[75vh] w-[min(420px,calc(100vw-64px))] overflow-auto rounded-lg border border-outline-variant bg-white p-4 shadow-lg">
      <h3 className="mb-2 font-semibold text-primary">Lịch nghỉ tháng {monthLabel}</h3>
      <p className="mb-2 text-xs text-secondary">Ngày lễ / kỳ nghỉ thêm bên dưới được ưu tiên hơn lịch tuần. Đổi lịch nghỉ không tự dời các phân công đã xếp — cần kiểm lại lịch máy.</p>
      <h4 className="mb-2 border-t border-outline-variant pt-3 text-sm font-semibold">1. Nghỉ hằng tuần</h4>
      <p className="mb-2 text-xs text-secondary">Nghỉ hằng tuần (bấm để chọn / bỏ):</p>
      <div className="mb-3 flex flex-wrap gap-1">{DISPLAY_WEEKDAYS.map(day => <button key={day} type="button" aria-pressed={selected.includes(day)} disabled={busy} onClick={() => setSelected(selected.includes(day) ? selected.filter(d => d !== day) : [...selected, day])} className={`rounded border px-3 py-2 text-xs focus-visible:ring-2 focus-visible:ring-primary ${selected.includes(day) ? 'border-primary bg-primary text-white' : 'border-outline-variant text-primary'}`}>{WEEK[day]}</button>)}</div>
      <p className="mb-2 text-xs text-secondary">Đang chọn: {selectedSummary ? `nghỉ ${selectedSummary}` : 'không nghỉ'}</p>
      <label className="block text-xs text-secondary">Ghi chú tháng<input placeholder="VD: Tháng 10 nghỉ thêm T7 do giảm đơn" value={draftNote} onChange={e => setDraftNote(e.target.value)} disabled={busy} className="mt-1 block w-full rounded border border-outline-variant p-2 text-sm" /></label>
      {error && <p role="alert" className="mt-2 text-xs text-error">{error}</p>}
      <div className="my-3 flex flex-wrap gap-2">
        <button type="button" disabled={busy || selected.length > 6} onClick={() => void run(() => onSave(selected, draftNote))} className="rounded bg-primary px-3 py-2 text-xs text-white disabled:opacity-50">{busy ? 'Đang lưu…' : 'Lưu'}</button>
        <button type="button" disabled={busy} onClick={() => void run(() => onSave(null))} className="rounded border border-outline-variant px-3 py-2 text-xs">Về mặc định (chỉ nghỉ CN)</button>
        <button type="button" disabled={busy} onClick={close} className="rounded border border-outline-variant px-3 py-2 text-xs">Đóng</button>
      </div>
      {selected.length > 6 && <p className="text-xs text-error">Phải có ít nhất một ngày làm việc trong tuần.</p>}
      <section className="my-3 border-t border-outline-variant pt-3">
        <h4 className="mb-2 text-sm font-semibold">2. Ngày lễ / kỳ nghỉ</h4>
        <button type="button" disabled={busy} onClick={() => void run(() => previewHolidays(vnFixedHolidays(Number(yearMonth.slice(0, 4))), 'HOLIDAY', true))} className="rounded border border-outline-variant px-3 py-2 text-xs">Điền lễ VN năm {yearMonth.slice(0, 4)}</button>
        <p className="my-2 text-xs text-secondary">Xem trước và chọn ngày nhà máy nghỉ. Ngày đã có ngoại lệ được giữ nguyên.</p>
        <fieldset disabled={busy} className="space-y-2"><legend className="text-sm font-semibold">Thêm kỳ nghỉ</legend>
          <div className="flex flex-wrap gap-2"><label className="text-xs">Từ ngày<input type="date" value={periodFrom} onChange={e => setPeriodFrom(e.target.value)} className="block rounded border border-outline-variant p-1" /></label><label className="text-xs">Đến ngày<input type="date" value={periodTo} onChange={e => setPeriodTo(e.target.value)} className="block rounded border border-outline-variant p-1" /></label></div>
          <label className="block text-xs">Tên kỳ nghỉ<input list="holiday-period-names" maxLength={500} value={periodName} onChange={e => setPeriodName(e.target.value)} className="block w-full rounded border border-outline-variant p-1" /></label>
          <datalist id="holiday-period-names">{['Tết Nguyên đán', 'Giỗ Tổ Hùng Vương', 'Nghỉ liền kề Quốc khánh', 'Nghỉ bù'].map(n => <option key={n} value={n} />)}</datalist>
          <label className="block text-xs">Loại kỳ nghỉ<select value={periodKind} onChange={e => setPeriodKind(e.target.value as 'HOLIDAY' | 'CLOSURE')} className="ml-2 rounded border border-outline-variant p-1"><option value="HOLIDAY">Ngày lễ</option><option value="CLOSURE">Ngày nghỉ</option></select></label>
          <button type="button" onClick={() => void run(() => previewHolidays(holidayPeriod(periodFrom, periodTo, periodName), periodKind, false))} className="rounded border border-outline-variant px-3 py-2 text-xs">Xem trước kỳ nghỉ</button>
        </fieldset>
        {holidays.length > 0 && <div className="mt-3"><h5 className="text-sm font-semibold">Xem trước ngày nghỉ</h5><div className="max-h-40 overflow-auto">{holidays.map(h => <label key={h.date} className="flex items-start gap-2 py-1 text-xs"><input type="checkbox" checked={checkedDates.includes(h.date)} disabled={busy} onChange={e => setCheckedDates(e.target.checked ? [...checkedDates, h.date] : checkedDates.filter(d => d !== h.date))} /><span>{h.date.split('-').reverse().join('/')} — {h.name}{h.existing ? ` · đã có: ${LABEL[h.existing]}` : ''}</span></label>)}</div><button type="button" disabled={busy} onClick={() => void run(confirmHolidays)} className="mt-2 rounded bg-primary px-3 py-2 text-xs text-white">Xác nhận ngày nghỉ</button></div>}
        {result && <p role="status" className="mt-2 text-xs text-primary">{result}</p>}
      </section>
      <h4 className="mb-2 border-t border-outline-variant pt-3 text-sm font-semibold">3. Ngày đã khai báo trong tháng</h4>
      {exceptions.length === 0 ? <p className="text-xs text-secondary">Chưa có ngoại lệ.</p> : <table className="w-full text-xs"><thead><tr><th className="text-left">Ngày</th><th className="text-left">Loại</th><th className="text-left">Ghi chú</th><th>Thao tác</th></tr></thead><tbody>{exceptions.map(e => <tr key={e.date} className="border-t border-outline-variant"><td className="py-2">{e.date.split('-').reverse().join('/')}</td><td><select aria-label={`Loại ngày ${e.date}`} value={e.kind} disabled={busy} onChange={event => { const kind = event.target.value as CalendarExceptionKind; void run(() => onDayChange(Number(e.date.slice(8)), kind, e.note ?? undefined)) }} className="max-w-24 rounded border border-outline-variant p-1">{Object.entries(LABEL).map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}</select></td><td className="max-w-28 break-words">{e.note ?? '—'}</td><td><button type="button" aria-label={`Xoá ngoại lệ ${e.date}`} disabled={busy} onClick={() => void run(() => onDayChange(Number(e.date.slice(8)), null))} className="px-2 py-1 text-error">Xoá</button></td></tr>)}</tbody></table>}
    </div>}
  </div>
}
