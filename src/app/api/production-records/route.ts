import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { authError } from '@/lib/auth/session'

const input = z.object({ stage: z.enum(['extruder', 'warping', 'knitting', 'rolling', 'packing', 'sewing']), q: z.string().trim().max(150).default(''), state: z.enum(['all', 'linked', 'unlinked']).default('all'), page: z.coerce.number().int().min(1).max(100000).default(1), limit: z.coerce.number().int().min(1).max(200).default(100) })
const textValue = (value: unknown) => value == null ? null : String(value)

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
      const [rows, total, metrics] = await Promise.all([
        prisma.rollingDailyMetric.findMany({ ...paging, orderBy: [{ date: 'desc' }, { id: 'asc' }], select: { id: true, date: true, orderRef: true, orderId: true, color: true, widthM: true, lengthM: true, weightKgsOrder: true, metricLabel: true, metricValue: true, dataSource: true } }),
        prisma.rollingDailyMetric.count({ where }),
        q ? prisma.rollingDailyMetric.groupBy({ by: ['metricLabel'], where, _sum: { metricValue: true } }) : Promise.resolve([]),
      ])
      const summary = metrics.length ? { metrics: metrics.filter(row => row._sum.metricValue != null).map(row => ({ label: row.metricLabel, value: textValue(row._sum.metricValue) })) } : undefined
      return NextResponse.json({ success: true, total, ...(summary ? { summary } : {}), records: rows.map(r => ({ id: r.id, date: r.date.toISOString(), orderRef: r.orderRef, orderId: r.orderId, color: r.color, widthM: r.widthM?.toString() ?? null, lengthM: r.lengthM?.toString() ?? null, weightKgsOrder: r.weightKgsOrder?.toString() ?? null, metric: r.metricLabel, value: r.metricValue?.toString() ?? null, unit: null, source: r.dataSource })) })
    }
    if (stage === 'knitting') {
      const [rows, total, aggregate] = await Promise.all([
        prisma.knittingDailyDetail.findMany({ ...paging, orderBy: [{ reportDate: 'desc' }, { id: 'asc' }], select: { id: true, reportDate: true, orderRef: true, orderId: true, color: true, machineId: true, shift: true, width: true, weightSpec: true, lengthM: true, tapeRoll: true, mValue: true, avgPerRoll: true, quantity: true, weightKgs: true, machineNote: true, meshType: true, machineSizeM: true, cmPerMin: true, meterPerDay: true, operatingGrade: true, totalPct: true, dataSource: true } }),
        prisma.knittingDailyDetail.count({ where }),
        q ? prisma.knittingDailyDetail.aggregate({ where, _sum: { mValue: true, quantity: true, weightKgs: true } }) : Promise.resolve(null),
      ])
      const summary = aggregate ? { metrics: [
        { label: 'M', value: textValue(aggregate._sum.mValue), unit: 'm' },
        { label: 'QUANTITY', value: textValue(aggregate._sum.quantity) },
        { label: 'WEIGHT (kg)', value: textValue(aggregate._sum.weightKgs), unit: 'kg' },
      ].filter(metric => metric.value != null) } : undefined
      return NextResponse.json({ success: true, total, ...(summary ? { summary } : {}), records: rows.map(r => ({ id: r.id, date: r.reportDate.toISOString(), orderRef: r.orderRef, orderId: r.orderId, color: r.color, machine: r.machineId, shift: r.shift, width: r.width?.toString() ?? null, weightSpec: r.weightSpec?.toString() ?? null, lengthM: r.lengthM?.toString() ?? null, tapeRoll: r.tapeRoll?.toString() ?? null, mValue: r.mValue?.toString() ?? null, avgPerRoll: r.avgPerRoll?.toString() ?? null, quantity: r.quantity?.toString() ?? null, kilograms: r.weightKgs.toString(), machineNote: r.machineNote, meshType: r.meshType, machineSizeM: r.machineSizeM?.toString() ?? null, cmPerMin: r.cmPerMin?.toString() ?? null, meterPerDay: r.meterPerDay?.toString() ?? null, operatingGrade: r.operatingGrade, totalPct: r.totalPct?.toString() ?? null, source: r.dataSource })) })
    }
    if (stage === 'packing' || stage === 'sewing') {
      const manualWhere = { ...where, stage }
      const [rows, total, metrics] = await Promise.all([
        prisma.manualProductionEntry.findMany({ ...paging, where: manualWhere, orderBy: [{ reportDate: 'desc' }, { id: 'asc' }], select: { id: true, reportDate: true, orderRef: true, orderId: true, color: true, machineId: true, shift: true, metricLabel: true, metricValue: true, unit: true, note: true } }),
        prisma.manualProductionEntry.count({ where: manualWhere }),
        q ? prisma.manualProductionEntry.groupBy({ by: ['metricLabel', 'unit'], where: manualWhere, _sum: { metricValue: true } }) : Promise.resolve([]),
      ])
      const summary = metrics.length ? { metrics: metrics.filter(row => row._sum.metricValue != null).map(row => ({ label: row.metricLabel, value: textValue(row._sum.metricValue), unit: row.unit })) } : undefined
      return NextResponse.json({ success: true, total, ...(summary ? { summary } : {}), records: rows.map(r => ({ id: r.id, date: r.reportDate.toISOString(), orderRef: r.orderRef, orderId: r.orderId, color: r.color, machine: r.machineId, shift: r.shift, metric: r.metricLabel, value: r.metricValue.toString(), unit: r.unit, note: r.note, source: 'Nhập trực tiếp' })) })
    }
    if (stage === 'extruder') {
      const [rows, total, aggregate] = await Promise.all([
        prisma.extruderDailyOutput.findMany({ ...paging, orderBy: [{ reportDate: 'desc' }, { id: 'asc' }], select: { id: true, reportDate: true, orderRef: true, orderId: true, color: true, machineId: true, shift: true, denier: true, weightKgs: true, beamNote: true, dataSource: true } }),
        prisma.extruderDailyOutput.count({ where }),
        q ? prisma.extruderDailyOutput.aggregate({ where, _sum: { weightKgs: true } }) : Promise.resolve(null),
      ])
      const sum = aggregate?._sum.weightKgs
      const summary = sum == null ? undefined : { metrics: [{ label: 'WEIGHT', value: textValue(sum), unit: 'kg' }] }
      return NextResponse.json({ success: true, total, ...(summary ? { summary } : {}), records: rows.map(r => ({ id: r.id, date: r.reportDate.toISOString(), orderRef: r.orderRef, orderId: r.orderId, color: r.color, machine: r.machineId, shift: r.shift, denier: r.denier?.toString() ?? null, kilograms: r.weightKgs.toString(), beamNote: r.beamNote, source: r.dataSource })) })
    }
    const [rows, total, aggregate] = await Promise.all([
      prisma.warpingDailyOutput.findMany({ ...paging, orderBy: [{ reportDate: 'desc' }, { id: 'asc' }], select: { id: true, reportDate: true, orderRef: true, orderId: true, color: true, machineId: true, shift: true, weavingMachineRef: true, denier: true, strand: true, beamCount1: true, mPerEa: true, weigValue: true, beamCount2: true, quantity: true, weightKgs: true, dataSource: true } }),
      prisma.warpingDailyOutput.count({ where }),
      q ? prisma.warpingDailyOutput.aggregate({ where, _sum: { quantity: true, weightKgs: true } }) : Promise.resolve(null),
    ])
    const summary = aggregate ? { metrics: [
      { label: 'QUANTITY', value: textValue(aggregate._sum.quantity) },
      { label: 'WEIGHT', value: textValue(aggregate._sum.weightKgs), unit: 'kg' },
    ].filter(metric => metric.value != null) } : undefined
    return NextResponse.json({ success: true, total, ...(summary ? { summary } : {}), records: rows.map(r => ({ id: r.id, date: r.reportDate.toISOString(), orderRef: r.orderRef, orderId: r.orderId, color: r.color, machine: r.machineId, shift: r.shift, weavingMachineRef: r.weavingMachineRef, denier: r.denier?.toString() ?? null, strand: r.strand?.toString() ?? null, beamCount1: r.beamCount1?.toString() ?? null, mPerEa: r.mPerEa?.toString() ?? null, weigValue: r.weigValue?.toString() ?? null, beamCount2: r.beamCount2?.toString() ?? null, quantity: r.quantity?.toString() ?? null, kilograms: r.weightKgs.toString(), source: r.dataSource })) })
  } catch {
    return NextResponse.json({ success: false, error: 'Không tải được sản lượng. Vui lòng thử lại.' }, { status: 500 })
  }
}
