// Quyết định chế độ ngày khi sửa công thức (0810-24). Tách khỏi hook để test không cần DOM.

export type DateMode = 'COMPUTED' | 'MANUAL' | 'PRESERVED'

// Đổi số mét / năng suất / ngày bắt đầu → tự tính lại. Chỉ bật khi opt-in (màn Chuyển máy).
// Đang sửa tay ngày kết thúc mà đổi công thức → tính lại và báo recalculatedFromManual.
export function modeOnFormulaChange(prev: DateMode, optIn: boolean): { mode: DateMode; recalculatedFromManual: boolean } {
  if (!optIn) return { mode: prev, recalculatedFromManual: false }
  return { mode: 'COMPUTED', recalculatedFromManual: prev === 'MANUAL' }
}

const WEEKDAY = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']

// Nhãn thứ của ngày dạng YYYY-MM-DD (dùng cho dòng "CN 11/10 nghỉ → dời 12/10").
export function weekdayLabel(isoDay: string): string {
  return WEEKDAY[new Date(isoDay + 'T00:00:00Z').getUTCDay()]
}
