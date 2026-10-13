'use client'

import { useState, useEffect, useMemo, Fragment, useRef, useCallback } from 'react'
import AssignModal from '@/components/schedule/AssignModal'
import DetailModal, { AssignmentDetail } from '@/components/schedule/DetailModal'
import ImportScheduleModal from '@/components/schedule/ImportScheduleModal'
import { getPiColorStyle } from '@/lib/colors'
import { useFactoryCalendar, type CalendarExceptionKind } from '@/components/schedule/useFactoryCalendar'
import CalendarMonthPopover from '@/components/schedule/CalendarMonthPopover'
import { isWorkingDay } from '@/lib/schedule/productionDuration'
import { scheduleDay } from '@/lib/schedule/importSafety'
import { lineLabel, formatLineSpec, formatOrderTotalMeters, scheduleProductLabel } from '@/lib/schedule/piDisplay'
import { dayMenuItems, machineSpecTooltip, machineCellLabel, MACHINE_COL_WIDTH } from '@/lib/schedule/scheduleGrid'
import { useDismissable } from '@/components/schedule/useDismissable'
import PiOrderPanel from '@/components/schedule/PiOrderPanel'
import { useScheduleModalFocus } from '@/components/schedule/useModalFocus'

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}
function formatMonthLabel(date: Date): string {
  return `Tháng ${date.getMonth() + 1}/${date.getFullYear()}`
}

const MACHINES = Array.from({ length: 40 }, (_, i) => `M-${String(i + 1).padStart(3, '0')}`)
const DAY_ABBR = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']

const KIND_LABEL: Record<CalendarExceptionKind, string> = {
  HOLIDAY: 'Ngày lễ',
  CLOSURE: 'Ngày nghỉ',
  MAKEUP: 'Làm bù',
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SchedulePage() {
  const [viewDate, setViewDate] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })

  const [assignments, setAssignments] = useState<AssignmentDetail[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [assignmentError, setAssignmentError] = useState('')
  const [viewMode, setViewMode] = useState<'detail' | 'overview'>('detail')
  const [machineSpecs, setMachineSpecs] = useState<Record<string, number>>({})
  const [specState, setSpecState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [tooltip, setTooltip] = useState<{ assignment: AssignmentDetail; left: number; top: number; above: boolean } | null>(null)
  const tooltipTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const keepTooltip = () => { if (tooltipTimer.current) clearTimeout(tooltipTimer.current) }
  const hideTooltip = () => { keepTooltip(); tooltipTimer.current = setTimeout(() => setTooltip(null), 180) }
  useEffect(() => () => { if (tooltipTimer.current) clearTimeout(tooltipTimer.current) }, [])
  const [conflicts, setConflicts] = useState<AssignmentDetail[] | null>(null)
  const conflictRef = useRef<HTMLDivElement>(null)
  const conflictTrigger = useRef<HTMLButtonElement | null>(null)
  const closeConflicts = useCallback(() => setConflicts(null), [])
  useScheduleModalFocus(!!conflicts, closeConflicts, conflictRef)
  const dayWidth = viewMode === 'detail' ? 96 : 40
  useEffect(() => {
    try { if (localStorage.getItem('sny-schedule-view') === 'overview') setViewMode('overview') } catch { /* Browser storage may be unavailable. */ }
    let active = true
    fetch('/api/machine-specs').then(async response => {
      if (!response.ok) throw new Error('Không tải được khổ máy')
      const rows: { machineId: string; widthM: number }[] = await response.json()
      if (active) { setMachineSpecs(Object.fromEntries(rows.map(row => [row.machineId, row.widthM]))); setSpecState('ready') }
    }).catch(() => { if (active) setSpecState('error') })
    return () => { active = false }
  }, [])
  const changeView = (mode: 'detail' | 'overview') => {
    setViewMode(mode)
    try { localStorage.setItem('sny-schedule-view', mode) } catch { /* Keep the current view when storage is unavailable. */ }
  }

  // Modals state
  const [isAssignOpen, setIsAssignOpen] = useState(false)
  const [isDetailOpen, setIsDetailOpen] = useState(false)
  const [isImportOpen, setIsImportOpen] = useState(false)
  const [selectedMachine, setSelectedMachine] = useState('')
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [selectedAssignment, setSelectedAssignment] = useState<AssignmentDetail | null>(null)
  const [selectedPi, setSelectedPi] = useState<string | null>(null)
  const piModalRef = useRef<HTMLDivElement>(null)
  const closePi = useCallback(() => setSelectedPi(null), [])
  useScheduleModalFocus(!!selectedPi, closePi, piModalRef)

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const totalDays = daysInMonth(year, month)
  const days = Array.from({ length: totalDays }, (_, i) => i + 1)
  const monthDays = useMemo(() => Array.from({length:totalDays},(_,i)=>new Date(year,month,i+1)),[year,month,totalDays])
  const cellsByMachine = useMemo(() => {
    const cells = new Map<string, AssignmentDetail[]>()
    const prefix = `${year}-${String(month + 1).padStart(2, '0')}-`
    for (const assignment of assignments) {
      const from=scheduleDay(assignment.startDate),to=scheduleDay(assignment.endDate)
      for(let day=1;day<=totalDays;day++){const label=prefix+String(day).padStart(2,'0');if(label>=from&&label<=to){const key=`${assignment.machineId}|${day}`;const rows=cells.get(key)??[];rows.push(assignment);cells.set(key,rows)}}
    }
    return cells
  },[assignments,year,month,totalDays])
  const lanesByMachine = useMemo(() => {
    const result = new Map<string, { assignment: AssignmentDetail; from: number; to: number; lane: number }[]>()
    const prefix = `${year}-${String(month + 1).padStart(2, '0')}-`
    const monthStart = prefix + '01', monthEnd = prefix + String(totalDays).padStart(2, '0')
    const grouped = new Map<string, AssignmentDetail[]>()
    for (const assignment of assignments) {
      if (scheduleDay(assignment.endDate) < monthStart || scheduleDay(assignment.startDate) > monthEnd) continue
      const rows = grouped.get(assignment.machineId) ?? []
      rows.push(assignment); grouped.set(assignment.machineId, rows)
    }
    grouped.forEach((rows, machine) => {
      const ends: number[] = []
      result.set(machine, rows.slice().sort((a, b) => scheduleDay(a.startDate).localeCompare(scheduleDay(b.startDate)) || a.id.localeCompare(b.id)).map(assignment => {
        const start = scheduleDay(assignment.startDate), end = scheduleDay(assignment.endDate)
        const from = start < monthStart ? 1 : Number(start.slice(8, 10))
        const to = end > monthEnd ? totalDays : Number(end.slice(8, 10))
        let lane = ends.findIndex(last => last < from)
        if (lane < 0) lane = ends.length
        ends[lane] = to
        return { assignment, from, to, lane }
      }))
    })
    return result
  }, [assignments, year, month, totalDays])

  // Lịch nghỉ thật thay cho quy tắc T7/CN cứng. Mặc định chỉ nghỉ Chủ nhật —
  // đối chiếu nhật ký sản lượng 04/2026 cho thấy nhà máy LÀM thứ 7.
  const { calendar, exceptions, monthNote, setMonthRule, reload, isRestDay, exceptionFor, setDayKind, isLoading: calendarLoading, error: calendarError } = useFactoryCalendar(year, month)
  const [editingDay, setEditingDay] = useState<number | null>(null)
  const dayTriggerRef = useRef<HTMLButtonElement>(null)
  const dayMenuRef = useRef<HTMLDivElement>(null)
  const closeDayMenu = useCallback(() => setEditingDay(null), [])
  useDismissable(editingDay !== null, closeDayMenu, dayMenuRef, dayTriggerRef)
  const [calendarRuleSaved, setCalendarRuleSaved] = useState(false)
  const yearMonth = `${year}-${String(month + 1).padStart(2, '0')}`
  const monthOverride = calendar.monthlyNonWorkingWeekdaysOverride?.[yearMonth]
  const affectedAssignments = calendarRuleSaved ? assignments.filter(a => {
    const end = scheduleDay(a.endDate)
    return end.slice(0, 7) === yearMonth && isWorkingDay(calendar, end) === false
  }).length : 0
  useEffect(() => { setCalendarRuleSaved(false) }, [yearMonth])

  const applyDayKind = async (day: number, kind: CalendarExceptionKind | null) => {
    setEditingDay(null)
    try {
      await setDayKind(day, kind)
      await fetchAssignments()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Không lưu được ngày nghỉ')
    }
  }

  const fetchAssignments = async () => {
    setIsLoading(true)
    setAssignmentError('')
    try {
      const res = await fetch(`/api/assignments?year=${year}&month=${month}`)
      if (!res.ok) throw new Error('Không tải được lịch máy')
      const data = await res.json()
      setAssignments(data)
    } catch (err) {
      setAssignmentError(err instanceof Error ? err.message : 'Không tải được lịch máy')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchAssignments()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month])

  const goPrev = () => setViewDate(new Date(year, month - 1, 1))
  const goNext = () => setViewDate(new Date(year, month + 1, 1))

  const handleCellClick = (machineId: string, date: Date) => {
    const assignment = getAssignment(machineId, date)
    if (assignment) {
      setSelectedAssignment(assignment)
      setIsDetailOpen(true)
    } else {
      setSelectedMachine(machineId)
      setSelectedDate(date)
      setIsAssignOpen(true)
    }
  }

  const getAssignments = (machineId: string, date: Date) => {
    return cellsByMachine.get(`${machineId}|${date.getDate()}`) ?? []
  }

  const getAssignment = (machineId: string, date: Date) => getAssignments(machineId, date)[0]

  return (
    <div className="px-container-margin py-xl">
      <div className="mb-lg">
        <h1 className="text-display font-inter font-semibold text-primary tracking-tight">
          Lịch máy dệt
        </h1>
        <p className="text-body-md font-noto text-secondary mt-xs">
          Kế hoạch phân công đơn hàng theo máy và ngày
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-md mb-md">
        <div className="flex flex-wrap items-center gap-sm">
          <button
            onClick={goPrev}
            aria-label="Tháng trước"
            className="w-8 h-8 flex items-center justify-center rounded-lg border-[0.5px] border-outline-variant hover:bg-surface-container text-on-surface-variant transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">chevron_left</span>
          </button>
          <h2 className="text-headline-md font-inter font-semibold text-on-surface w-44 text-center">
            {formatMonthLabel(viewDate)}
          </h2>
          <button
            onClick={goNext}
            aria-label="Tháng sau"
            className="w-8 h-8 flex items-center justify-center rounded-lg border-[0.5px] border-outline-variant hover:bg-surface-container text-on-surface-variant transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">chevron_right</span>
          </button>
          <CalendarMonthPopover yearMonth={yearMonth} weekdays={monthOverride ?? calendar.nonWorkingWeekdays} configured={monthOverride !== undefined} note={monthNote} exceptions={Object.values(exceptions).sort((a, b) => a.date.localeCompare(b.date))} disabled={calendarLoading || !!calendarError}
            onCalendarReload={async () => { await reload(); await fetchAssignments() }}
            onSave={async (weekdays, note) => { await setMonthRule(weekdays, note); await fetchAssignments(); setCalendarRuleSaved(true) }}
            onDayChange={async (day, kind, note) => { await setDayKind(day, kind, note); await fetchAssignments() }} />
        </div>
        <div className="flex items-center gap-md">
          <div role="group" aria-label="Chế độ xem lịch" className="flex rounded border border-outline-variant">
            {(['detail', 'overview'] as const).map(mode => <button key={mode} type="button" aria-pressed={viewMode === mode} onClick={() => changeView(mode)} className={`px-3 py-1.5 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${viewMode === mode ? 'bg-primary text-white' : 'bg-white text-primary'}`}>{mode === 'detail' ? 'Chi tiết' : 'Tổng quan'}</button>)}
          </div>
          <button
            onClick={() => setIsImportOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container border border-outline-variant hover:bg-surface-container-high text-xs font-medium text-on-surface transition-colors"
          >
            <span className="material-symbols-outlined text-[16px] text-primary">upload_file</span>
            Nhập lịch tháng
          </button>
          <p className="text-label-sm font-inter text-secondary">
            {totalDays} ngày · {MACHINES.length} máy
          </p>
        </div>
      </div>

      <div aria-label="Chú giải lịch máy" className="mb-sm flex flex-wrap items-center gap-md text-xs text-on-surface-variant">
        <span className="inline-flex items-center gap-1"><span className="h-3 w-3 border border-outline-variant bg-white" />Ngày làm</span>
        <span className="inline-flex items-center gap-1"><span className="h-3 w-3 border border-amber-300 bg-amber-100" />Ngày nghỉ</span>
        <span className="inline-flex items-center gap-1"><span className="h-3 w-3 border border-amber-400 bg-amber-200" />Ngày lễ</span>
        <span className="inline-flex items-center gap-1"><span className="h-3 w-3 border border-outline-variant bg-white" />Làm bù</span>
      </div>
      {calendarError && <p role="alert" className="mb-sm text-sm text-error">{calendarError}</p>}
      {assignmentError && <div role="alert" className="mb-sm rounded bg-error-container p-3 text-sm text-error">{assignmentError}<button type="button" onClick={fetchAssignments} className="ml-3 underline">Thử lại</button></div>}
      {!isLoading && !assignmentError && assignments.length === 0 && <p role="status" className="mb-sm text-sm text-secondary">Chưa có phân công trong tháng. Bấm ô ngày trống để xếp máy hoặc nhập lịch tháng.</p>}
      {affectedAssignments > 0 && <p role="status" className="mb-sm rounded border border-amber-300 bg-amber-100 px-3 py-2 text-xs text-on-surface">{affectedAssignments} lịch cần kiểm tra lại — ngày kết thúc đang rơi vào ngày nghỉ. Lịch đã lưu được giữ nguyên.</p>}
      <div data-schedule-scroll onScroll={() => setTooltip(null)} style={{ containerType: 'inline-size' }} className="max-h-[70vh] overflow-auto rounded-lg border-[0.5px] border-outline-variant bg-surface-container-lowest shadow-sm">
        <table className="border-separate border-spacing-0 text-xs table-fixed" style={{ width: MACHINE_COL_WIDTH + totalDays * dayWidth }}>
          <colgroup><col style={{ width: MACHINE_COL_WIDTH }} />{days.map(day => <col key={day} style={{ width: dayWidth }} />)}</colgroup>
          <thead className="sticky top-0 z-30">
            <tr className="bg-surface-container border-b-[0.5px] border-outline-variant">
              <th className="sticky left-0 top-0 z-40 bg-surface-container border-r-[0.5px] border-outline-variant px-md py-sm text-left text-label-sm font-inter font-medium text-secondary uppercase tracking-widest">
                Máy
              </th>
              {days.map((day) => {
                const weekend = isRestDay(day)
                const exception = exceptionFor(day)
                const isHoliday = exception?.kind === 'HOLIDAY'
                const dow = monthDays[day-1].getDay()
                const title = exception
                  ? `${KIND_LABEL[exception.kind]}${exception.note ? ` — ${exception.note}` : ''}`
                  : weekend ? 'Ngày nghỉ theo lịch tuần' : 'Ngày làm việc'
                return (
                  <th
                    key={day}
                    style={{ width: dayWidth }}
                    className={`sticky top-0 py-1.5 text-center font-medium border-r-[0.5px] border-outline-variant/60 last:border-r-0 ${
                      isHoliday ? 'bg-amber-200 text-on-surface' : weekend ? 'bg-amber-100 text-on-surface' : 'bg-surface-container text-on-surface-variant'
                    }`}
                  >
                    <button
                      ref={editingDay === day ? dayTriggerRef : undefined}
                      type="button"
                      title={`${title} — bấm để đổi`}
                      onClick={() => setEditingDay(editingDay === day ? null : day)}
                      className="w-full cursor-pointer rounded-sm px-0.5 hover:bg-surface-container-high focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      <div className={`text-body-sm ${isHoliday ? 'font-bold text-error' : ''}`}>{day}</div>
                      <div className={`text-[10px] leading-none mt-0.5 ${weekend ? 'text-outline-variant' : 'text-outline'}`}>
                        {DAY_ABBR[dow]}
                      </div>
                      {weekend && <div className={`mt-0.5 text-[9px] ${isHoliday ? 'font-bold text-error' : 'text-on-surface-variant'}`}>{isHoliday ? 'Lễ' : 'Nghỉ'}</div>}
                    </button>
                    {editingDay === day && (
                      <div ref={dayMenuRef} className="absolute left-1/2 top-full z-30 mt-1 w-44 -translate-x-1/2 rounded-md border-[0.5px] border-outline-variant bg-surface-container-lowest p-1 text-left shadow-lg">
                        {dayMenuItems(weekend, exception?.kind).map((item) => (
                          <button
                            key={item.label}
                            type="button"
                            onClick={() => applyDayKind(day, item.kind)}
                            className="block w-full rounded px-2 py-1 text-left text-body-sm text-on-surface hover:bg-surface-container"
                          >
                            {item.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/50">
            {MACHINES.map((machine, rowIdx) => {
              const bars = lanesByMachine.get(machine) ?? []
              const laneCount = Math.max(1, ...bars.map(bar => bar.lane + 1))
              return (
                <tr key={machine} data-machine={machine}>
                  <td title={machineSpecTooltip(specState, machineSpecs[machine])} className={`sticky left-0 z-20 border-r border-outline-variant px-3 py-2 align-middle ${rowIdx % 2 === 0 ? 'bg-white' : 'bg-[#f8f6f5]'}`}>
                    <div tabIndex={0} aria-label={machineCellLabel(machine, specState, machineSpecs[machine])} className="rounded-sm font-mono font-semibold text-on-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">{machine}</div>
                  </td>
                  <td colSpan={totalDays} className="p-0 align-top">
                    <div className="relative grid" style={{ gridTemplateColumns: `repeat(${totalDays}, ${dayWidth}px)`, gridTemplateRows: `repeat(${laneCount}, minmax(76px, auto))`, width: totalDays * dayWidth }}>
                      {days.map(day => {
                        const occupied = cellsByMachine.get(`${machine}|${day}`) ?? []
                        const backgroundColor = exceptionFor(day)?.kind === 'HOLIDAY' ? '#fde68a' : isRestDay(day) ? '#fef3c7' : rowIdx % 2 === 0 ? '#ffffff' : '#f8f6f5'
                        return <div key={day} data-day={day} className="border-r border-outline-variant/50" style={{ gridColumn: day, gridRow: `1 / span ${laneCount}`, backgroundColor }}>
                          {!occupied.length && !isLoading && <button type="button" role="gridcell" aria-label={`${machine}, ngày ${day}/${month + 1}/${year} — Xếp máy`} onClick={() => handleCellClick(machine, monthDays[day - 1])} className="block h-full min-h-[76px] w-full hover:bg-surface-container-high/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary" />}
                        </div>
                      })}
                      {isLoading && <div role="status" aria-label="Đang tải lịch máy" className="pointer-events-none z-[1] m-2 animate-pulse rounded bg-surface-container-high" style={{ gridColumn: '1 / -1', gridRow: `1 / span ${laneCount}` }} />}
                      {!isLoading && bars.map(({ assignment, from, to, lane }) => {
                        const color = getPiColorStyle(assignment.order.piNumber)
                        const draft = !!assignment.order.isDraft
                        const placeholder = draft || !!assignment.isPlaceholder
                        const span = to - from + 1
                        const allocation = assignment.allocatedMeters == null || !Number.isFinite(Number(assignment.allocatedMeters)) ? '—' : `${Number(assignment.allocatedMeters).toLocaleString('vi-VN')} m`
                        const spec = formatLineSpec(assignment.order, { includeTotal: false })
                        const pi = assignment.order.piNumber || 'PI chưa có dữ liệu'
                        const product = scheduleProductLabel(assignment.order)
                        const fullLabel = `${pi}${product ? ` · ${product}` : ''}`
                        const showTooltip = (element: HTMLElement) => {
                          keepTooltip()
                          const rect = element.getBoundingClientRect()
                          const above = rect.top >= window.innerHeight / 2
                          setTooltip({ assignment, left: Math.max(8, Math.min(rect.left, window.innerWidth - 360)), top: above ? rect.top - 4 : rect.bottom + 4, above })
                        }
                        return <Fragment key={assignment.id}><button data-assignment={assignment.id} type="button" role="gridcell" aria-label={`${machine} — ${pi} — ${scheduleDay(assignment.startDate).split('-').reverse().join('/')} đến ${scheduleDay(assignment.endDate).split('-').reverse().join('/')}`} aria-describedby={tooltip?.assignment.id === assignment.id ? 'assignment-tooltip' : undefined}
                          onMouseEnter={event => showTooltip(event.currentTarget)} onMouseLeave={hideTooltip}
                          onFocus={event => showTooltip(event.currentTarget)} onBlur={event => { if (!(event.relatedTarget instanceof HTMLElement) || !event.relatedTarget.closest('[data-assignment-tooltip]')) setTooltip(null) }}
                          onKeyDown={event => { if (event.key === 'Escape') setTooltip(null) }}
                          onClick={() => { setTooltip(null); setSelectedAssignment(assignment); setIsDetailOpen(true) }}
                          className={`relative z-[2] mx-0.5 my-1.5 overflow-clip rounded-md border text-left focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${placeholder ? 'border-2 border-dashed' : ''}`}
                          style={{ gridColumn: `${from} / span ${span}`, gridRow: lane + 1, backgroundColor: placeholder ? '#fffbeb' : color.bgHex, color: placeholder ? '#43474e' : color.textHex, borderColor: placeholder ? '#b45309' : color.borderHex }}>
                          <span aria-hidden="true" className="pointer-events-none absolute bottom-0 top-0 flex" style={{ left: placeholder ? -4 : -3 }}>
                            {Array.from({ length: span }, (_, offset) => <span key={offset} data-overlay-day={from + offset} className="h-full shrink-0" style={{ width: dayWidth, backgroundColor: exceptionFor(from + offset)?.kind === 'HOLIDAY' ? '#fde68a' : isRestDay(from + offset) ? '#fef3c7' : undefined }} />)}
                          </span>
                          <span data-sticky-label className="sticky block px-2 py-2" style={{ left: MACHINE_COL_WIDTH, width: `min(100%, 320px, calc(100cqw - ${MACHINE_COL_WIDTH}px))` }}>
                            <span data-pi-label className={`block text-xs font-semibold ${viewMode === 'detail' && span >= 2 ? 'whitespace-normal break-words [overflow-wrap:anywhere]' : 'truncate'}`}>
                              {placeholder ? draft ? 'NHÁP' : 'GIỮ CHỖ' : fullLabel}
                            </span>
                            <span className={`mt-1 block text-[11px] ${placeholder && viewMode === 'detail' && span >= 2 ? 'break-words [overflow-wrap:anywhere]' : 'truncate'}`}>
                              {placeholder ? pi : `${spec ? `${spec} · ` : ''}Phân công: ${allocation}`}
                            </span>
                          </span>
                        </button>
                        {tooltip?.assignment.id === assignment.id && <div data-assignment-tooltip onMouseEnter={keepTooltip} onMouseLeave={hideTooltip} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setTooltip(null) }} onKeyDown={event => { if (event.key === 'Escape') { document.querySelector<HTMLButtonElement>(`[data-assignment="${assignment.id}"]`)?.focus(); setTooltip(null) } }} className="fixed z-40 max-w-[350px] overflow-auto rounded border border-outline-variant bg-white p-3 text-xs text-on-surface shadow-lg" style={{ left: tooltip.left, top: tooltip.top, transform: tooltip.above ? 'translateY(-100%)' : undefined, maxHeight: tooltip.above ? `${Math.max(0, tooltip.top - 8)}px` : `calc(100vh - ${tooltip.top + 8}px)` }}>
                          <div id="assignment-tooltip" role="tooltip">
                          <p className="break-words font-semibold">{pi} · Dòng {lineLabel(assignment.order)}{assignment.order.meshType ? ` · ${assignment.order.meshType}` : ''}</p>
                          <p className="mt-1">{assignment.order.customer}</p>
                          <p className="mt-1">Loại lưới: {assignment.order.meshType?.trim() || '—'}</p>
                          <p className="mt-1">Tên sản phẩm: {assignment.order.description?.trim() || '—'}</p>
                          <p className="mt-1">{formatLineSpec(assignment.order) || 'Quy cách chưa có dữ liệu'}</p>
                          <p className="mt-1">Tổng dòng: {formatOrderTotalMeters(assignment.order)} · Phân công: {allocation}</p>
                          <p className="mt-1">{machine} · {scheduleDay(assignment.startDate).split('-').reverse().join('/')} → {scheduleDay(assignment.endDate).split('-').reverse().join('/')}</p>
                          </div>
                          <button type="button" onClick={() => { document.querySelector<HTMLButtonElement>(`[data-assignment="${assignment.id}"]`)?.focus(); setTooltip(null); setSelectedPi(pi) }} className="mt-2 text-primary underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">Xem toàn bộ PI</button>
                        </div>}
                        </Fragment>
                      })}
                      {!isLoading && days.map(day => {
                        const occupied = cellsByMachine.get(`${machine}|${day}`) ?? []
                        return occupied.length > 1 ? <button key={`conflict-${day}`} type="button" aria-label={`${machine}, ngày ${day}/${month + 1}: ${occupied.length} lịch chồng nhau`} onClick={event => { conflictTrigger.current = event.currentTarget; setTooltip(null); setConflicts(occupied) }} className="z-[3] mr-1 mt-1 self-start justify-self-end rounded border border-outline-variant bg-white px-1 text-[10px] font-bold text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary" style={{ gridColumn: day, gridRow: 1 }}>+{occupied.length - 1}</button> : null
                      })}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {conflicts && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={closeConflicts}><div ref={conflictRef} role="dialog" aria-modal="true" aria-label="Các phân công trùng lịch" onClick={event => event.stopPropagation()} className="max-h-[90vh] w-full max-w-xl overflow-auto rounded-xl border border-outline-variant bg-white p-4">
        <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">Các phân công trùng lịch</h2><button type="button" onClick={closeConflicts} className="rounded border border-outline-variant px-3 py-2 text-xs">Đóng</button></div>
        {conflicts.map(assignment => <div key={assignment.id} className="mb-2 rounded border border-outline-variant p-3"><button type="button" onClick={() => { conflictTrigger.current?.focus(); closeConflicts(); setSelectedAssignment(assignment); setIsDetailOpen(true) }} className="block w-full text-left text-sm font-semibold text-primary">{assignment.order.piNumber} · Dòng {lineLabel(assignment.order)}</button><p className="my-1 text-xs">{scheduleDay(assignment.startDate).split('-').reverse().join('/')} → {scheduleDay(assignment.endDate).split('-').reverse().join('/')}</p><button type="button" onClick={() => { conflictTrigger.current?.focus(); closeConflicts(); setSelectedPi(assignment.order.piNumber) }} className="text-xs text-primary underline">Xem toàn bộ PI</button></div>)}
      </div></div>}
      {selectedPi&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={closePi}><div ref={piModalRef} role="dialog" aria-modal="true" aria-label={`PI ${selectedPi}`} onClick={event=>event.stopPropagation()} className="max-h-[90vh] w-full max-w-5xl overflow-auto rounded-xl border border-outline-variant bg-white p-4"><button type="button" onClick={closePi} className="rounded border border-outline-variant px-3 py-2 text-xs">Đóng</button><PiOrderPanel piNumber={selectedPi}/></div></div>}

      <AssignModal 
        isOpen={isAssignOpen} 
        onClose={() => setIsAssignOpen(false)} 
        machineId={selectedMachine}
        startDate={selectedDate}
        onSuccess={fetchAssignments}
      />

      <DetailModal
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        assignment={selectedAssignment}
        onSuccess={fetchAssignments}
      />

      <ImportScheduleModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        onImported={fetchAssignments}
        onCalendarChanged={async () => { await reload(); await fetchAssignments() }}
      />
    </div>
  )
}
