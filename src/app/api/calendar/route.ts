// src/app/api/calendar/route.ts
// GET    /api/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD  — nạp lịch nghỉ cho một khoảng
// PUT    /api/calendar                                 — đánh dấu một ngày nghỉ/lễ/làm bù
// DELETE /api/calendar?date=YYYY-MM-DD                 — gỡ ngoại lệ, trả ngày về quy tắc tuần/tháng
//
// LƯU Ý: app chưa có auth (CLAUDE.md mục 10). Endpoint này mở như mọi endpoint
// ghi khác hiện có. Khi có auth phải bọc lại quyền ở đây trước tiên.
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { loadFactoryCalendar } from '@/lib/schedule/factoryCalendar'
import {
  calendarRangeSchema,
  deleteCalendarDaySchema,
  isWorkingFromKind,
  upsertCalendarDaySchema,
} from '@/lib/validations/calendar'

export async function GET(req: NextRequest) {
  const parsed = calendarRangeSchema.safeParse({
    from: req.nextUrl.searchParams.get('from') ?? '',
    to: req.nextUrl.searchParams.get('to') ?? '',
  })
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? 'Tham số không hợp lệ' },
      { status: 400 },
    )
  }

  const { from, to } = parsed.data
  const [calendar, exceptions] = await Promise.all([
    loadFactoryCalendar(prisma, from, to),
    prisma.factoryCalendarException.findMany({
      where: { date: { gte: new Date(from + 'T00:00:00.000Z'), lte: new Date(to + 'T00:00:00.000Z') } },
      select: { date: true, kind: true, note: true, isWorking: true },
      orderBy: { date: 'asc' },
    }),
  ])

  // calendar nuôi phép tính; exceptions nuôi phần hiển thị (lễ tô đậm, tooltip ghi chú).
  return NextResponse.json({
    success: true,
    calendar,
    exceptions: exceptions.map(e => ({
      date: e.date.toISOString().slice(0, 10),
      kind: e.kind,
      note: e.note,
      isWorking: e.isWorking,
    })),
  })
}

export async function PUT(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Body không phải JSON hợp lệ' }, { status: 400 })
  }

  const parsed = upsertCalendarDaySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ' },
      { status: 400 },
    )
  }

  const { date, kind, note } = parsed.data
  const isWorking = isWorkingFromKind(kind)
  const day = new Date(date + 'T00:00:00.000Z')

  const saved = await prisma.factoryCalendarException.upsert({
    where: { date: day },
    create: { date: day, kind, isWorking, note: note ?? null },
    update: { kind, isWorking, note: note ?? null },
    select: { date: true, kind: true, isWorking: true, note: true },
  })

  return NextResponse.json({
    success: true,
    day: { ...saved, date: saved.date.toISOString().slice(0, 10) },
  })
}

export async function DELETE(req: NextRequest) {
  const parsed = deleteCalendarDaySchema.safeParse({ date: req.nextUrl.searchParams.get('date') ?? '' })
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? 'Tham số không hợp lệ' },
      { status: 400 },
    )
  }

  const day = new Date(parsed.data.date + 'T00:00:00.000Z')
  const removed = await prisma.factoryCalendarException.deleteMany({ where: { date: day } })
  return NextResponse.json({ success: true, removed: removed.count })
}
