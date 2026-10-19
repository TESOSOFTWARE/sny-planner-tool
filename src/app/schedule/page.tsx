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
import { toast } from 'sonner'
import BulkEditModal from '@/components/schedule/BulkEditModal'
import AssignmentListView, { SelectionCheckbox } from '@/components/schedule/AssignmentListView'
import { canBulkEditAssignment, selectAssignments, selectionState } from '@/lib/schedule/assignmentSelection'

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

  const [assignments, setAssignments] = useState<(AssignmentDetail & { updatedAt: string })[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const hasSelection = selectedIds.size > 0
  const [removalSnapshot, setRemovalSnapshot] = useState<(AssignmentDetail & { updatedAt: string })[] | null>(null)
  const [editSnapshot, setEditSnapshot] = useState<(AssignmentDetail & { updatedAt: string })[] | null>(null)
  const [editCommand, setEditCommand] = useState<'MOVE_MACHINE' | 'SHIFT_DAYS'>('MOVE_MACHINE')
  const [listFilteredIds, setListFilteredIds] = useState<string[]>([])
  const closeBulkEdit = useCallback(() => setEditSnapshot(null), [])
  const [isRemoving, setIsRemoving] = useState(false)
  const removalBusy = useRef(false)
  const removalModalRef = useRef<HTMLDivElement>(null)
  const closeRemoval = useCallback(() => { if (!removalBusy.current) setRemovalSnapshot(null) }, [])
  useScheduleModalFocus(!!removalSnapshot, closeRemoval, removalModalRef)
  const [isLoading, setIsLoading] = useState(true)
  const [assignmentError, setAssignmentError] = useState('')
  const assignmentRequest = useRef(0)
  const invalidateAssignmentRequest = useCallback(() => { assignmentRequest.current++ }, [])
  const assignmentPeriod = useRef('')
  const [viewMode, setViewMode] = useState<'detail' | 'overview' | 'list'>('detail')
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
  const gridFrameRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const frame = gridFrameRef.current, footer = frame?.querySelector<HTMLElement>('[data-selection-footer]')
    if (!frame || !footer) return
    const fit = () => {
      frame.style.maxHeight = `min(70vh, max(400px, calc(100dvh - ${frame.getBoundingClientRect().top + window.scrollY}px - 16px)))`
      frame.style.setProperty('--selection-footer-height', `${footer.getBoundingClientRect().height}px`)
    }
    fit(); const observer = new ResizeObserver(fit)
    observer.observe(footer); if (frame.parentElement) observer.observe(frame.parentElement)
    window.addEventListener('resize', fit)
    return () => { observer.disconnect(); window.removeEventListener('resize', fit) }
  }, [viewMode])
  useEffect(() => {
    try { const saved = localStorage.getItem('sny-schedule-view'); if (saved === 'overview' || saved === 'list') setViewMode(saved) } catch { /* Browser storage may be unavailable. */ }
    let active = true
    fetch('/api/machine-specs').then(async response => {
      if (!response.ok) throw new Error('Không tải được khổ máy')
      const rows: { machineId: string; widthM: number }[] = await response.json()
      if (active) { setMachineSpecs(Object.fromEntries(rows.map(row => [row.machineId, row.widthM]))); setSpecState('ready') }
    }).catch(() => { if (active) setSpecState('error') })
    return () => { active = false }
  }, [])
  const changeView = (mode: 'detail' | 'overview' | 'list') => {
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
  assignmentPeriod.current = yearMonth
  useEffect(() => { setSelectedIds(new Set()); setRemovalSnapshot(null); setEditSnapshot(null) }, [yearMonth])
  useEffect(() => {
    if (!hasSelection) return
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !removalSnapshot && !editSnapshot && !isDetailOpen && !selectedPi && !conflicts && !isAssignOpen && !isImportOpen) { setSelectedIds(new Set()); setTooltip(null) }
    }
    document.addEventListener('keydown', escape)
    return () => document.removeEventListener('keydown', escape)
  }, [hasSelection, removalSnapshot, editSnapshot, isDetailOpen, selectedPi, conflicts, isAssignOpen, isImportOpen])
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
    const requestId = ++assignmentRequest.current
    const requestedPeriod = yearMonth
    const isCurrent = () => requestId === assignmentRequest.current && requestedPeriod === assignmentPeriod.current
    setIsLoading(true)
    setAssignmentError('')
    try {
      const res = await fetch(`/api/assignments?year=${year}&month=${month}`)
      if (!res.ok) throw new Error('Không tải được lịch máy')
      const data = await res.json()
      if (isCurrent()) setAssignments(data)
    } catch (err) {
      if (isCurrent()) setAssignmentError(err instanceof Error ? err.message : 'Không tải được lịch máy')
    } finally {
      if (isCurrent()) setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchAssignments()
    return invalidateAssignmentRequest
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month, invalidateAssignmentRequest])

  const goPrev = () => setViewDate(new Date(year, month - 1, 1))
  const goNext = () => setViewDate(new Date(year, month + 1, 1))
  const today = scheduleDay(new Date())
  const editableCount = assignments.filter(row => selectedIds.has(row.id) && canBulkEditAssignment(row, today)).length
  const filteredIdSet = new Set(listFilteredIds)
  const outsideFilter = viewMode === 'list' ? Array.from(selectedIds).filter(id => !filteredIdSet.has(id)).length : 0
  const selectGroup = (ids: string[], checked: boolean) => {
    if (isLoading || assignmentError) return
    const result = selectAssignments(selectedIds, ids, checked)
    if (result.limited) toast.error('Chỉ chọn tối đa 500 lịch mỗi lần; các lựa chọn ngoài bộ lọc vẫn được giữ.')
    setSelectedIds(result.selected); setTooltip(null)
  }

  const toggleSelection = (id: string) => {
    if (!selectedIds.has(id) && selectedIds.size >= 500) { toast.error('Chỉ chọn tối đa 500 lịch mỗi lần'); return }
    setSelectedIds(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next })
  }
  const selectMonth = (includeCarryover: boolean) => {
    const monthFirst = yearMonth + '-01'
    const monthLast = yearMonth + '-' + String(totalDays).padStart(2, '0')
    const visible = assignments.filter(row => scheduleDay(row.startDate) <= monthLast && scheduleDay(row.endDate) >= monthFirst &&
      (includeCarryover || scheduleDay(row.startDate).slice(0, 7) === yearMonth))
      .sort((a, b) => a.machineId.localeCompare(b.machineId) || a.startDate.localeCompare(b.startDate) || a.id.localeCompare(b.id))
    if (visible.length > 500) toast.error('Chỉ chọn tối đa 500 lịch mỗi lần')
    setSelectedIds(new Set(visible.slice(0, 500).map(row => row.id)))
  }
  const openRemoval = () => {
    const snapshot = assignments.filter(row => selectedIds.has(row.id)).map(row => ({ ...row }))
    if (snapshot.length !== selectedIds.size) { toast.error('Lịch đã thay đổi, tải lại và chọn lại'); setSelectedIds(new Set()); void fetchAssignments(); return }
    setTooltip(null); setRemovalSnapshot(snapshot)
  }
  const openBulkEdit = (command: 'MOVE_MACHINE' | 'SHIFT_DAYS' = 'MOVE_MACHINE') => {
    const snapshot = assignments.filter(row => selectedIds.has(row.id)).map(row => ({ ...row }))
    if (snapshot.length !== selectedIds.size) { toast.error('Lịch đã thay đổi, tải lại và chọn lại'); setSelectedIds(new Set()); void fetchAssignments(); return }
    setTooltip(null); setEditCommand(command); setEditSnapshot(snapshot)
  }
  const submitRemoval = async () => {
    if (!removalSnapshot || removalBusy.current) return
    removalBusy.current = true; setIsRemoving(true)
    try {
      const response = await fetch('/api/assignments/bulk-delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ assignments: removalSnapshot.map(({ id, updatedAt }) => ({ id, updatedAt })) }) })
      const body = await response.json()
      if (!response.ok) {
        if (body.code === 'STALE_SELECTION') { setRemovalSnapshot(null); setSelectedIds(new Set()); await fetchAssignments() }
        throw new Error(body.error || body.message || 'Không thể gỡ phân công')
      }
      toast.success(`Đã gỡ ${body.removed.length} · Giữ lại ${body.protected.length} (máy đã có sản lượng)`)
      if (removalSnapshot.some(row => row.isPlaceholder && body.removed.includes(row.id))) toast.info('Đơn giữ chỗ vẫn còn trong danh sách đơn — xoá ở màn Production Orders nếu không cần')
      setRemovalSnapshot(null); setSelectedIds(new Set())
      await fetchAssignments()
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Không thể gỡ phân công') }
    finally { removalBusy.current = false; setIsRemoving(false) }
  }

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

  const selectionToolbar = <div role="region" aria-label="Thao tác nhiều lịch" className={`${viewMode === 'list' ? 'sticky top-16 z-40 mb-3 gap-3' : 'gap-2'} flex flex-wrap items-center rounded border border-outline-variant bg-white p-3 text-sm shadow-sm`}>
    <span role="status" aria-live="polite">Đã chọn {selectedIds.size} lịch{outsideFilter > 0 ? ` (${outsideFilter} ngoài bộ lọc hiện tại)` : ''}</span>
    <button type="button" onClick={() => setSelectedIds(new Set())} className="rounded border border-outline-variant px-3 py-2">Bỏ chọn</button>
    <button type="button" title={!editableCount ? 'Chỉ sửa được lịch chưa bắt đầu' : undefined} disabled={!editableCount || selectedIds.size > 500 || isLoading || !!assignmentError} onClick={() => openBulkEdit('MOVE_MACHINE')} className="h-9 rounded-md border border-outline-variant px-4 text-sm disabled:opacity-50">Chuyển máy ({editableCount}/{selectedIds.size} đủ điều kiện)</button>
    <button type="button" title={!editableCount ? 'Chỉ sửa được lịch chưa bắt đầu' : undefined} disabled={!editableCount || selectedIds.size > 500 || isLoading || !!assignmentError} onClick={() => openBulkEdit('SHIFT_DAYS')} className="h-9 rounded-md border border-outline-variant px-4 text-sm disabled:opacity-50">Dời ngày ({editableCount}/{selectedIds.size})</button>
    <button type="button" disabled={!selectedIds.size || selectedIds.size > 500 || isLoading || !!assignmentError} onClick={openRemoval} className="rounded bg-error px-3 py-2 text-white disabled:opacity-50">Gỡ ({selectedIds.size})</button>
    <span className="text-xs text-secondary">Số đủ điều kiện là lịch chưa bắt đầu; sản lượng được kiểm khi xem trước/xác nhận.</span>
  </div>

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
        <div className="flex flex-wrap items-center gap-md">
          <div role="group" aria-label="Chế độ xem lịch" className="flex rounded border border-outline-variant">
            {(['detail', 'overview', 'list'] as const).map(mode => <button key={mode} type="button" aria-pressed={viewMode === mode} onClick={() => changeView(mode)} className={`px-3 py-1.5 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${viewMode === mode ? 'bg-primary text-white' : 'bg-white text-primary'}`}>{mode === 'detail' ? 'Chi tiết' : mode === 'list' ? 'Danh sách' : 'Tổng quan'}</button>)}
          </div>
          {viewMode !== 'list' && <details className="selection-menu relative" onKeyDown={event => { if (event.key === 'Escape' && event.currentTarget.open) { event.nativeEvent.stopImmediatePropagation(); event.currentTarget.open = false; event.currentTarget.querySelector('summary')?.focus() } }}>
            <summary aria-label="Chọn lịch" className="flex cursor-pointer items-center gap-2 rounded-md border border-primary px-3 py-2 text-sm text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">Chọn lịch<span aria-hidden="true" className="h-1.5 w-1.5 rotate-45 border-b border-r border-current" /></summary>
            <div className="absolute right-0 z-50 mt-1 w-72 rounded border border-outline-variant bg-white p-1 shadow-lg">
              <p className="px-3 py-2 text-xs text-secondary">Rê chuột lên lịch và tick để chọn từng lịch.</p>
              {[false, true].map(carryover => <button key={String(carryover)} type="button" disabled={isLoading || !!assignmentError} onClick={event => { selectMonth(carryover); event.currentTarget.closest('details')?.removeAttribute('open'); event.currentTarget.closest('details')?.querySelector('summary')?.focus() }} className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-surface-container focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50">{carryover ? 'Chọn cả tháng (gồm đơn từ tháng trước)' : 'Chọn cả tháng'}</button>)}
            </div>
          </details>}
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

      {viewMode === 'list' && hasSelection && selectionToolbar}
      {viewMode !== 'list' && <div aria-label="Chú giải lịch máy" className="mb-sm flex flex-wrap items-center gap-md text-xs text-on-surface-variant">
        <span className="inline-flex items-center gap-1"><span className="h-3 w-3 border border-outline-variant bg-white" />Ngày làm</span>
        <span className="inline-flex items-center gap-1"><span className="h-3 w-3 border border-amber-300 bg-amber-100" />Ngày nghỉ</span>
        <span className="inline-flex items-center gap-1"><span className="h-3 w-3 border border-amber-400 bg-amber-200" />Ngày lễ</span>
        <span className="inline-flex items-center gap-1"><span className="h-3 w-3 border border-outline-variant bg-white" />Làm bù</span>
      </div>}
      {calendarError && <p role="alert" className="mb-sm text-sm text-error">{calendarError}</p>}
      {assignmentError && <div role="alert" className="mb-sm rounded bg-error-container p-3 text-sm text-error">{assignmentError}<button type="button" onClick={fetchAssignments} className="ml-3 underline">Thử lại</button></div>}
      {!isLoading && !assignmentError && assignments.length === 0 && <p role="status" className="mb-sm text-sm text-secondary">Chưa có phân công trong tháng. Bấm ô ngày trống để xếp máy hoặc nhập lịch tháng.</p>}
      {affectedAssignments > 0 && <p role="status" className="mb-sm rounded border border-amber-300 bg-amber-100 px-3 py-2 text-xs text-on-surface">{affectedAssignments} lịch cần kiểm tra lại — ngày kết thúc đang rơi vào ngày nghỉ. Lịch đã lưu được giữ nguyên.</p>}
      {viewMode === 'list' ? <AssignmentListView assignments={assignments} machines={MACHINES} selected={selectedIds} onSelect={selectGroup} onFilteredIdsChange={setListFilteredIds} today={today} yearMonth={yearMonth} calendar={calendar} disabled={isLoading || !!assignmentError} /> : <div ref={gridFrameRef} className="relative flex max-h-[70vh] flex-col overflow-hidden"><div data-schedule-scroll onScroll={() => setTooltip(null)} style={{ containerType: 'inline-size' }} className="min-h-0 overflow-auto rounded-lg border-[0.5px] border-outline-variant bg-surface-container-lowest shadow-sm">
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
                  <td data-selection-active={hasSelection} title={machineSpecTooltip(specState, machineSpecs[machine])} className={`machine-selection sticky left-0 z-20 border-r border-outline-variant px-3 py-2 align-middle ${rowIdx % 2 === 0 ? 'bg-white' : 'bg-[#f8f6f5]'}`}>
                    <div className="flex items-center gap-1">
                      {bars.length > 0 && <label title={`Chọn cả máy ${machine}`} className="selection-control inline-flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center"><SelectionCheckbox label={`Chọn cả máy ${machine}`} {...selectionState(bars.map(bar => bar.assignment.id), selectedIds)} disabled={isLoading || !!assignmentError} onChange={checked => selectGroup(bars.map(bar => bar.assignment.id), checked)} /></label>}
                      <div tabIndex={0} aria-label={machineCellLabel(machine, specState, machineSpecs[machine])} className="rounded-sm font-mono font-semibold text-on-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">{machine}</div>
                    </div>
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
                        const chosen = selectedIds.has(assignment.id)
                        const showTooltip = (element: HTMLElement) => {
                          keepTooltip()
                          const rect = element.getBoundingClientRect()
                          const above = rect.top >= window.innerHeight / 2
                          setTooltip({ assignment, left: Math.max(8, Math.min(rect.left, window.innerWidth - 360)), top: above ? rect.top - 4 : rect.bottom + 4, above })
                        }
                        return <Fragment key={assignment.id}><div data-assignment-bar={assignment.id} data-selection-active={hasSelection} data-view={viewMode}
                          onMouseEnter={event => showTooltip(event.currentTarget)} onMouseLeave={hideTooltip}
                          onFocus={event => showTooltip(event.currentTarget)} onBlur={event => { if (!(event.relatedTarget instanceof HTMLElement) || !event.relatedTarget.closest('[data-assignment-tooltip]')) setTooltip(null) }}
                          onKeyDown={event => { if (event.key === 'Escape') setTooltip(null) }}
                          // 1510-04e: cả thanh mở chi tiết (bàn phím đi qua nút gridcell bên trong, click nổi bọt lên đây); ô tick đã stopPropagation.
                          onClick={event => { if (event.target instanceof Element && event.target.closest('.selection-control')) return; setTooltip(null); setSelectedAssignment(assignment); setIsDetailOpen(true) }}
                          className={`assignment-bar relative z-[2] mx-0.5 my-1.5 cursor-pointer overflow-clip rounded-md border text-left ${chosen ? 'ring-2 ring-primary' : ''} ${placeholder ? 'border-2 border-dashed' : ''}`}
                          style={{ gridColumn: `${from} / span ${span}`, gridRow: lane + 1, backgroundColor: chosen ? '#1b3a5c' : placeholder ? '#fffbeb' : color.bgHex, color: chosen ? '#ffffff' : placeholder ? '#43474e' : color.textHex, borderColor: chosen ? '#002444' : placeholder ? '#b45309' : color.borderHex }}>
                          <span aria-hidden="true" className="pointer-events-none absolute bottom-0 top-0 flex" style={{ left: placeholder ? -4 : -3 }}>
                            {Array.from({ length: span }, (_, offset) => <span key={offset} data-overlay-day={from + offset} className="h-full shrink-0" style={{ width: dayWidth, backgroundColor: chosen ? undefined : exceptionFor(from + offset)?.kind === 'HOLIDAY' ? '#fde68a' : isRestDay(from + offset) ? '#fef3c7' : undefined }} />)}
                          </span>
                          <div data-sticky-label className="bar-label sticky py-2" style={{ left: MACHINE_COL_WIDTH, width: 'min(100%, 32px)' }}>
                            <label title={`Chọn lịch ${pi}`} onClick={event => event.stopPropagation()} className="selection-control bar-checkbox absolute left-1 top-2 z-10 inline-flex h-6 w-6 cursor-pointer items-center justify-center"><input type="checkbox" aria-label={`Chọn lịch ${pi} máy ${machine}`} checked={chosen} onChange={() => { setTooltip(null); toggleSelection(assignment.id) }} className="h-4 w-4 cursor-pointer accent-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary" /></label>
                            <button data-assignment={assignment.id} type="button" role="gridcell" aria-label={`${machine} — ${pi} — ${scheduleDay(assignment.startDate).split('-').reverse().join('/')} đến ${scheduleDay(assignment.endDate).split('-').reverse().join('/')}`} aria-describedby={tooltip?.assignment.id === assignment.id ? 'assignment-tooltip' : undefined}
                              style={{ width: `min(${span * dayWidth - (placeholder ? 8 : 6)}px, 320px, calc(100cqw - ${MACHINE_COL_WIDTH}px))` }} className="bar-body block min-h-10 px-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary">
                            <span aria-hidden="true" className="checkbox-space float-left mr-1 h-6 w-6" />
                            <span data-pi-label className={`block text-xs font-semibold ${viewMode === 'detail' && span >= 2 ? 'whitespace-normal break-words [overflow-wrap:anywhere]' : 'truncate'}`}>
                              <span>{placeholder ? draft ? 'NHÁP' : 'GIỮ CHỖ' : fullLabel}</span>
                            </span>
                            <span className={`bar-extra mt-1 block text-[11px] ${placeholder && viewMode === 'detail' && span >= 2 ? 'break-words [overflow-wrap:anywhere]' : 'truncate'}`}>
                              {placeholder ? pi : `${spec ? `${spec} · ` : ''}Phân công: ${allocation}`}
                            </span>
                            </button>
                          </div>
                        </div>
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
        <div aria-hidden="true" style={{ height: 'var(--selection-footer-height, 0px)' }} />
      </div><div data-selection-footer aria-hidden={!hasSelection} className="absolute inset-x-0 bottom-0 z-40 pt-2" style={{ visibility: hasSelection ? 'visible' : 'hidden' }}>{selectionToolbar}</div></div>}
      {conflicts && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={closeConflicts}><div ref={conflictRef} role="dialog" aria-modal="true" aria-label="Các phân công trùng lịch" onClick={event => event.stopPropagation()} className="max-h-[90vh] w-full max-w-xl overflow-auto rounded-xl border border-outline-variant bg-white p-4">
        <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">Các phân công trùng lịch</h2><button type="button" onClick={closeConflicts} className="rounded border border-outline-variant px-3 py-2 text-xs">Đóng</button></div>
        {conflicts.map(assignment => <div key={assignment.id} className="mb-2 rounded border border-outline-variant p-3"><button type="button" onClick={() => { conflictTrigger.current?.focus(); closeConflicts(); setSelectedAssignment(assignment); setIsDetailOpen(true) }} className="block w-full text-left text-sm font-semibold text-primary">{assignment.order.piNumber} · Dòng {lineLabel(assignment.order)}</button><p className="my-1 text-xs">{scheduleDay(assignment.startDate).split('-').reverse().join('/')} → {scheduleDay(assignment.endDate).split('-').reverse().join('/')}</p><button type="button" onClick={() => { conflictTrigger.current?.focus(); closeConflicts(); setSelectedPi(assignment.order.piNumber) }} className="text-xs text-primary underline">Xem toàn bộ PI</button></div>)}
      </div></div>}
      {removalSnapshot && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={closeRemoval}>
        <div ref={removalModalRef} role="dialog" aria-modal="true" aria-labelledby="remove-assignments-title" onClick={event => event.stopPropagation()} className="max-h-[90vh] w-full max-w-xl overflow-auto rounded-xl border border-outline-variant bg-white p-5 shadow-lg">
          <h2 id="remove-assignments-title" className="text-lg font-semibold text-primary">Xác nhận gỡ {removalSnapshot.length} phân công</h2>
          <p className="mt-3 text-sm">{new Set(removalSnapshot.map(row => row.machineId)).size} máy · {removalSnapshot.map(row => scheduleDay(row.startDate)).sort()[0]?.split('-').reverse().join('/')} → {removalSnapshot.map(row => scheduleDay(row.endDate)).sort().slice(-1)[0]?.split('-').reverse().join('/')}</p>
          <p className="my-3 text-sm">Phân công đã có sản lượng sẽ được giữ lại. Đơn hàng vẫn còn trong danh sách đơn.</p>
          <ul aria-label="Phân công sẽ kiểm tra gỡ" className="max-h-48 overflow-auto rounded border border-outline-variant p-3 text-xs">{removalSnapshot.map(row => <li key={row.id} className="py-1">{row.machineId} · {row.order.piNumber} · {scheduleDay(row.startDate).split('-').reverse().join('/')} → {scheduleDay(row.endDate).split('-').reverse().join('/')}</li>)}</ul>
          {isRemoving && <p role="status" tabIndex={0} className="mt-3 text-sm">Đang kiểm tra và gỡ phân công…</p>}
          <div className="mt-4 flex justify-end gap-3">
            <button type="button" aria-disabled={isRemoving} onClick={closeRemoval} className={`h-9 rounded-md border border-outline-variant px-4 text-sm ${isRemoving ? 'opacity-50' : ''}`}>Huỷ</button>
            <button type="button" aria-disabled={isRemoving} onClick={submitRemoval} className={`h-9 rounded-md bg-error px-4 text-sm text-white ${isRemoving ? 'opacity-50' : ''}`}>Xác nhận gỡ</button>
          </div>
        </div>
      </div>}
      {selectedPi&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={closePi}><div ref={piModalRef} role="dialog" aria-modal="true" aria-label={`PI ${selectedPi}`} onClick={event=>event.stopPropagation()} className="max-h-[90vh] w-full max-w-5xl overflow-auto rounded-xl border border-outline-variant bg-white p-4"><button type="button" onClick={closePi} className="rounded border border-outline-variant px-3 py-2 text-xs">Đóng</button><PiOrderPanel piNumber={selectedPi}/></div></div>}

      {editSnapshot && <BulkEditModal selected={editSnapshot} initialCommand={editCommand} onClose={closeBulkEdit} onStale={() => { setEditSnapshot(null); setSelectedIds(new Set()); toast.error('Lịch đã thay đổi, tải lại và chọn lại'); void fetchAssignments() }} onSuccess={updated => { setEditSnapshot(null); setSelectedIds(new Set()); toast.success(`Đã sửa ${updated.toLocaleString('vi-VN')} lịch`); void fetchAssignments() }} />}

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
      <style jsx>{`
        .selection-menu summary { list-style: none; }
        .selection-menu summary::-webkit-details-marker { display: none; }
        .assignment-bar { height: 64px; min-height: 64px; max-height: 64px; }
        .assignment-bar[data-view='detail'] .checkbox-space { display: none; }
        .assignment-bar[data-view='detail'] .bar-label { padding-top: 4px; padding-bottom: 4px; }
        .assignment-bar[data-view='detail'] .bar-body { padding-left: 36px; padding-top: 0; padding-bottom: 0; min-height: 0; }
        .assignment-bar[data-view='detail'] [data-pi-label] { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; line-clamp: 2; line-height: 16px; max-height: 32px; overflow: hidden; white-space: normal; overflow-wrap: anywhere; }
        .assignment-bar[data-view='detail'] .bar-extra { margin-top: 2px; line-height: 14px; }
        .assignment-bar[data-view='overview'] .bar-body { padding: 24px 4px 0; min-height: 40px; }
        .assignment-bar[data-view='overview'] .checkbox-space { display: none; }
        .assignment-bar[data-view='overview'] .bar-extra { display: none; }
        @media (hover: hover) and (pointer: fine) {
          .selection-control { opacity: 0; pointer-events: none; }
          tr:not(:hover):not(:focus-within) .assignment-bar:not([data-selection-active='true']) .checkbox-space { display: none; }
          tr:not(:hover):not(:focus-within) .assignment-bar[data-view='overview']:not([data-selection-active='true']) .bar-body { padding: 0 4px; }
          tr:not(:hover):not(:focus-within) .assignment-bar[data-view='overview']:not([data-selection-active='true']) .bar-extra { display: block; }
          tr:hover .assignment-bar .selection-control, tr:focus-within .assignment-bar .selection-control, .assignment-bar:focus-within .selection-control,
          tr:hover .machine-selection .selection-control, .machine-selection:focus-within .selection-control,
          [data-selection-active='true'] .selection-control { opacity: 1; pointer-events: auto; }
        }
      `}</style>
    </div>
  )
}
