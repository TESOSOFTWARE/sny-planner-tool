'use client'

import { useState, useEffect } from 'react'
import { isSameDay, startOfDay } from 'date-fns'
import AssignModal from '@/components/schedule/AssignModal'
import DetailModal, { AssignmentDetail } from '@/components/schedule/DetailModal'
import ImportScheduleModal from '@/components/schedule/ImportScheduleModal'
import { getPiColorStyle } from '@/lib/colors'

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}
function formatMonthLabel(date: Date): string {
  return date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
}

const MACHINES = Array.from({ length: 40 }, (_, i) => `M-${String(i + 1).padStart(3, '0')}`)
const DAY_ABBR = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

function isWeekend(year: number, month: number, day: number): boolean {
  const dow = new Date(year, month, day).getDay()
  return dow === 0 || dow === 6
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SchedulePage() {
  const [viewDate, setViewDate] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })

  const [assignments, setAssignments] = useState<AssignmentDetail[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Modals state
  const [isAssignOpen, setIsAssignOpen] = useState(false)
  const [isDetailOpen, setIsDetailOpen] = useState(false)
  const [isImportOpen, setIsImportOpen] = useState(false)
  const [selectedMachine, setSelectedMachine] = useState('')
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [selectedAssignment, setSelectedAssignment] = useState<AssignmentDetail | null>(null)

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const totalDays = daysInMonth(year, month)
  const days = Array.from({ length: totalDays }, (_, i) => i + 1)

  const fetchAssignments = async () => {
    setIsLoading(true)
    try {
      const res = await fetch(`/api/assignments?year=${year}&month=${month}`)
      if (res.ok) {
        const data = await res.json()
        setAssignments(data)
      }
    } catch (err) {
      console.error(err)
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

  const getAssignment = (machineId: string, date: Date) => {
    return assignments.find(a => {
      if (a.machineId !== machineId) return false
      const start = startOfDay(new Date(a.startDate))
      const end = startOfDay(new Date(a.endDate))
      const d = startOfDay(date)
      return d >= start && d <= end
    })
  }

  return (
    <div className="px-container-margin py-xl">
      <div className="mb-lg">
        <h1 className="text-display font-inter font-semibold text-primary tracking-tight">
          Machine schedule
        </h1>
        <p className="text-body-md font-noto text-secondary mt-xs">
          Loom and machine allocation view
        </p>
      </div>

      <div className="flex items-center justify-between mb-md">
        <div className="flex items-center gap-sm">
          <button
            onClick={goPrev}
            className="w-8 h-8 flex items-center justify-center rounded-lg border-[0.5px] border-outline-variant hover:bg-surface-container text-on-surface-variant transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">chevron_left</span>
          </button>
          <h2 className="text-headline-md font-inter font-semibold text-on-surface w-44 text-center">
            {formatMonthLabel(viewDate)}
          </h2>
          <button
            onClick={goNext}
            className="w-8 h-8 flex items-center justify-center rounded-lg border-[0.5px] border-outline-variant hover:bg-surface-container text-on-surface-variant transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">chevron_right</span>
          </button>
        </div>
        <div className="flex items-center gap-md">
          {isLoading && <span className="text-label-sm text-secondary animate-pulse">Loading...</span>}
          <button
            onClick={() => setIsImportOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container border border-outline-variant hover:bg-surface-container-high text-xs font-medium text-on-surface transition-colors"
          >
            <span className="material-symbols-outlined text-[16px] text-primary">upload_file</span>
            Import Lịch tháng
          </button>
          <p className="text-label-sm font-inter text-secondary">
            {totalDays} days · {MACHINES.length} machines
          </p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border-[0.5px] border-outline-variant bg-surface-container-lowest shadow-sm">
        <table className="border-collapse text-xs w-full">
          <thead>
            <tr className="bg-surface-container border-b-[0.5px] border-outline-variant">
              <th className="sticky left-0 z-20 bg-surface-container border-r-[0.5px] border-outline-variant px-md py-sm text-left text-label-sm font-inter font-medium text-secondary uppercase tracking-widest min-w-[88px]">
                Machine
              </th>
              {days.map((day) => {
                const weekend = isWeekend(year, month, day)
                const dow = new Date(year, month, day).getDay()
                return (
                  <th
                    key={day}
                    className={`w-10 min-w-[40px] py-1.5 text-center font-medium border-r-[0.5px] border-outline-variant/60 last:border-r-0 ${
                      weekend ? 'text-outline' : 'text-on-surface-variant'
                    }`}
                  >
                    <div className="text-body-sm">{day}</div>
                    <div className={`text-[10px] leading-none mt-0.5 ${weekend ? 'text-outline-variant' : 'text-outline'}`}>
                      {DAY_ABBR[dow]}
                    </div>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-[0.5px] divide-outline-variant/50 relative z-0">
            {MACHINES.map((machine, rowIdx) => (
              <tr key={machine} className={rowIdx % 2 === 0 ? 'bg-surface-container-lowest' : 'bg-surface-container-low/40'}>
                <td className={`sticky left-0 z-10 border-r-[0.5px] border-outline-variant px-md py-1.5 font-mono text-type-mono text-on-surface-variant whitespace-nowrap ${
                    rowIdx % 2 === 0 ? 'bg-surface-container-lowest' : 'bg-[#f8f6f5]'
                  }`}>
                  {machine}
                </td>
                {days.map((day) => {
                  const date = new Date(year, month, day)
                  const weekend = isWeekend(year, month, day)
                  const assignment = getAssignment(machine, date)
                  
                  if (assignment) {
                    const isStart = isSameDay(startOfDay(new Date(assignment.startDate)), date)
                    const isEnd = isSameDay(startOfDay(new Date(assignment.endDate)), date)
                    const showLabel = isStart || day === 1
                    const isPlaceholder = assignment.isPlaceholder || assignment.order?.isDraft
                    const colorStyle = getPiColorStyle(assignment.order?.piNumber)

                    return (
                      <td key={day} className={`border-r-[0.5px] border-outline-variant/40 p-0 last:border-r-0 ${weekend ? 'bg-surface-container/60' : ''}`}>
                        <div 
                          onClick={() => handleCellClick(machine, date)}
                          title={`${assignment.order.piNumber}${isPlaceholder ? ' [Giữ chỗ tạm - Đơn nháp]' : ''}`}
                          style={{
                            backgroundColor: colorStyle.bgHex,
                            color: colorStyle.textHex,
                            borderColor: isPlaceholder ? undefined : colorStyle.borderHex,
                          }}
                          className={`h-7 mx-0.5 my-0.5 flex items-center cursor-pointer transition-opacity hover:opacity-85 ${colorStyle.bgClass} ${colorStyle.textClass}
                            ${isStart ? 'rounded-l-md ml-1' : ''}
                            ${isEnd ? 'rounded-r-md mr-1' : ''}
                            ${isPlaceholder 
                              ? 'border-2 border-dashed border-amber-600 font-semibold' 
                              : `border-y border-r ${colorStyle.borderClass} font-medium`
                            }
                          `}
                        >
                          {showLabel ? (
                            <span className="text-[10px] px-1.5 truncate leading-none pt-0.5 flex items-center gap-0.5">
                              {isPlaceholder && <span className="material-symbols-outlined text-[11px] leading-none shrink-0" style={{ color: colorStyle.textHex }}>push_pin</span>}
                              <span>{assignment.order.piNumber}</span>
                              {isPlaceholder && <span className="text-[9px] font-bold px-1 py-0.2 rounded border border-amber-500/60 bg-amber-200/90 text-amber-950 shrink-0">Nháp</span>}
                            </span>
                          ) : null}
                        </div>
                      </td>
                    )
                  }

                  return (
                    <td
                      key={day}
                      onClick={() => handleCellClick(machine, date)}
                      className={`h-9 border-r-[0.5px] border-outline-variant/40 last:border-r-0 cursor-pointer hover:bg-surface-container-high/50 transition-colors ${
                        weekend ? 'bg-surface-container/60' : ''
                      }`}
                    />
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
      />
    </div>
  )
}
