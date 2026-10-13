import { scheduleDay } from './schedule/importSafety'

export type OrderStatus = 'PENDING' | 'SCHEDULED' | 'RUNNING' | 'DONE'

export function calcOrderStatus(
  assignments: { startDate: string | Date; endDate: string | Date }[] | undefined,
  now: string | Date = new Date(),
): OrderStatus {
  if (!assignments || assignments.length === 0) return 'PENDING'

  const today = scheduleDay(now)

  const statuses = assignments.map(a => {
    const start = scheduleDay(a.startDate)
    const end = scheduleDay(a.endDate)
    if (end < today) return 'DONE'
    if (start <= today && today <= end) return 'RUNNING'
    if (start > today) return 'SCHEDULED'
    return 'PENDING'
  })

  if (statuses.includes('RUNNING')) return 'RUNNING'
  if (statuses.includes('SCHEDULED')) return 'SCHEDULED'
  if (statuses.every(s => s === 'DONE')) return 'DONE'
  return 'PENDING'
}

/** Lọc lựa chọn theo lịch đã lưu, dùng cùng trạng thái với badge đơn hàng. */
export function scheduleOrderChoices<T extends { assignments?: { startDate: string | Date; endDate: string | Date }[] }>(
  rows: readonly T[], includeFinished = false, now: string | Date = new Date(),
) {
  const orders = rows.map(row => ({ ...row, calculatedStatus: calcOrderStatus(row.assignments, now) }))
  const hiddenCount = includeFinished ? 0 : orders.filter(row => row.calculatedStatus === 'DONE').length
  return { orders: includeFinished ? orders : orders.filter(row => row.calculatedStatus !== 'DONE'), hiddenCount }
}

export const STATUS_CONFIG: Record<OrderStatus, { label: string; color: string; bg: string }> = {
  PENDING:   { label: 'Chưa lên lịch', color: '#6B7280', bg: '#F3F4F6' },
  SCHEDULED: { label: 'Đã lên lịch',   color: '#2563EB', bg: '#EFF6FF' },
  RUNNING:   { label: 'Đang sản xuất', color: '#16A34A', bg: '#F0FDF4' },
  DONE:      { label: 'Hoàn thành',    color: '#002444', bg: '#EBF0F7' },
}
