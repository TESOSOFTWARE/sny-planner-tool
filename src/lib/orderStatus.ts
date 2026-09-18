import { MachineAssignment } from '@prisma/client'

export type OrderStatus = 'PENDING' | 'SCHEDULED' | 'RUNNING' | 'DONE'

export function calcOrderStatus(
  assignments: { startDate: string | Date; endDate: string | Date }[] | undefined
): OrderStatus {
  if (!assignments || assignments.length === 0) return 'PENDING'

  // today = ngày hiện tại theo UTC+7
  const now = new Date()
  const todayUTC7 = new Date(now.getTime() + 7 * 60 * 60 * 1000)
  todayUTC7.setUTCHours(0, 0, 0, 0)

  const statuses = assignments.map(a => {
    const start = new Date(a.startDate)
    const end = new Date(a.endDate)
    if (end < todayUTC7) return 'DONE'
    if (start <= todayUTC7 && todayUTC7 <= end) return 'RUNNING'
    if (start > todayUTC7) return 'SCHEDULED'
    return 'PENDING'
  })

  if (statuses.includes('RUNNING')) return 'RUNNING'
  if (statuses.includes('SCHEDULED')) return 'SCHEDULED'
  if (statuses.every(s => s === 'DONE')) return 'DONE'
  return 'PENDING'
}

export const STATUS_CONFIG: Record<OrderStatus, { label: string; color: string; bg: string }> = {
  PENDING:   { label: 'Chưa lên lịch', color: '#6B7280', bg: '#F3F4F6' },
  SCHEDULED: { label: 'Đã lên lịch',   color: '#2563EB', bg: '#EFF6FF' },
  RUNNING:   { label: 'Đang sản xuất', color: '#16A34A', bg: '#F0FDF4' },
  DONE:      { label: 'Hoàn thành',    color: '#002444', bg: '#EBF0F7' },
}
