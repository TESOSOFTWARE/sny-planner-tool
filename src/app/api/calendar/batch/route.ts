import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { calendarBatchSchema, isWorkingFromKind } from '@/lib/validations/calendar'

export async function POST(req: NextRequest) {
  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ success: false, error: 'Body không phải JSON hợp lệ' }, { status: 400 })
  }
  const parsed = calendarBatchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message }, { status: 400 })
  try {
    const result = await prisma.$transaction(async tx => {
      const existing = await tx.factoryCalendarException.findMany({
        where: { date: { in: parsed.data.days.map(day => new Date(day.date + 'T00:00:00.000Z')) } },
        select: { date: true, kind: true },
      })
      const existingDates = new Map(existing.map(day => [day.date.toISOString().slice(0, 10), day.kind]))
      const skipped = parsed.data.days.filter(day => existingDates.has(day.date))
        .map(day => ({ date: day.date, existingKind: existingDates.get(day.date)! }))
      const data = parsed.data.days.filter(day => !existingDates.has(day.date)).map(day => ({
        date: new Date(day.date + 'T00:00:00.000Z'),
        kind: day.kind,
        isWorking: isWorkingFromKind(day.kind),
        note: day.note ?? null,
      }))
      // Unique date + skipDuplicates keeps a concurrent manual exception intact.
      const added = data.length ? (await tx.factoryCalendarException.createMany({ data, skipDuplicates: true })).count : 0
      return { added, skipped }
    })
    return NextResponse.json({ success: true, ...result })
  } catch {
    return NextResponse.json({ success: false, error: 'Không lưu được danh sách ngày nghỉ; không có thay đổi được lưu' }, { status: 500 })
  }
}
