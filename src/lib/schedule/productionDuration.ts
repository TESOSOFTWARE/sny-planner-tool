export interface FactoryCalendar {
  /** Ngày nghỉ hằng tuần mặc định. 0 = Chủ nhật, 6 = Thứ 7. */
  nonWorkingWeekdays: readonly number[]
  /**
   * Lịch nghỉ riêng của từng tháng ('YYYY-MM'). THAY THẾ hoàn toàn nonWorkingWeekdays
   * cho tháng đó, KHÔNG cộng dồn. Tháng nghỉ cả CN lẫn T7 phải ghi đủ [0, 6];
   * ghi [6] nghĩa là tháng đó ĐI LÀM Chủ nhật.
   */
  monthlyNonWorkingWeekdaysOverride?: Readonly<Record<string, readonly number[]>>
  workingDateOverrides?: Readonly<Record<string, boolean>>
}

export interface ProductionScheduleEstimate {
  requiredWorkingDays: number
  effectiveStartDate: string
  computedEndDate: string
}

export function calculateProductionDays(
  allocatedMeters: number | string | null | undefined,
  estimatedDailyOutput: number | string | null | undefined,
): number | null {
  const meters = Number(allocatedMeters)
  const output = Number(estimatedDailyOutput)
  if (!Number.isFinite(meters) || meters <= 0 || !Number.isFinite(output) || output <= 0) return null
  const days = Math.ceil(meters / output)
  return Number.isSafeInteger(days) && days > 0 ? days : null
}

function parseDateLabel(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const date = new Date(value + 'T00:00:00.000Z')
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null
}

function calendarIsValid(calendar: FactoryCalendar): boolean {
  const weekdayGroups = [
    calendar.nonWorkingWeekdays,
    ...Object.values(calendar.monthlyNonWorkingWeekdaysOverride ?? {}),
  ]
  return weekdayGroups.every(group => group.every(day => Number.isInteger(day) && day >= 0 && day <= 6))
    && Object.entries(calendar.workingDateOverrides ?? {}).every(
      ([date, working]) => parseDateLabel(date) !== null && typeof working === 'boolean',
    )
}

/**
 * Một ngày ('YYYY-MM-DD') có phải ngày làm việc không.
 * Thứ tự ưu tiên: ngoại lệ từng ngày > override tháng > lịch tuần mặc định.
 * Trả null khi nhãn ngày không hợp lệ.
 *
 * Dùng chung cho API chặn xếp máy và grid tô màu, để không có hai cách hiểu.
 */
export function isWorkingDay(calendar: FactoryCalendar, dateLabel: string): boolean | null {
  const date = parseDateLabel(dateLabel)
  if (!date || !calendarIsValid(calendar)) return null
  const weekdays =
    calendar.monthlyNonWorkingWeekdaysOverride?.[dateLabel.slice(0, 7)] ?? calendar.nonWorkingWeekdays
  return calendar.workingDateOverrides?.[dateLabel] ?? !weekdays.includes(date.getUTCDay())
}

/** Shift a factory day by signed working days, excluding the starting day. */
export function shiftWorkingDays(calendar: FactoryCalendar, dateLabel: string, n: number): string | null {
  const date = parseDateLabel(dateLabel)
  if (!date || !calendarIsValid(calendar) || !Number.isSafeInteger(n)) return null
  const direction = n < 0 ? -1 : 1
  let remaining = Math.abs(n)
  for (let elapsed = 0; elapsed < 36600; elapsed++) {
    const label = date.toISOString().slice(0, 10)
    if (remaining === 0 && isWorkingDay(calendar, label)) return label
    date.setUTCDate(date.getUTCDate() + direction)
    if (isWorkingDay(calendar, date.toISOString().slice(0, 10)) && remaining > 0) remaining--
  }
  return null
}

/** Inclusive saved date range. Invalid dates/calendars return null; reversed
 * ranges contain no working days. Same bounded span as the schedule engine. */
export function countWorkingDays(calendar: FactoryCalendar, from: string, to: string): number | null {
  const date = parseDateLabel(from)
  const end = parseDateLabel(to)
  if (!date || !end || !calendarIsValid(calendar)) return null
  if (date > end) return 0
  if ((end.getTime() - date.getTime()) / 86400000 >= 36600) return null
  let count = 0
  while (date <= end) {
    if (isWorkingDay(calendar, date.toISOString().slice(0, 10))) count++
    date.setUTCDate(date.getUTCDate() + 1)
  }
  return count
}

/** Count the union of saved intervals without counting overlaps or gaps. */
export function countWorkingDaysInRanges(calendar: FactoryCalendar, ranges: readonly { from: string; to: string }[]): number | null {
  const sorted = [...ranges].sort((a, b) => a.from.localeCompare(b.from))
  const merged: { from: string; to: string }[] = []
  for (const range of sorted) {
    if (countWorkingDays(calendar, range.from, range.to) === null) return null
    if (range.from > range.to) continue
    const previous = merged[merged.length - 1]
    if (previous && range.from <= previous.to) previous.to = previous.to > range.to ? previous.to : range.to
    else merged.push({ ...range })
  }
  return merged.reduce((total, range) => total + (countWorkingDays(calendar, range.from, range.to) ?? 0), 0)
}

/** Calendar dates use UTC only for arithmetic; returned labels represent factory dates. */
export function calculateProductionSchedule(
  startDate: string,
  allocatedMeters: number | string | null | undefined,
  estimatedDailyOutput: number | string | null | undefined,
  calendar: FactoryCalendar,
): ProductionScheduleEstimate | null {
  const requiredWorkingDays = calculateProductionDays(allocatedMeters, estimatedDailyOutput)
  const date = parseDateLabel(startDate)
  if (requiredWorkingDays === null || !date || !calendarIsValid(calendar)) return null

  let workingDays = 0
  let effectiveStartDate: string | null = null
  // Bound impossible calendars and excessive spans rather than looping indefinitely.
  for (let elapsedDays = 0; elapsedDays < 36600; elapsedDays++) {
    const label = date.toISOString().slice(0, 10)
    if (isWorkingDay(calendar, label)) {
      effectiveStartDate ??= label
      workingDays++
      if (workingDays === requiredWorkingDays) {
        return { requiredWorkingDays, effectiveStartDate, computedEndDate: label }
      }
    }
    date.setUTCDate(date.getUTCDate() + 1)
  }
  return null
}
