// Câu chữ cho khung tính ngày dùng chung (0810-25): công thức và so lịch đang lưu với công thức.

const fmt = (value: number, digits = 2) => value.toLocaleString('vi-VN', { maximumFractionDigits: digits })
const displayDate = (iso: string) => iso.split('-').reverse().join('/')

// "5.000 m ÷ 800 m/ngày = 6,25 → cần 7 ngày làm việc". null khi chưa đủ số liệu.
export function formulaText(meters: string, output: string, days: number | null): string | null {
  if (days === null) return null
  const ratio = Number(meters) / Number(output)
  return `${fmt(Number(meters), 2)} m ÷ ${fmt(Number(output), 2)} m/ngày = ${fmt(ratio, 2)} → cần ${days} ngày làm việc`
}

// Số ngày lệch: dương = lịch đang lưu thiếu ngày, âm = thừa. null nếu thiếu dữ liệu.
export function scheduleGap(requiredDays: number | null, savedWorkingDays: number | null): number | null {
  if (requiredDays === null || savedWorkingDays === null) return null
  return requiredDays - savedWorkingDays
}

// Dòng vàng khi lịch lệch công thức. Trả null khi khớp.
export function gapText(gap: number | null, computedEnd: string): string | null {
  if (gap === null || gap === 0) return null
  const end = displayDate(computedEnd)
  return gap > 0
    ? `Thiếu ${gap} ngày — hệ thống tính kết thúc ${end}`
    : `Thừa ${-gap} ngày so với công thức — hệ thống tính kết thúc ${end}`
}
