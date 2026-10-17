'use client'

import { useCallback, useRef, useState } from 'react'
import type { BulkEditPlan } from '@/lib/schedule/bulkPlan'
import type { BulkEditBody } from '@/lib/validations/bulkEdit'
import { useScheduleModalFocus } from './useModalFocus'

type Selected = { id: string; updatedAt: string; machineId: string }
const displayDay = (day: string) => day.split('-').reverse().join('/')
const displayChange = (before: string, after: string) => before === after ? before : `${before} → ${after}`
const button = 'h-9 rounded-md border border-outline-variant px-4 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50'
const input = 'mt-1 h-10 w-full rounded-lg border border-outline px-3 text-sm focus:border-primary focus:ring-1 focus:ring-primary'

export default function BulkEditModal({ selected, onClose, onSuccess, onStale, initialCommand = 'MOVE_MACHINE' }: {
  selected: Selected[]; onClose: () => void; onSuccess: (updated: number) => void; onStale: () => void; initialCommand?: 'MOVE_MACHINE' | 'SHIFT_DAYS'
}) {
  const [command, setCommand] = useState<'MOVE_MACHINE' | 'SHIFT_DAYS'>(initialCommand)
  const sourceMachines = new Set(selected.map(row => row.machineId))
  const machines = Array.from({ length: 40 }, (_, index) => `M-${String(index + 1).padStart(3, '0')}`).filter(machine => sourceMachines.size !== 1 || !sourceMachines.has(machine))
  const [targetMachineId, setTargetMachineId] = useState(machines[0] ?? '')
  const [direction, setDirection] = useState('1')
  const [days, setDays] = useState('1')
  const [preview, setPreview] = useState<{ plan: BulkEditPlan; planHash: string } | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [isBusy, setIsBusy] = useState(false)
  const busy = useRef(false), modal = useRef<HTMLDivElement>(null)
  const close = useCallback(() => { if (!busy.current) onClose() }, [onClose])
  useScheduleModalFocus(true, close, modal)
  const invalidate = () => { setPreview(null); setError(''); setNotice('') }
  const valid = command === 'MOVE_MACHINE' ? !!targetMachineId : Number.isInteger(Number(days)) && Number(days) >= 1 && Number(days) <= 60
  const body: BulkEditBody = { ...(command === 'MOVE_MACHINE' ? { command, targetMachineId } : { command, workingDays: Number(days) * Number(direction) }), assignments: selected.map(({ id, updatedAt }) => ({ id, updatedAt })) }
  const submit = async (commit: boolean) => {
    if (busy.current || !valid || (commit && (!preview?.plan.changes.length || preview.plan.conflicts.length))) return
    busy.current = true; setIsBusy(true); setError(''); setNotice('')
    if (!commit) setPreview(null)
    try {
      const response = await fetch(`/api/assignments/bulk-edit${commit ? '' : '/preview'}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(commit ? { ...body, planHash: preview!.planHash } : body),
      })
      const result = await response.json()
      if (result.code === 'STALE_SELECTION') { onStale(); return }
      if (result.code === 'STALE_PLAN') { setPreview({ plan: result.plan, planHash: result.planHash }); setNotice('Lịch đã thay đổi, xem lại bản mới trước khi xác nhận.'); return }
      if (result.code === 'CONFLICT' && preview) setPreview({ ...preview, plan: { ...preview.plan, conflicts: result.conflicts } })
      if (!response.ok) throw new Error(result.error || 'Không thể sửa lịch. Vui lòng thử lại.')
      if (commit) onSuccess(result.updated)
      else setPreview({ plan: result.plan, planHash: result.planHash })
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không tải được bản xem trước. Vui lòng thử lại.') }
    finally { busy.current = false; setIsBusy(false) }
  }
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" onClick={close}>
    <div ref={modal} role="dialog" aria-modal="true" aria-labelledby="bulk-edit-title" onClick={event => event.stopPropagation()} className="max-h-[90vh] w-full max-w-4xl overflow-auto rounded-xl border border-outline-variant bg-surface p-4 shadow-lg">
      <header className="sticky top-0 z-10 mb-4 flex items-center justify-between gap-3 bg-surface py-2">
        <h2 id="bulk-edit-title" className="text-lg font-semibold text-primary">Sửa nhiều lịch</h2>
        <button type="button" className={button} aria-disabled={isBusy} onClick={close}>Huỷ</button>
      </header>
      <p className="mb-3 text-sm">Đã chọn {selected.length.toLocaleString('vi-VN')} lịch. Chỉ sửa lịch chưa bắt đầu và chưa có sản lượng. Không tự đẩy các lịch khác.</p>
      <fieldset disabled={isBusy} className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">Lệnh sửa lịch<select aria-label="Lệnh sửa lịch" className={input} value={command} onChange={event => { setCommand(event.target.value as typeof command); invalidate() }}>
          <option value="MOVE_MACHINE">Chuyển sang máy khác (giữ nguyên ngày)</option><option value="SHIFT_DAYS">Dời ngày</option>
        </select></label>
        {command === 'MOVE_MACHINE' ? <label className="text-sm">Máy đích<select aria-label="Máy đích" className={input} value={targetMachineId} onChange={event => { setTargetMachineId(event.target.value); invalidate() }}>{machines.map(machine => <option key={machine}>{machine}</option>)}</select></label>
          : <div className="grid grid-cols-2 gap-3"><label className="text-sm">Hướng dời ngày<select aria-label="Hướng dời ngày" className={input} value={direction} onChange={event => { setDirection(event.target.value); invalidate() }}><option value="1">Lùi (muộn hơn)</option><option value="-1">Tiến (sớm hơn)</option></select></label>
            <label className="text-sm">Số ngày làm việc<input aria-label="Số ngày làm việc" className={input} type="number" min="1" max="60" step="1" value={days} onChange={event => { setDays(event.target.value); invalidate() }} /></label></div>}
      </fieldset>
      {!valid && <p className="mt-2 text-sm text-error">Nhập số ngày nguyên từ 1 đến 60 hoặc chọn máy đích hợp lệ.</p>}
      {notice && <p role="alert" className="mt-3 rounded border border-yellow-500 bg-yellow-50 p-3 text-sm text-yellow-900">{notice}</p>}
      {error && <div role="alert" className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded bg-error-container p-3 text-sm text-error"><span>{error}</span><button type="button" className={button} disabled={isBusy || !valid} onClick={() => void submit(false)}>Thử lại</button></div>}
      {isBusy && <p role="status" className="mt-3 text-sm">Đang kiểm tra lịch…</p>}
      {preview && <div className="mt-4 space-y-4">
        {!!preview.plan.warnings?.length && <section role="status" aria-label="Lưu ý lịch nghỉ" className="rounded border border-yellow-500 bg-yellow-50 p-3 text-sm text-yellow-900"><h3 className="mb-1 font-semibold">Lưu ý lịch nghỉ</h3><ul>{preview.plan.warnings.map(warning => <li key={warning.yearMonth}>{warning.message}</li>)}</ul></section>}
        <section aria-label="Sẽ sửa"><h3 className="mb-2 font-semibold">Sẽ sửa ({preview.plan.changes.length.toLocaleString('vi-VN')})</h3>
          <div className="overflow-x-auto"><table className="w-full whitespace-nowrap text-left text-xs tabular-nums"><thead className="bg-surface-container"><tr>{['PI', 'Máy trước → sau', 'Bắt đầu trước → sau', 'Kết thúc trước → sau', 'Ngày làm việc'].map(label => <th key={label} className="p-2">{label}</th>)}</tr></thead>
            <tbody>{preview.plan.changes.map(row => <tr key={row.id} className="border-b border-outline-variant odd:bg-white"><td className="p-2">{row.piNumber}</td><td className="p-2">{displayChange(row.before.machineId, row.after.machineId)}</td><td className="p-2">{displayChange(displayDay(row.before.startDate), displayDay(row.after.startDate))}</td><td className="p-2">{displayChange(displayDay(row.before.endDate), displayDay(row.after.endDate))}</td><td className="p-2">{row.workingDays.toLocaleString('vi-VN')}</td></tr>)}</tbody></table></div>
          {!preview.plan.changes.length && <p className="py-2 text-sm">Không có lịch đủ điều kiện sửa.</p>}
        </section>
        <section aria-label="Không sửa được"><h3 className="mb-2 font-semibold">Không sửa được ({preview.plan.excluded.length.toLocaleString('vi-VN')})</h3><ul className="text-xs">{preview.plan.excluded.map(row => <li key={row.id} className="py-1">{row.piNumber} — {row.reason === 'STARTED' ? 'Đã bắt đầu chạy — dùng Máy hư từng lịch' : row.reason === 'ALREADY_ON_TARGET' ? 'Đã ở máy đích' : 'Đã có sản lượng'}</li>)}</ul></section>
        <section aria-label="Bị trùng lịch"><h3 className="mb-2 font-semibold">Bị trùng lịch ({preview.plan.conflicts.length.toLocaleString('vi-VN')})</h3><ul className="text-xs text-error">{preview.plan.conflicts.map((row, index) => <li key={`${row.id}-${index}`} className="py-1">{row.piNumber} · {row.machineId} · {displayDay(row.from)} → {displayDay(row.to)} — {row.reason === 'PAST' ? 'Không được dời vào hôm nay hoặc quá khứ' : `Trùng ${row.withPiNumber}`}</li>)}</ul></section>
      </div>}
      <footer className="mt-5 flex flex-wrap justify-end gap-3">
        <button type="button" className={button} disabled={isBusy || !valid} onClick={() => void submit(false)}>Xem trước</button>
        <button type="button" className={`${button} bg-primary text-white`} disabled={isBusy || !preview?.plan.changes.length || !!preview.plan.conflicts.length || !!error} onClick={() => void submit(true)}>Xác nhận sửa</button>
      </footer>
    </div>
  </div>
}
