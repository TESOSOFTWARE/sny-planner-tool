// P01 — Nạp lịch nghỉ nhà máy từ DB thành kiểu mà calculateProductionSchedule nhận.
// Dùng chung cho cả server (tính ngày kết thúc) lẫn grid Schedule (tô màu), để
// màu trên lưới và ngày hệ thống tính không thể lệch nhau.
import type { FactoryCalendar } from './productionDuration'

/** Lịch tuần khi một tháng chưa được cấu hình: chỉ nghỉ Chủ nhật. */
export const DEFAULT_NON_WORKING_WEEKDAYS: readonly number[] = [0]

export interface FactoryCalendarReader {
  factoryCalendarMonth: {
    findMany(args: { where: { yearMonth: { in: string[] } } }): Promise<
      { yearMonth: string; nonWorkingWeekdays: number[] }[]
    >
  }
  factoryCalendarException: {
    findMany(args: { where: { date: { gte: Date; lte: Date } } }): Promise<
      { date: Date; isWorking: boolean }[]
    >
  }
}

const DATE_LABEL = /^\d{4}-\d{2}-\d{2}$/

function parseLabel(label: string): Date | null {
  if (!DATE_LABEL.test(label)) return null
  const date = new Date(label + 'T00:00:00.000Z')
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === label ? date : null
}

/** Các khóa 'YYYY-MM' mà khoảng [from, to] đi qua, kể cả khi vắt qua năm. */
export function monthKeysBetween(from: string, to: string): string[] {
  const start = parseLabel(from)
  const end = parseLabel(to)
  if (!start || !end || start > end) return []

  const keys: string[] = []
  let year = start.getUTCFullYear()
  let month = start.getUTCMonth()
  const lastYear = end.getUTCFullYear()
  const lastMonth = end.getUTCMonth()

  while (year < lastYear || (year === lastYear && month <= lastMonth)) {
    keys.push(`${year}-${String(month + 1).padStart(2, '0')}`)
    if (++month > 11) { month = 0; year++ }
  }
  return keys
}

/**
 * Nạp lịch nghỉ cho khoảng [from, to] (nhãn 'YYYY-MM-DD', UTC).
 *
 * LƯU Ý: tháng nằm NGOÀI khoảng truyền vào sẽ dùng DEFAULT_NON_WORKING_WEEKDAYS.
 * Khi tính ngày kết thúc, phải truyền `to` đủ xa để phủ hết thời gian sản xuất
 * dự kiến, nếu không các tháng phía sau sẽ âm thầm rơi về lịch mặc định.
 */
export async function loadFactoryCalendar(
  db: FactoryCalendarReader,
  from: string,
  to: string,
): Promise<FactoryCalendar> {
  const start = parseLabel(from)
  const end = parseLabel(to)
  if (!start || !end || start > end) {
    return { nonWorkingWeekdays: DEFAULT_NON_WORKING_WEEKDAYS }
  }

  const [months, exceptions] = await Promise.all([
    db.factoryCalendarMonth.findMany({ where: { yearMonth: { in: monthKeysBetween(from, to) } } }),
    db.factoryCalendarException.findMany({ where: { date: { gte: start, lte: end } } }),
  ])

  const monthlyNonWorkingWeekdaysOverride: Record<string, readonly number[]> = {}
  for (const row of months) {
    // Khử trùng + sắp xếp số để kết quả ổn định, không phụ thuộc thứ tự lưu.
    monthlyNonWorkingWeekdaysOverride[row.yearMonth] = row.nonWorkingWeekdays
      .filter((day, index, all) => all.indexOf(day) === index)
      .sort((a, b) => a - b)
  }

  const workingDateOverrides: Record<string, boolean> = {}
  for (const row of exceptions) {
    workingDateOverrides[row.date.toISOString().slice(0, 10)] = row.isWorking
  }

  return {
    nonWorkingWeekdays: DEFAULT_NON_WORKING_WEEKDAYS,
    monthlyNonWorkingWeekdaysOverride,
    workingDateOverrides,
  }
}
