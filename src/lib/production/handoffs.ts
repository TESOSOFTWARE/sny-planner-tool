import { Prisma } from '@prisma/client'

export const productionStageOrder = ['extruder', 'warping', 'knitting', 'rolling', 'packing'] as const
export type ProductionStage = typeof productionStageOrder[number]
export type HandoffSourceStage = Exclude<ProductionStage, 'packing'>

const sourceMetricLabels: Record<HandoffSourceStage, string> = {
  extruder: 'WEIGHT',
  warping: 'QUANTITY',
  knitting: 'mValue',
  rolling: 'QUANTITY SMALL/BIG',
}

export function nextProductionStage(stage: string): ProductionStage | null {
  const index = productionStageOrder.indexOf(stage as ProductionStage)
  return index < 0 || index === productionStageOrder.length - 1 ? null : productionStageOrder[index + 1]
}

export function handoffUnit(stage: HandoffSourceStage, orderType: string): string {
  if (stage === 'extruder') return 'kg'
  if (stage === 'warping') return 'beam'
  if (stage === 'knitting') return 'm'
  if (orderType === 'rolls') return 'rolls'
  if (orderType === 'pieces') return 'pieces'
  return 'm'
}

export function handoffSourceMetricLabel(stage: HandoffSourceStage) {
  return sourceMetricLabels[stage]
}

export async function lockHandoffSource(tx: Prisma.TransactionClient, stage: HandoffSourceStage) {
  switch (stage) {
    case 'extruder':
      await tx.$executeRaw`LOCK TABLE "extruder_daily_output" IN SHARE MODE`
      break
    case 'warping':
      await tx.$executeRaw`LOCK TABLE "warping_daily_output" IN SHARE MODE`
      break
    case 'knitting':
      await tx.$executeRaw`LOCK TABLE "knitting_daily_detail" IN SHARE MODE`
      break
    case 'rolling':
      await tx.$executeRaw`LOCK TABLE "rolling_daily_metrics" IN SHARE MODE`
      break
  }
}

/** Returns null when this exact linked item has no non-null source metric. */
export async function availableHandoffQuantity(
  tx: Prisma.TransactionClient,
  orderId: string,
  stage: HandoffSourceStage,
): Promise<Prisma.Decimal | null> {
  if (stage === 'extruder') {
    const result = await tx.extruderDailyOutput.aggregate({
      where: { orderId },
      _sum: { weightKgs: true },
      _count: { _all: true },
    })
    return result._count._all ? result._sum.weightKgs : null
  }

  if (stage === 'warping') {
    const result = await tx.warpingDailyOutput.aggregate({
      where: { orderId },
      _sum: { quantity: true },
      _count: { quantity: true },
    })
    return result._count.quantity ? result._sum.quantity : null
  }

  if (stage === 'knitting') {
    const result = await tx.knittingDailyDetail.aggregate({
      where: { orderId },
      _sum: { mValue: true },
      _count: { mValue: true },
    })
    return result._count.mValue ? result._sum.mValue : null
  }

  const result = await tx.rollingDailyMetric.aggregate({
    where: { orderId, metricLabel: { in: ['QUANTITY SMALL', 'QUANTITY BIG'] } },
    _sum: { metricValue: true },
    _count: { metricValue: true },
  })
  return result._count.metricValue ? result._sum.metricValue : null
}

export function handoffDecimalString(value: Prisma.Decimal | null) {
  return value?.toFixed(2) ?? null
}

type ImportOutputRow = {
  orderId?: string | null
  weightKgs?: Prisma.Decimal | number | null
  quantity?: Prisma.Decimal | number | null
  mValue?: Prisma.Decimal | number | null
  metricLabel?: string
  metricValue?: Prisma.Decimal | number | null
}

export class HandoffImportConflict extends Error {
  constructor(readonly piNumber: string, readonly transferred: string, readonly available: string, readonly unit: string) {
    super(`Import làm actual của PI ${piNumber} thấp hơn lượng WIP đã bàn giao (${transferred} ${unit} đã bàn giao, còn ${available} ${unit} theo báo cáo mới).`)
    this.name = 'HandoffImportConflict'
  }
}

function outputAmount(stage: HandoffSourceStage, row: ImportOutputRow) {
  if (stage === 'extruder') return new Prisma.Decimal(row.weightKgs?.toString() ?? 0)
  if (stage === 'warping') return new Prisma.Decimal(row.quantity?.toString() ?? 0)
  if (stage === 'knitting') return new Prisma.Decimal(row.mValue?.toString() ?? 0)
  if (row.metricLabel !== 'QUANTITY SMALL' && row.metricLabel !== 'QUANTITY BIG') return new Prisma.Decimal(0)
  return new Prisma.Decimal(row.metricValue?.toString() ?? 0)
}

/** Reject report replacement that would leave recorded physical WIP above source actual. */
export async function assertHandoffsCoveredAfterImport(
  tx: Prisma.TransactionClient,
  stage: HandoffSourceStage,
  removedRows: ImportOutputRow[],
  replacementRows: ImportOutputRow[],
) {
  const orderIds = Array.from(new Set([...removedRows, ...replacementRows].map(row => row.orderId).filter((id): id is string => !!id)))
  if (!orderIds.length) return

  const [orders, activeTransfers] = await Promise.all([
    tx.productionOrder.findMany({ where: { id: { in: orderIds } }, select: { id: true, piNumber: true, orderType: true } }),
    tx.productionHandoff.groupBy({
      by: ['orderId', 'unit'],
      where: { orderId: { in: orderIds }, fromStage: stage, sourceMetricLabel: handoffSourceMetricLabel(stage), voidedAt: null },
      _sum: { quantity: true },
    }),
  ])

  const availableByOrder = new Map<string, Prisma.Decimal>()
  if (stage === 'extruder') {
    const rows = await tx.extruderDailyOutput.groupBy({ by: ['orderId'], where: { orderId: { in: orderIds } }, _sum: { weightKgs: true } })
    for (const row of rows) if (row.orderId) availableByOrder.set(row.orderId, row._sum.weightKgs ?? new Prisma.Decimal(0))
  } else if (stage === 'warping') {
    const rows = await tx.warpingDailyOutput.groupBy({ by: ['orderId'], where: { orderId: { in: orderIds } }, _sum: { quantity: true } })
    for (const row of rows) if (row.orderId) availableByOrder.set(row.orderId, row._sum.quantity ?? new Prisma.Decimal(0))
  } else if (stage === 'knitting') {
    const rows = await tx.knittingDailyDetail.groupBy({ by: ['orderId'], where: { orderId: { in: orderIds } }, _sum: { mValue: true } })
    for (const row of rows) if (row.orderId) availableByOrder.set(row.orderId, row._sum.mValue ?? new Prisma.Decimal(0))
  } else {
    const rows = await tx.rollingDailyMetric.groupBy({ by: ['orderId'], where: { orderId: { in: orderIds }, metricLabel: { in: ['QUANTITY SMALL', 'QUANTITY BIG'] } }, _sum: { metricValue: true } })
    for (const row of rows) if (row.orderId) availableByOrder.set(row.orderId, row._sum.metricValue ?? new Prisma.Decimal(0))
  }

  const orderById = new Map(orders.map(order => [order.id, order]))
  const transferredByOrderUnit = new Map(activeTransfers.map(row => [`${row.orderId}:${row.unit}`, row._sum.quantity ?? new Prisma.Decimal(0)]))

  for (const orderId of orderIds) {
    const order = orderById.get(orderId)
    if (!order) continue
    const unit = handoffUnit(stage, order.orderType)
    const removed = removedRows.filter(row => row.orderId === orderId).reduce((sum, row) => sum.plus(outputAmount(stage, row)), new Prisma.Decimal(0))
    const incoming = replacementRows.filter(row => row.orderId === orderId).reduce((sum, row) => sum.plus(outputAmount(stage, row)), new Prisma.Decimal(0))
    const current = availableByOrder.get(orderId) ?? new Prisma.Decimal(0)
    const nextAvailable = current.minus(removed).plus(incoming)
    const transferred = transferredByOrderUnit.get(`${orderId}:${unit}`) ?? new Prisma.Decimal(0)
    if (nextAvailable.lessThan(transferred)) {
      throw new HandoffImportConflict(order.piNumber, transferred.toFixed(2), nextAvailable.toFixed(2), unit)
    }
  }
}
