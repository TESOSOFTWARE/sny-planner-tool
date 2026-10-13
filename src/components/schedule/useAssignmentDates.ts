'use client'

import { useEffect, useRef, useState } from 'react'
import { resolveAssignmentDates, type AssignmentDatePlan } from '@/lib/schedule/assignmentDates'
import { calculateProductionDays, type FactoryCalendar } from '@/lib/schedule/productionDuration'
import { modeOnFormulaChange } from '@/lib/schedule/dateMode'

interface Props {
  enabled: boolean
  startDate: string
  endDate: string
  allocatedMeters: string
  estimatedDailyOutput: string
  setEndDate: (date: string) => void
  originalStartDate?: string
  // 0810-24: chỉ màn Chuyển máy bật. Mặc định tắt → 3 màn khác giữ hành vi cũ.
  autoOnFormulaChange?: boolean
}

export function useAssignmentDates({
  enabled, startDate, endDate, allocatedMeters, estimatedDailyOutput, setEndDate, originalStartDate, autoOnFormulaChange = false,
}: Props) {
  const initialMode = originalStartDate === undefined ? 'COMPUTED' : 'PRESERVED'
  const [mode, setMode] = useState<'COMPUTED' | 'MANUAL' | 'PRESERVED'>(initialMode)
  const [recalculatedFromManual, setRecalculatedFromManual] = useState(false)
  const [result, setResult] = useState<{ key: string; plan: AssignmentDatePlan | null; error: string | null } | null>(null)
  const manualEnd = mode === 'COMPUTED' ? undefined : endDate
  const key = JSON.stringify([startDate, manualEnd, allocatedMeters, estimatedDailyOutput, mode, originalStartDate])
  const formulaKey = JSON.stringify([startDate, allocatedMeters, estimatedDailyOutput])
  const seenFormula = useRef(formulaKey)
  const modeRef = useRef(mode)
  modeRef.current = mode

  useEffect(() => {
    if (enabled) { setResult(null); setMode(originalStartDate === undefined ? 'COMPUTED' : 'PRESERVED'); setRecalculatedFromManual(false) }
  }, [enabled, originalStartDate])

  // Sửa số mét / năng suất / ngày bắt đầu → chuyển COMPUTED (chỉ khi bật tuỳ chọn).
  useEffect(() => {
    if (seenFormula.current === formulaKey) return
    seenFormula.current = formulaKey
    if (!enabled) return
    const next = modeOnFormulaChange(modeRef.current, autoOnFormulaChange)
    if (next.mode === modeRef.current) return
    setMode(next.mode)
    if (next.recalculatedFromManual) setRecalculatedFromManual(true)
  }, [formulaKey, enabled, autoOnFormulaChange])

  useEffect(() => {
    if (!enabled || !startDate) return
    const controller = new AbortController()
    let ignore = false
    const timer = setTimeout(async () => {
      try {
        const plan = await resolveAssignmentDates({
          startDate, endDate: manualEnd, allocatedMeters, estimatedDailyOutput,
          computeEnd: mode === 'COMPUTED' && calculateProductionDays(allocatedMeters, estimatedDailyOutput) !== null,
          adjustStart: originalStartDate === undefined || mode === 'COMPUTED' || startDate !== originalStartDate,
          // Người dùng vừa gõ ngày kết thúc -> báo lỗi ngay trên form, không đợi server.
          rejectNonWorkingEnd: mode === 'MANUAL',
        }, async (from, to) => {
          const res = await fetch('/api/calendar?from=' + from + '&to=' + to, { signal: controller.signal, cache: 'no-store' })
          const data = await res.json()
          if (!res.ok || !data.success) throw new Error(data.error || 'Không tải được lịch nghỉ.')
          return data.calendar as FactoryCalendar
        })
        if (!ignore) {
          setResult({ key, plan, error: null })
          if (mode === 'COMPUTED') setEndDate(plan.endDate)
        }
      } catch (err) {
        if (!ignore) setResult({ key, plan: null, error: err instanceof Error ? err.message : 'Không tính được lịch.' })
      }
    }, 200)
    return () => { ignore = true; controller.abort(); clearTimeout(timer) }
  }, [enabled, startDate, manualEnd, allocatedMeters, estimatedDailyOutput, mode, originalStartDate, setEndDate, key])

  const current = enabled && result?.key === key ? result : null
  const plan = current?.plan ?? null
  return {
    plan, mode, recalculatedFromManual,
    loading: enabled && !!startDate && current === null,
    error: current?.error ?? null,
    setManualEndDate: (date: string) => { setMode('MANUAL'); setRecalculatedFromManual(false); setEndDate(date) },
    useComputedDates: () => { setMode('COMPUTED'); setRecalculatedFromManual(false) },
    endDateSource: mode === 'PRESERVED' ? undefined : mode === 'COMPUTED' && plan?.estimate ? 'COMPUTED' as const : 'MANUAL' as const,
  }
}
