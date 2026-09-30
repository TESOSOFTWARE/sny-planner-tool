// src/lib/orders/importPersist.ts
// Pure mapper: ParsedOrder (Excel/import) -> ProductionOrder createMany input.
// Shared by /api/orders/import/confirm and /api/orders/bulk so V4.1 fields
// (packing, lamination, tolerance, colorVersion) are persisted
// identically on every import path. Same conventions as PI PUT route.

import type { Prisma } from '@prisma/client'
import type { ParsedOrder } from '@/types'
import { calculateOrderWeight } from '@/lib/calculations/orderWeight'
import { IMPORT_INSERT_CHUNK_SIZE } from '@/lib/validations/order'

type Row = ParsedOrder & Record<string, unknown>

// Minimal tx surface so the helper works with any $transaction client
// without importing transaction internals.
type CreateManyTx = {
  productionOrder: {
    createMany: (args: { data: Prisma.ProductionOrderCreateManyInput[] }) => Promise<{ count: number }>
  }
}

// P0-13: chunked insert inside the caller's transaction (atomicity kept:
// a failing chunk rolls back every chunk). Returns total inserted count.
export async function chunkedCreateManyOrders(
  tx: CreateManyTx,
  data: Prisma.ProductionOrderCreateManyInput[],
): Promise<number> {
  let total = 0
  for (let i = 0; i < data.length; i += IMPORT_INSERT_CHUNK_SIZE) {
    const chunk = data.slice(i, i + IMPORT_INSERT_CHUNK_SIZE)
    const res = await tx.productionOrder.createMany({ data: chunk })
    total += res.count
  }
  if (total !== data.length) {
    // Should be unreachable inside a transaction (a short write would have
    // thrown), but if counts ever diverge the caller reports summary.created
    // — log loudly instead of silently returning a partial total.
    console.warn(`[chunkedCreateManyOrders] count mismatch: wrote ${total}/${data.length}`)
  }
  return total
}

export function mapParsedRowToCreateInput(row: ParsedOrder, customerId: string | null): Prisma.ProductionOrderCreateManyInput {
  const r = row as Row
  const orderType = row.orderType ?? 'meters'
  const calculation = calculateOrderWeight({
    orderType,
    widthM: row.widthM,
    lengthM: row.lengthM,
    gsm: row.gsm,
    productionGsm: row.productionGsm ?? null,
    qty: row.qty ?? null,
    rollLength: row.rollLength ?? null,
    pieceLength: row.pieceLength ?? null,
    isLaminated: Boolean(r.isLaminated),
    rawFabricGsm: (r.rawFabricGsm as number | null) ?? null,
    coatingGsm: (r.coatingGsm as number | null) ?? null,
    finishedGsm: (r.finishedGsm as number | null) ?? null,
  })

  return {
    piNumber: row.piNumber.trim(),
    subLineIndex: row.subLineIndex,
    customer: row.customer.trim(),
    customerId,
    orderDate: new Date(`${row.orderDate}T00:00:00.000Z`),
    widthM: row.widthM,
    lengthM: calculation.totalMeters,
    gsm: row.gsm,
    productionGsm: row.productionGsm ?? null,
    color: row.color,
    // Single State of Truth: lifecycleStatus -> suy ra isDraft, isPlaceholder
    lifecycleStatus: (r.lifecycleStatus === 'APPROVED' || r.lifecycleStatus === 'PLACEHOLDER' || r.lifecycleStatus === 'DRAFT')
      ? (r.lifecycleStatus as string)
      : 'DRAFT',
    isDraft: r.lifecycleStatus !== 'APPROVED' && r.lifecycleStatus !== 'PLACEHOLDER',
    isPlaceholder: r.lifecycleStatus === 'PLACEHOLDER',
    qty: row.qty ?? null,
    uvPct: row.uvPct ?? null,
    frFlag: row.frFlag ?? false,
    frPct: row.frPct ?? null,
    description: row.description ?? null,
    remark: row.remark ?? null,
    lineNote: row.lineNote ?? null,
    requiresPacking: row.requiresPacking ?? false,
    deliveryDate: row.deliveryDate ? new Date(`${row.deliveryDate}T00:00:00.000Z`) : null,
    containerSize: row.containerSize ?? null,
    meshType: row.meshType ?? null,
    needleCount: row.needleCount ?? null,
    beamCount: row.beamCount ?? null,
    orderType,
    rollLength: row.rollLength ?? null,
    pieceLength: row.pieceLength ?? null,
    hasEyelet: row.hasEyelet ?? false,
    eyeletColor: row.eyeletColor ?? null,
    eyeletLines: row.eyeletLines ?? null,
    eyeletSpec: row.eyeletSpec ?? null,
    // V4.1 — must persist, never silently fall back except documented defaults.
    colorVersion: (r.colorVersion as string | null) ?? null,
    primaryPackingType: (r.primaryPackingType as string | null) ?? 'ROLL',
    hasPaperCore: r.hasPaperCore === true,
    isHalfFolded: Boolean(r.isHalfFolded),
    outerWrapping: (r.outerWrapping as string | null) ?? 'POLYBAG',
    piecesPerCarton: (r.piecesPerCarton as number | null) ?? null,
    piecesPerBale: (r.piecesPerBale as number | null) ?? null,
    boxDimensions: (r.boxDimensions as string | null) ?? null,
    onPallet: Boolean(r.onPallet),
    secondaryPackingType: (r.secondaryPackingType as string | null) ?? 'NONE',
    palletDimensions: (r.palletDimensions as string | null) ?? null,
    itemsPerPallet: (r.itemsPerPallet as number | null) ?? null,
    packingNote: (r.packingNote as string | null) ?? null,
    isLaminated: Boolean(r.isLaminated),
    rawFabricGsm: (r.rawFabricGsm as number | null) ?? null,
    coatingGsm: (r.coatingGsm as number | null) ?? null,
    finishedGsm: (r.finishedGsm as number | null) ?? null,
    toleranceQtyPct: (r.toleranceQtyPct as number | null) ?? 10.0,
    toleranceSpecPct: (r.toleranceSpecPct as number | null) ?? 5.0,
    qtySqm: calculation.qtySqm,
    totalWeightKgs: calculation.totalWeightKgs,
    requiredYarnKg: calculation.requiredYarnKg,
    dataSource: 'import',
  }
}
