import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { authError } from '@/lib/auth/session'

const querySchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const denied = await authError('GET', request, 'reports.read')
  if (denied) return denied
  const parsed = querySchema.safeParse(request.nextUrl.searchParams.get('month'))
  if (!parsed.success) return NextResponse.json({ success: false, error: 'Kỳ báo cáo phải có dạng YYYY-MM.' }, { status: 422 })
  const [year, month] = parsed.data.split('-').map(Number)
  const start = new Date(Date.UTC(year, month - 1, 1)), end = new Date(Date.UTC(year, month, 1))
  const range = { gte: start, lt: end }
  try {
    const [extruder, warping, knitting, rolling, packing, manual] = await Promise.all([
      prisma.extruderDailyOutput.aggregate({ where: { reportDate: range }, _count: { _all: true }, _sum: { weightKgs: true } }),
      prisma.warpingDailyOutput.aggregate({ where: { reportDate: range }, _count: { _all: true }, _sum: { weightKgs: true } }),
      prisma.knittingDailyDetail.aggregate({ where: { reportDate: range }, _count: { _all: true }, _sum: { weightKgs: true, lengthM: true } }),
      prisma.rollingDailyMetric.groupBy({ by: ['metricLabel'], where: { date: range }, _count: { _all: true }, _sum: { metricValue: true }, orderBy: { metricLabel: 'asc' } }),
      prisma.packingDailyOutput.findMany({ where: { date: range }, select: { totalMDay: true, totalMNight: true, weightDay: true, weightNight: true } }),
      prisma.manualProductionEntry.groupBy({ by: ['stage', 'unit'], where: { reportDate: range }, _count: { _all: true }, _sum: { metricValue: true }, orderBy: [{ stage: 'asc' }, { unit: 'asc' }] }),
    ])
    const sum = (values: (Prisma.Decimal | null)[]) => values.reduce<Prisma.Decimal>((total, value) => total.plus(value ?? 0), new Prisma.Decimal(0)).toFixed(2)
    return NextResponse.json({ success: true, month: parsed.data, imported: {
      extruder: { rows: extruder._count._all, kilograms: extruder._sum.weightKgs?.toString() ?? '0' },
      warping: { rows: warping._count._all, kilograms: warping._sum.weightKgs?.toString() ?? '0' },
      knitting: { rows: knitting._count._all, kilograms: knitting._sum.weightKgs?.toString() ?? '0', meters: knitting._sum.lengthM?.toString() ?? '0' },
      rolling: rolling.map(r => ({ metric: r.metricLabel, rows: r._count._all, value: r._sum.metricValue?.toString() ?? '0' })),
      packing: { days: packing.length, kilograms: sum(packing.flatMap(r => [r.weightDay, r.weightNight])), meters: sum(packing.flatMap(r => [r.totalMDay, r.totalMNight])) },
    }, manual: manual.map(r => ({ stage: r.stage, unit: r.unit, rows: r._count._all, value: r._sum.metricValue?.toString() ?? '0' })) })
  } catch {
    return NextResponse.json({ success: false, error: 'Không tải được báo cáo. Kiểm tra schema local đã áp migration sản lượng chưa.' }, { status: 503 })
  }
}
