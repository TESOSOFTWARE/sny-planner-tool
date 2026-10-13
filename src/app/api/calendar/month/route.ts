import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { calendarMonthSchema, yearMonthSchema } from '@/lib/validations/calendar'

const monthSelect = { yearMonth: true, nonWorkingWeekdays: true, note: true } as const

export async function GET(req: NextRequest) {
  const parsed = yearMonthSchema.safeParse(req.nextUrl.searchParams.get('yearMonth'))
  if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message }, { status: 400 })
  try {
    const month = await prisma.factoryCalendarMonth.findUnique({ where: { yearMonth: parsed.data }, select: monthSelect })
    return NextResponse.json({ success: true, month })
  } catch {
    return NextResponse.json({ success: false, error: 'Không tải được cấu hình tháng' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ success: false, error: 'Body không phải JSON hợp lệ' }, { status: 400 })
  }
  const parsed = calendarMonthSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message }, { status: 400 })
  const { yearMonth, nonWorkingWeekdays, note } = parsed.data
  try {
    const month = await prisma.factoryCalendarMonth.upsert({
      where: { yearMonth },
      create: { yearMonth, nonWorkingWeekdays, note: note ?? null },
      update: { nonWorkingWeekdays, ...(note === undefined ? {} : { note }) },
      select: monthSelect,
    })
    return NextResponse.json({ success: true, month })
  } catch {
    return NextResponse.json({ success: false, error: 'Không lưu được cấu hình tháng' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const parsed = yearMonthSchema.safeParse(req.nextUrl.searchParams.get('yearMonth'))
  if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message }, { status: 400 })
  try {
    const removed = await prisma.factoryCalendarMonth.deleteMany({ where: { yearMonth: parsed.data } })
    return NextResponse.json({ success: true, removed: removed.count })
  } catch {
    return NextResponse.json({ success: false, error: 'Không gỡ được cấu hình tháng' }, { status: 500 })
  }
}
