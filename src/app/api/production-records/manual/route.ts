import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authError } from '@/lib/auth/session'
import { manualProductionEntryInput, utcDay } from '@/lib/validations/productionEntry'

const stages = ['extruder', 'warping', 'knitting', 'rolling', 'packing'] as const

export async function GET(request: NextRequest) {
  const denied = await authError('GET', request, 'output.read')
  if (denied) return denied
  const stage = request.nextUrl.searchParams.get('stage')
  const date = request.nextUrl.searchParams.get('date')
  if (!stage || !stages.includes(stage as typeof stages[number]) || !date || !utcDay(date)) {
    return NextResponse.json({ success: false, error: 'Công đoạn hoặc ngày không hợp lệ.' }, { status: 422 })
  }
  try {
    const start = utcDay(date)!
    const entries = await prisma.manualProductionEntry.findMany({
      where: { stage, reportDate: start }, orderBy: [{ machineId: 'asc' }, { createdAt: 'asc' }], take: 500,
      select: { id: true, stage: true, reportDate: true, machineId: true, shift: true, orderRef: true, orderId: true, color: true, metricLabel: true, metricValue: true, unit: true, note: true, createdAt: true, updatedAt: true },
    })
    return NextResponse.json({ success: true, entries: entries.map(e => ({ ...e, reportDate: e.reportDate.toISOString(), metricValue: e.metricValue.toString() })) })
  } catch {
    return NextResponse.json({ success: false, error: 'Không tải được số liệu nhập trực tiếp.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const denied = await authError('POST', request, 'output.actual.enter')
  if (denied) return denied
  const body = await request.json().catch(() => null)
  const parsed = manualProductionEntryInput.safeParse(body)
  if (!parsed.success) return NextResponse.json({ success: false, error: 'Thông tin nhập chưa hợp lệ.', issues: parsed.error.issues }, { status: 422 })
  const input = parsed.data
  const reportDate = utcDay(input.date)
  if (!reportDate) return NextResponse.json({ success: false, error: 'Ngày không hợp lệ.' }, { status: 422 })
  try {
    if (input.orderId) {
      const order = await prisma.productionOrder.findUnique({ where: { id: input.orderId }, select: { id: true, piNumber: true } })
      if (!order) return NextResponse.json({ success: false, error: 'Không tìm thấy item được chọn.' }, { status: 422 })
      if (input.orderRef && order.piNumber.trim().toUpperCase() !== input.orderRef.trim().toUpperCase()) return NextResponse.json({ success: false, error: 'PI nguồn không khớp item được chọn; hãy giữ dòng ở trạng thái chưa liên kết.' }, { status: 409 })
    }
    const entry = await prisma.manualProductionEntry.create({ data: {
      stage: input.stage, reportDate, machineId: input.machineId || null, shift: input.shift ?? null,
      orderRef: input.orderRef || null, orderId: input.orderId || null, color: input.color || null,
      metricLabel: input.metricLabel, metricValue: input.value, unit: input.unit, note: input.note || null,
    } })
    return NextResponse.json({ success: true, id: entry.id }, { status: 201 })
  } catch {
    return NextResponse.json({ success: false, error: 'Không lưu được số liệu. Vui lòng thử lại.' }, { status: 500 })
  }
}
