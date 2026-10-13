'use client'

import { calculateProductionDays } from '@/lib/schedule/productionDuration'
import type { AssignmentDatePlan } from '@/lib/schedule/assignmentDates'
import { formulaText, gapText, scheduleGap } from '@/lib/schedule/dayFrame'

interface Props {
  allocatedMeters: string
  estimatedDailyOutput: string
  machineId?: string
  startDate?: string
  plan?: AssignmentDatePlan | null
  loading?: boolean
  error?: string | null
  mode?: 'COMPUTED' | 'MANUAL' | 'PRESERVED'
  onUseComputed?: () => void
  recalculated?: boolean
}
const displayDate = (date: string) => date.split('-').reverse().join('/')

// Khung tính ngày dùng chung, tối đa 3 dòng: công thức → lịch → trạng thái (chỉ khi cần). 0810-25.
export default function ProductionDurationSummary({
  allocatedMeters, estimatedDailyOutput, machineId, startDate, plan, loading, error, mode, onUseComputed, recalculated,
}: Props) {
  const days = calculateProductionDays(allocatedMeters, estimatedDailyOutput)
  const formula = formulaText(allocatedMeters, estimatedDailyOutput, days)
  const gap = plan?.estimate ? gapText(scheduleGap(days, plan.workingDaysInRange), plan.estimate.computedEndDate) : null
  const suggestedMoved = !!plan && !!startDate && startDate !== plan.suggestedStartDate && mode !== 'COMPUTED'
  const amber = [
    gap,
    suggestedMoved ? `Ngày bắt đầu ${displayDate(startDate!)} là ngày nghỉ · bỏ ngày nghỉ được ${displayDate(plan!.suggestedStartDate)}` : null,
    ...(plan?.warnings ?? []),
  ].filter(Boolean) as string[]
  const showUseComputed = mode !== undefined && mode !== 'COMPUTED' && !!plan?.estimate && !!onUseComputed
  const status = error
    ? <p role="alert" className="text-error">{error}</p>
    : loading ? <p className="text-secondary">Đang tính theo lịch nghỉ…</p>
    : amber.length > 0 ? <p role="status" className="text-amber-900">{amber.join(' · ')}</p>
    : recalculated ? <p className="text-secondary">Đã tính lại theo công thức — bỏ ngày sửa tay.</p>
    : mode === 'MANUAL' ? <p className="text-secondary">Sửa tay — giữ ngày kết thúc bạn chọn.</p>
    : null

  return (
    <div className="rounded-lg border border-outline-variant bg-surface-container p-3 text-sm space-y-1" aria-live="polite">
      <p className="text-on-surface">{formula ?? 'Nhập số mét phân công và năng suất lớn hơn 0 để tính ngày kết thúc.'}</p>
      {plan && (
        <p className="text-on-surface">
          {machineId ? `${machineId} · ` : ''}{displayDate(plan.startDate)} → {displayDate(plan.endDate)} · {(plan.workingDaysInRange ?? plan.estimate?.requiredWorkingDays ?? '—').toString()} ngày làm việc
        </p>
      )}
      {status}
      {showUseComputed && (
        <button type="button" onClick={onUseComputed} className="text-primary underline focus:outline-none focus:ring-1 focus:ring-primary">
          Dùng ngày hệ thống: {displayDate(plan!.estimate!.computedEndDate)}
        </button>
      )}
    </div>
  )
}
