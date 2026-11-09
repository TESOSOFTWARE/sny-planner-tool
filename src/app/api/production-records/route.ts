import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { authError } from '@/lib/auth/session'

const input = z.object({ stage: z.enum(['extruder', 'warping', 'knitting', 'rolling']), q: z.string().trim().max(150).default(''), state: z.enum(['all', 'linked', 'unlinked']).default('all'), page: z.coerce.number().int().min(1).max(100000).default(1), limit: z.coerce.number().int().min(1).max(200).default(100) })

/** [MoM 30/10 §4] Preserve source PI and show unresolved output-to-item links. */
export async function GET(request: NextRequest) {
  const accessError = await authError('GET', request)
  if (accessError) return accessError
  const parsed = input.safeParse(Object.fromEntries(request.nextUrl.searchParams))
  if (!parsed.success) return NextResponse.json({ success: false, error: 'Bộ lọc không hợp lệ.' }, { status: 422 })
  const { stage, q, state, page, limit } = parsed.data
  const where = { ...(q ? { orderRef: { contains: q, mode: 'insensitive' as const } } : {}), ...(state === 'linked' ? { orderId: { not: null } } : state === 'unlinked' ? { orderId: null } : {}) }
  const paging = { where, skip: (page - 1) * limit, take: limit }
  try {
    if (stage === 'rolling') {
      const [rows, total] = await Promise.all([
        prisma.rollingDailyMetric.findMany({ ...paging, orderBy: [{ date: 'desc' }, { id: 'asc' }], select: { id: true, date: true, orderRef: true, orderId: true, color: true, metricLabel: true, metricValue: true } }),
        prisma.rollingDailyMetric.count({ where }),
      ])
      return NextResponse.json({ success: true, total, records: rows.map(r => ({ id: r.id, date: r.date.toISOString(), orderRef: r.orderRef, orderId: r.orderId, color: r.color, machine: null, shift: null, kilograms: null, meters: null, metric: r.metricLabel, value: r.metricValue?.toString() ?? null })) })
    }
    if (stage === 'knitting') {
      const [rows, total] = await Promise.all([
        prisma.knittingDailyDetail.findMany({ ...paging, orderBy: [{ reportDate: 'desc' }, { id: 'asc' }], select: { id: true, reportDate: true, orderRef: true, orderId: true, color: true, machineId: true, shift: true, weightKgs: true, lengthM: true } }),
        prisma.knittingDailyDetail.count({ where }),
      ])
      return NextResponse.json({ success: true, total, records: rows.map(r => ({ id: r.id, date: r.reportDate.toISOString(), orderRef: r.orderRef, orderId: r.orderId, color: r.color, machine: r.machineId, shift: r.shift, kilograms: r.weightKgs.toString(), meters: r.lengthM?.toString() ?? null, metric: null, value: null })) })
    }
    const select = { id: true, reportDate: true, orderRef: true, orderId: true, color: true, machineId: true, shift: true, weightKgs: true } as const
    const [rows, total] = stage === 'extruder' ? await Promise.all([
      prisma.extruderDailyOutput.findMany({ ...paging, select, orderBy: [{ reportDate: 'desc' }, { id: 'asc' }] }), prisma.extruderDailyOutput.count({ where }),
    ]) : await Promise.all([
      prisma.warpingDailyOutput.findMany({ ...paging, select, orderBy: [{ reportDate: 'desc' }, { id: 'asc' }] }), prisma.warpingDailyOutput.count({ where }),
    ])
    return NextResponse.json({ success: true, total, records: rows.map(r => ({ id: r.id, date: r.reportDate.toISOString(), orderRef: r.orderRef, orderId: r.orderId, color: r.color, machine: r.machineId, shift: r.shift, kilograms: r.weightKgs.toString(), meters: null, metric: null, value: null })) })
  } catch {
    return NextResponse.json({ success: false, error: 'Không tải được sản lượng. Vui lòng thử lại.' }, { status: 500 })
  }
}
