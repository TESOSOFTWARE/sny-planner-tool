import {
  calculateProductionDays, calculateProductionSchedule, countWorkingDays, isWorkingDay,
  type FactoryCalendar, type ProductionScheduleEstimate,
} from './productionDuration'

export type CalendarLoader = (from: string, to: string) => Promise<FactoryCalendar>
export class AssignmentDateError extends Error {}

export interface AssignmentDateInput {
  startDate: string
  endDate?: string
  allocatedMeters?: number | string | null
  estimatedDailyOutput?: number | string | null
  computeEnd: boolean
  adjustStart: boolean
  /**
   * Từ chối khi ngày kết thúc rơi vào ngày nghỉ. Chỉ bật khi người dùng chủ động
   * đặt/đổi ngày kết thúc; lịch cũ hoặc lịch import mang sang thì để false để
   * giữ nguyên ngày đã lưu (chỉ cảnh báo).
   */
  rejectNonWorkingEnd?: boolean
}

export interface AssignmentDatePlan {
  startDate: string
  endDate: string
  suggestedStartDate: string
  estimate: ProductionScheduleEstimate | null
  warnings: string[]
  // Số ngày làm việc của khoảng ngày đang dùng (0810-25: so với công thức). null nếu không đo được.
  workingDaysInRange: number | null
}

export function factoryDateToISO(label: string): string {
  return new Date(label + 'T00:00:00+07:00').toISOString()
}

function validDate(label: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(label)) return false
  const date = new Date(label + 'T00:00:00Z')
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === label
}

function throughDate(from: string, days: number): string {
  const date = new Date(from + 'T00:00:00Z')
  date.setUTCDate(date.getUTCDate() + days - 1)
  return date.toISOString().slice(0, 10)
}

/** Never accept a result outside the calendar range actually loaded. */
export async function resolveAssignmentDates(
  input: AssignmentDateInput, loadCalendar: CalendarLoader,
): Promise<AssignmentDatePlan> {
  if (!validDate(input.startDate) || (input.endDate && !validDate(input.endDate))) {
    throw new AssignmentDateError('Ngày phân công không hợp lệ.')
  }
  const days = calculateProductionDays(input.allocatedMeters, input.estimatedDailyOutput)
  if (input.computeEnd && days === null) {
    throw new AssignmentDateError('Cần số mét phân công và năng suất lớn hơn 0 để tự tính ngày kết thúc.')
  }
  const needed = days ?? 1
  let span = Math.min(36600, Math.max(32, needed * 2))
  let estimate: ProductionScheduleEstimate | null = null
  let calendar: FactoryCalendar
  let through: string
  for (;;) {
    through = throughDate(input.startDate, span)
    calendar = await loadCalendar(input.startDate, through)
    estimate = calculateProductionSchedule(input.startDate, needed, 1, calendar)
    if (estimate && estimate.computedEndDate <= through) break
    if (span === 36600) {
      throw new AssignmentDateError('Không tìm được lịch làm việc đủ để tính ngày kết thúc.')
    }
    span = Math.min(36600, span * 2)
  }
  const startDate = input.adjustStart ? estimate.effectiveStartDate : input.startDate
  const endDate = input.computeEnd ? estimate.computedEndDate : input.endDate || startDate
  if (endDate < startDate) {
    throw new AssignmentDateError('Ngày kết thúc không được trước ngày bắt đầu sau khi điều chỉnh ngày nghỉ.')
  }
  const endCalendar = endDate >= input.startDate && endDate <= through
    ? calendar : await loadCalendar(endDate, endDate)
  const endOnNonWorkingDay = isWorkingDay(endCalendar, endDate) === false
  const endLabel = endDate.split('-').reverse().join('/')
  if (endOnNonWorkingDay && input.rejectNonWorkingEnd) {
    throw new AssignmentDateError(
      'Ngày kết thúc ' + endLabel + ' là ngày nghỉ của nhà máy. Chọn ngày làm việc khác.',
    )
  }
  const warnings = endOnNonWorkingDay
    ? ['Ngày kết thúc ' + endLabel + ' là ngày nghỉ. Giữ theo lịch đã lưu.']
    : []
  const workingDaysInRange = endDate <= through && startDate <= endDate
    ? countWorkingDays(calendar, startDate, endDate) : null
  return {
    startDate, endDate, suggestedStartDate: estimate.effectiveStartDate,
    estimate: days === null ? null : estimate, warnings, workingDaysInRange,
  }
}
