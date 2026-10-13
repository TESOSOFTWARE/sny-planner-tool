export interface CalendarHoliday { date: string; name: string }

/** Gợi ý ngày lễ dương lịch; người lập lịch quyết định có nghỉ hay không. */
export function vnFixedHolidays(year: number): CalendarHoliday[] {
  if (!Number.isInteger(year) || year < 1000 || year > 9999) throw new Error('Năm không hợp lệ')
  return [
    { date: `${year}-01-01`, name: 'Tết Dương lịch' },
    { date: `${year}-04-30`, name: 'Ngày Giải phóng miền Nam' },
    { date: `${year}-05-01`, name: 'Ngày Quốc tế Lao động' },
    { date: `${year}-09-02`, name: 'Quốc khánh' },
  ]
}

/** Liệt kê kỳ nghỉ do người dùng nhập, tối đa bằng giới hạn API batch. */
export function holidayPeriod(from: string, to: string, name: string): CalendarHoliday[] {
  const valid = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s + 'T00:00:00Z')) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s
  if (!valid(from) || !valid(to)) throw new Error('Ngày bắt đầu hoặc kết thúc không hợp lệ')
  if (from > to) throw new Error('Đến ngày phải bằng hoặc sau từ ngày')
  if (!name.trim()) throw new Error('Vui lòng nhập tên kỳ nghỉ')
  const count = (Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86400000 + 1
  if (count > 366) throw new Error('Một kỳ nghỉ tối đa 366 ngày')
  return Array.from({ length: count }, (_, i) => ({ date: new Date(Date.parse(from + 'T00:00:00Z') + i * 86400000).toISOString().slice(0, 10), name: name.trim() }))
}
