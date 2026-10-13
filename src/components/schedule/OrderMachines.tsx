'use client'
import { countWorkingDays, countWorkingDaysInRanges, type FactoryCalendar } from '@/lib/schedule/productionDuration'
import { scheduleDay } from '@/lib/schedule/importSafety'
import { distinctMachineCount, machineIntervalLabel, type MachineInterval } from '@/lib/schedule/piDisplay'

export default function OrderMachines({rows,calendar,error}:{rows:readonly MachineInterval[];calendar:FactoryCalendar|null;error?:string|null}) {
  const total=calendar?countWorkingDaysInRanges(calendar,rows.map(r=>({from:scheduleDay(r.startDate),to:scheduleDay(r.endDate)}))):null
  return <section aria-label="Máy" className="rounded-xl border border-outline-variant bg-surface-container-low p-3">
    <h4 className="mb-2 text-sm font-semibold text-secondary">Máy</h4>
    {rows.length===0?<p className="text-xs text-secondary">Chưa có phân công máy.</p>:<ul className="space-y-1">{rows.map(r=><li key={r.id} className="flex flex-wrap items-center gap-2 text-xs"><span className="font-mono font-semibold">{r.machineId}</span><span className="rounded bg-white px-2 py-0.5">{machineIntervalLabel(r)}</span>{r.allocatedMeters&&<span>{Number(r.allocatedMeters).toLocaleString('vi-VN')} m</span>}<span>{scheduleDay(r.startDate).split('-').reverse().join('/')} → {scheduleDay(r.endDate).split('-').reverse().join('/')}</span><span>{calendar?countWorkingDays(calendar,scheduleDay(r.startDate),scheduleDay(r.endDate))?.toLocaleString('vi-VN')??'—':'—'} ngày làm việc</span></li>)}</ul>}
    <p className="mt-2 text-xs text-secondary">{total?.toLocaleString('vi-VN')??'—'} ngày làm việc · {distinctMachineCount(rows).toLocaleString('vi-VN')} máy</p>
    {error&&<p role="alert" className="mt-1 text-xs text-error">{error}</p>}
  </section>
}
