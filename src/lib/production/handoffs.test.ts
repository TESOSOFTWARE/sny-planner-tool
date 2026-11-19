import test from 'node:test'
import assert from 'node:assert/strict'
import { Prisma } from '@prisma/client'
import type { Prisma as PrismaTypes } from '@prisma/client'
import {
  assertHandoffsCoveredAfterImport,
  availableHandoffQuantity,
  handoffSourceMetricLabel,
  handoffUnit,
  HandoffImportConflict,
  nextProductionStage,
} from './handoffs'

test('handoff stage sequence and units follow the agreed production flow', () => {
  assert.equal(nextProductionStage('extruder'), 'warping')
  assert.equal(nextProductionStage('warping'), 'knitting')
  assert.equal(nextProductionStage('knitting'), 'rolling')
  assert.equal(nextProductionStage('rolling'), 'packing')
  assert.equal(nextProductionStage('packing'), null)
  assert.equal(handoffUnit('extruder', 'rolls'), 'kg')
  assert.equal(handoffUnit('warping', 'rolls'), 'beam')
  assert.equal(handoffUnit('knitting', 'rolls'), 'm')
  assert.equal(handoffUnit('rolling', 'rolls'), 'rolls')
  assert.equal(handoffUnit('rolling', 'pieces'), 'pieces')
  assert.equal(handoffSourceMetricLabel('rolling'), 'QUANTITY SMALL/BIG')
})

test('available rolling quantity sums both agreed source metrics by exact linked order', async () => {
  let receivedWhere: unknown
  const tx = {
    rollingDailyMetric: {
      aggregate: async (query: { where: unknown }) => {
        receivedWhere = query.where
        return { _count: { metricValue: 2 }, _sum: { metricValue: new Prisma.Decimal('7.00') } }
      },
    },
  } as unknown as PrismaTypes.TransactionClient

  const amount = await availableHandoffQuantity(tx, 'order-1', 'rolling')
  assert.equal(amount?.toFixed(2), '7.00')
  assert.deepEqual(receivedWhere, { orderId: 'order-1', metricLabel: { in: ['QUANTITY SMALL', 'QUANTITY BIG'] } })
})

test('report replacement is allowed if it still covers active WIP handoffs', async () => {
  const tx = {
    productionOrder: { findMany: async () => [{ id: 'order-1', piNumber: 'TEST-M30-001', orderType: 'rolls' }] },
    productionHandoff: { groupBy: async () => [{ orderId: 'order-1', unit: 'kg', _sum: { quantity: new Prisma.Decimal('100') } }] },
    extruderDailyOutput: { groupBy: async () => [{ orderId: 'order-1', _sum: { weightKgs: new Prisma.Decimal('120') } }] },
  } as unknown as PrismaTypes.TransactionClient

  await assertHandoffsCoveredAfterImport(
    tx,
    'extruder',
    [{ orderId: 'order-1', weightKgs: 120 }],
    [{ orderId: 'order-1', weightKgs: 110 }],
  )
})

test('report replacement below active WIP handoffs is rejected before replacement', async () => {
  const tx = {
    productionOrder: { findMany: async () => [{ id: 'order-1', piNumber: 'TEST-M30-001', orderType: 'rolls' }] },
    productionHandoff: { groupBy: async () => [{ orderId: 'order-1', unit: 'kg', _sum: { quantity: new Prisma.Decimal('100') } }] },
    extruderDailyOutput: { groupBy: async () => [{ orderId: 'order-1', _sum: { weightKgs: new Prisma.Decimal('120') } }] },
  } as unknown as PrismaTypes.TransactionClient

  await assert.rejects(
    assertHandoffsCoveredAfterImport(
      tx,
      'extruder',
      [{ orderId: 'order-1', weightKgs: 120 }],
      [{ orderId: 'order-1', weightKgs: 90 }],
    ),
    (error: unknown) => error instanceof HandoffImportConflict && /TEST-M30-001/.test(error.message) && /100\.00 kg/.test(error.message) && /90\.00 kg/.test(error.message),
  )
})
