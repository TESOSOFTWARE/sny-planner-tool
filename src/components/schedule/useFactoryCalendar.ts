'use client'

import { useCallback, useEffect, useState } from 'react'
import { isWorkingDay, type FactoryCalendar } from '@/lib/schedule/productionDuration'

export type CalendarExceptionKind = 'HOLIDAY' | 'CLOSURE' | 'MAKEUP'

export interface CalendarException {
  date: string
  kind: CalendarExceptionKind
  note: string | null
  isWorking: boolean
}

/** Nhãn 'YYYY-MM-DD' dựng thẳng từ số, không qua Date -> không lệch múi giờ. */
export function dayLabel(year: number, month0: number, day: number): string {
  return `${year}-${String(month0 + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

const EMPTY: FactoryCalendar = { nonWorkingWeekdays: [0] }

/**
 * Nạp lịch nghỉ của tháng đang xem và cung cấp thao tác đánh dấu ngày.
 * Dùng chung `isWorkingDay` với engine tính ngày, nên màu trên lưới không thể
 * lệch với ngày hệ thống tính.
 */
export function useFactoryCalendar(year: number, month0: number) {
  const [calendar, setCalendar] = useState<FactoryCalendar>(EMPTY)
  const [exceptions, setExceptions] = useState<Record<string, CalendarException>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [monthNote, setMonthNote] = useState('')

  const from = dayLabel(year, month0, 1)
  const to = dayLabel(year, month0, new Date(year, month0 + 1, 0).getDate())

  const reload = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/calendar?from=${from}&to=${to}`)
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error ?? 'Không tải được lịch nghỉ')
      setCalendar(data.calendar as FactoryCalendar)
      const map: Record<string, CalendarException> = {}
      for (const e of data.exceptions as CalendarException[]) map[e.date] = e
      setExceptions(map)
      // Metadata ghi chú không quyết định lịch làm việc. Lỗi đọc metadata chỉ
      // khoá phần sửa tháng; không xoá lịch/ngoại lệ vừa tải thành công.
      try {
        const monthRes = await fetch(`/api/calendar/month?yearMonth=${from.slice(0, 7)}`)
        const monthData = await monthRes.json()
        if (!monthRes.ok || !monthData.success) throw new Error(monthData.error ?? 'Không tải được cấu hình tháng')
        setMonthNote(monthData.month?.note ?? '')
      } catch (err) {
        setMonthNote('')
        setError(err instanceof Error ? err.message : 'Không tải được cấu hình tháng')
      }
    } catch (err) {
      // Lỗi tải lịch thì giữ mặc định (chỉ nghỉ CN) và báo rõ, không chặn cả trang.
      setCalendar(EMPTY)
      setExceptions({})
      setMonthNote('')
      setError(err instanceof Error ? err.message : 'Không tải được lịch nghỉ')
    } finally {
      setIsLoading(false)
    }
  }, [from, to])

  useEffect(() => { void reload() }, [reload])

  const isRestDay = useCallback(
    (day: number) => isWorkingDay(calendar, dayLabel(year, month0, day)) === false,
    [calendar, year, month0],
  )

  const exceptionFor = useCallback(
    (day: number): CalendarException | undefined => exceptions[dayLabel(year, month0, day)],
    [exceptions, year, month0],
  )

  /** kind = null nghĩa là gỡ ngoại lệ, trả ngày về quy tắc tuần/tháng. */
  const setDayKind = useCallback(
    async (day: number, kind: CalendarExceptionKind | null, note?: string) => {
      const date = dayLabel(year, month0, day)
      const res =
        kind === null
          ? await fetch(`/api/calendar?date=${date}`, { method: 'DELETE' })
          : await fetch('/api/calendar', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ date, kind, note: note ?? null }),
            })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) throw new Error(data.error ?? 'Không lưu được ngày nghỉ')
      await reload()
    },
    [year, month0, reload],
  )

  const setMonthRule = useCallback(async (weekdays: number[] | null, note?: string) => {
    const yearMonth = from.slice(0, 7)
    const res = weekdays === null
      ? await fetch(`/api/calendar/month?yearMonth=${yearMonth}`, { method: 'DELETE' })
      : await fetch('/api/calendar/month', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ yearMonth, nonWorkingWeekdays: weekdays, note: note?.trim() || null }) })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.success) throw new Error(data.error ?? 'Không lưu được lịch nghỉ tháng')
    await reload()
  }, [from, reload])

  return { calendar, exceptions, monthNote, setMonthRule, isRestDay, exceptionFor, setDayKind, reload, isLoading, error }
}
