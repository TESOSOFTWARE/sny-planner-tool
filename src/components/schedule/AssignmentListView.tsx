'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AssignmentDetail } from './DetailModal'
import { useDismissable } from './useDismissable'
import { getPiColorStyle } from '@/lib/colors'
import { scheduleDay } from '@/lib/schedule/importSafety'
import { countWorkingDays, type FactoryCalendar } from '@/lib/schedule/productionDuration'
import { canBulkEditAssignment, filterAssignments, selectionState, type AssignmentFilters } from '@/lib/schedule/assignmentSelection'

export function SelectionCheckbox({ label, checked, mixed = false, disabled = false, onChange }: {
  label: string; checked: boolean; mixed?: boolean; disabled?: boolean; onChange: (checked: boolean) => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (ref.current) ref.current.indeterminate = mixed }, [mixed])
  return <input ref={ref} type="checkbox" aria-label={label} aria-checked={mixed ? 'mixed' : checked} checked={checked} disabled={disabled}
    onChange={event => onChange(event.target.checked)} className="h-4 w-4 shrink-0 accent-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" />
}
const control = 'h-9 rounded-md border border-outline-variant bg-white px-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50'
const day = (value: string) => scheduleDay(value).split('-').reverse().join('/')

export default function AssignmentListView({ assignments, machines, selected, onSelect, onFilteredIdsChange, today, yearMonth, calendar, disabled }: {
  assignments: AssignmentDetail[]; machines: readonly string[]; selected: ReadonlySet<string>; onSelect: (ids: string[], checked: boolean) => void
  onFilteredIdsChange: (ids: string[]) => void; today: string; yearMonth: string; calendar: FactoryCalendar; disabled: boolean
}) {
  const [filter, setFilter] = useState<AssignmentFilters>({ machines: [], status: 'ALL', search: '' })
  const [page, setPage] = useState(1), [pageSize, setPageSize] = useState(50)
  const filtered = useMemo(() => filterAssignments(assignments, filter, today), [assignments, filter, today])
  useEffect(() => { onFilteredIdsChange(filtered.map(row => row.id)) }, [filtered, onFilteredIdsChange])
  useEffect(() => { setPage(1) }, [yearMonth])
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize)), current = Math.min(page, pages)
  const pageRows = filtered.slice((current - 1) * pageSize, current * pageSize)
  const ids = pageRows.map(row => row.id), header = selectionState(ids, selected)
  const outsideFilter = selected.size - filtered.filter(row => selected.has(row.id)).length
  const applyFilter = (next: Partial<AssignmentFilters>) => { setFilter(previous => ({ ...previous, ...next })); setPage(1) }
  // 1510-04e: bảng lọc máy đóng khi bấm ra ngoài / Esc (Esc trả focus về "Máy:"), giữ lựa chọn máy.
  const [machinesOpen, setMachinesOpen] = useState(false)
  const machinePanel = useRef<HTMLDivElement>(null), machineTrigger = useRef<HTMLElement>(null)
  const closeMachines = useCallback(() => setMachinesOpen(false), [])
  useDismissable(machinesOpen, closeMachines, machinePanel, machineTrigger)
  return <section aria-label="Danh sách lịch máy" className="space-y-3">
    <div className="flex flex-wrap items-start gap-3 text-sm">
      <details className="relative" open={machinesOpen} onToggle={event => setMachinesOpen(event.currentTarget.open)}
        // App Router hydrate vào document nên listener Esc của trang cũng nằm trên document: phải stopImmediatePropagation, stopPropagation thường không đủ.
        onKeyDown={event => { if (event.key === 'Escape' && event.currentTarget.open) { event.nativeEvent.stopImmediatePropagation(); event.currentTarget.open = false; closeMachines(); machineTrigger.current?.focus() } }}><summary ref={machineTrigger} className={`${control} cursor-pointer py-2`}>Máy: {filter.machines.length ? `${filter.machines.length} đã chọn` : 'Tất cả'}</summary>
        <div ref={machinePanel} className="absolute left-0 z-40 mt-1 grid max-h-64 w-64 grid-cols-2 gap-2 overflow-auto rounded border border-outline-variant bg-white p-3 shadow-lg">
          <button type="button" className="col-span-2 text-left text-primary underline" onClick={() => applyFilter({ machines: [] })}>Tất cả máy</button>
          {machines.map(machine => <label key={machine} className="flex items-center gap-2"><SelectionCheckbox label={`Lọc máy ${machine}`} checked={filter.machines.includes(machine)} onChange={checked => applyFilter({ machines: checked ? [...filter.machines, machine] : filter.machines.filter(value => value !== machine) })} />{machine}</label>)}
        </div>
      </details>
      <label className="flex items-center gap-2">Trạng thái<select aria-label="Trạng thái lịch" className={control} value={filter.status} onChange={event => applyFilter({ status: event.target.value as AssignmentFilters['status'] })}>
        <option value="ALL">Tất cả</option><option value="FUTURE">Chưa bắt đầu</option><option value="STARTED">Đã bắt đầu</option>
      </select></label>
      <label className="flex min-w-0 flex-wrap items-center gap-2">Tìm<input type="search" aria-label="Tìm PI hoặc khách" placeholder="PI hoặc khách hàng" className={control} value={filter.search} onChange={event => applyFilter({ search: event.target.value })} /></label>
    </div>
    {!disabled && header.checked && filtered.length > pageRows.length && <button type="button" disabled={outsideFilter >= 500} className="text-left text-sm text-primary underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50" onClick={() => onSelect(filtered.map(row => row.id), true)}>
      {outsideFilter > 0 && filtered.length + outsideFilter > 500 ? `Chọn tối đa ${500 - outsideFilter} lịch theo bộ lọc (giữ ${outsideFilter} lịch ngoài bộ lọc) trong tháng ${yearMonth.slice(5)}/${yearMonth.slice(0, 4)}` : filtered.length > 500 ? `Chọn 500 lịch đầu theo bộ lọc (trên ${filtered.length.toLocaleString('vi-VN')}) trong tháng ${yearMonth.slice(5)}/${yearMonth.slice(0, 4)}` : `Chọn tất cả ${filtered.length.toLocaleString('vi-VN')} lịch theo bộ lọc trong tháng ${yearMonth.slice(5)}/${yearMonth.slice(0, 4)}`}
    </button>}
    {disabled ? <p role="status" className="rounded bg-surface-container p-4 text-sm">Danh sách tạm chưa sẵn sàng. Đang tải hoặc cần thử lại dữ liệu lịch.</p> : <>
      <div className="max-h-[65vh] overflow-auto rounded border border-outline-variant bg-white">
        <table aria-label="Bảng danh sách lịch máy" className="w-full whitespace-nowrap text-left text-xs tabular-nums"><thead className="sticky top-0 z-10 bg-surface-container"><tr>
          <th className="p-3"><SelectionCheckbox label="Chọn trang lịch đang xem" {...header} disabled={!ids.length} onChange={checked => onSelect(ids, checked)} /></th>
          {['PI', 'Khách', 'Máy', 'Bắt đầu', 'Kết thúc', 'Ngày làm việc', 'Trạng thái', 'Giữ chỗ'].map(label => <th key={label} className="p-3">{label}</th>)}
        </tr></thead><tbody>{pageRows.map(row => {
          const color = getPiColorStyle(row.order.piNumber), workingDays = countWorkingDays(calendar, scheduleDay(row.startDate), scheduleDay(row.endDate))
          return <tr key={row.id} data-list-assignment={row.id} className={`border-b border-outline-variant ${selected.has(row.id) ? 'bg-primary/10' : 'odd:bg-white even:bg-surface-container-low'}`}>
            <td className="p-3"><SelectionCheckbox label={`Chọn lịch ${row.order.piNumber} máy ${row.machineId}`} checked={selected.has(row.id)} onChange={checked => onSelect([row.id], checked)} /></td>
            <td className="p-3"><span className="rounded px-1 py-0.5 font-semibold" style={{ backgroundColor: color.bgHex, color: color.textHex }}>{row.order.piNumber}</span></td>
            <td className="max-w-48 truncate p-3" title={row.order.customer}>{row.order.customer}</td><td className="p-3">{row.machineId}</td>
            <td className="p-3">{day(row.startDate)}</td><td className="p-3">{day(row.endDate)}</td><td className="p-3">{workingDays == null ? '—' : workingDays.toLocaleString('vi-VN')}</td>
            <td className="p-3">{canBulkEditAssignment(row, today) ? 'Chưa bắt đầu' : 'Đã bắt đầu'}</td><td className="p-3">{row.isPlaceholder || row.order.isPlaceholder || row.order.isDraft ? 'Giữ chỗ' : '—'}</td>
          </tr>
        })}</tbody></table>
        {!filtered.length && <p role="status" className="p-4 text-sm">Không có lịch theo bộ lọc trong tháng đang xem.</p>}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <span>{filtered.length.toLocaleString('vi-VN')} lịch · Trang {current}/{pages}</span>
        <label className="flex items-center gap-2">Hiển thị<select aria-label="Chọn số lịch mỗi trang" className={control} value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(1) }}><option value={50}>50 / trang</option><option value={100}>100 / trang</option></select></label>
        <div className="flex gap-2"><button type="button" className={control} disabled={current <= 1} onClick={() => setPage(current - 1)}>Trang trước</button><button type="button" className={control} disabled={current >= pages} onClick={() => setPage(current + 1)}>Trang sau</button></div>
      </div>
    </>}
  </section>
}
