import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'
import { withTestSession } from '@/lib/auth/testSession'

const rows: Array<Record<string, unknown>> = []
const order = { id: 'order-1', orderType: 'rolls', isDraft: false, isPlaceholder: false, lifecycleStatus: 'APPROVED' }
const output = {
  aggregate: async () => ({ _sum: { weightKgs: new Prisma.Decimal('120.00') }, _count: { _all: 1 } }),
}
const handoffModel = {
  findMany: async () => rows,
  findFirst: async ({ where }: { where: { id: string } }) => rows.find(row => row.id === where.id) ?? null,
  aggregate: async ({ where }: { where: { fromStage?: string; unit?: string; voidedAt?: null } }) => ({
    _sum: { quantity: rows.filter(row => !row.voidedAt && (!where.fromStage || row.fromStage === where.fromStage) && (!where.unit || row.unit === where.unit)).reduce((sum, row) => sum.plus(row.quantity as Prisma.Decimal), new Prisma.Decimal(0)) },
  }),
  create: async ({ data }: { data: Record<string, unknown> }) => {
    const row = { id: `handoff-${rows.length + 1}`, ...data, createdAt: new Date(), voidedAt: null }
    rows.push(row)
    return row
  },
  update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
    const row = rows.find(candidate => candidate.id === where.id)!
    Object.assign(row, data)
    return row
  },
}
const delegates = {
  productionOrder: { findUnique: async () => order },
  productionHandoff: handoffModel,
  extruderDailyOutput: output,
  warpingDailyOutput: { aggregate: async () => ({ _sum: { quantity: new Prisma.Decimal('3.00') }, _count: { quantity: 1 } }) },
  knittingDailyDetail: { aggregate: async () => ({ _sum: { mValue: new Prisma.Decimal('450.00') }, _count: { mValue: 1 } }), findMany: async () => [] },
  rollingDailyMetric: { aggregate: async () => ({ _sum: { metricValue: new Prisma.Decimal('7.00') }, _count: { metricValue: 2 } }), findMany: async () => [] },
}
const tx = {
  ...delegates,
  $executeRaw: async () => 0,
  $queryRaw: async () => [{ id: order.id }],
} as unknown as Prisma.TransactionClient
const fixture = {
  ...delegates,
  $transaction: async (run: (client: Prisma.TransactionClient) => Promise<unknown>) => run(tx),
}
const singleton = globalThis as unknown as { prisma: unknown }
const previous = singleton.prisma
let POST: typeof import('./route').POST
let GET: typeof import('./route').GET
let VOID: typeof import('./[handoffId]/void/route').POST

before(async () => {
  rows.splice(0)
  singleton.prisma = fixture
  const route = await import('./route')
  const voidRoute = await import('./[handoffId]/void/route')
  POST = withTestSession(route.POST, fixture)
  GET = withTestSession(route.GET, fixture)
  VOID = withTestSession(voidRoute.POST, fixture)
})
after(() => { singleton.prisma = previous })

test('handoff API records a partial transfer and rejects more than actual remaining', async () => {
  const post = (quantity: string) => new NextRequest('http://qa.invalid/api/orders/order-1/handoffs', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fromStage: 'extruder', quantity, date: '2026-11-17', shift: 'D', handedOffBy: 'Người giao', receivedBy: 'Người nhận', note: '' }),
  })

  const created = await POST(post('100.00'), { params: { id: order.id } })
  assert.equal(created.status, 201)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].unit, 'kg')
  assert.equal(rows[0].toStage, 'warping')

  const exceeded = await POST(post('25.00'), { params: { id: order.id } })
  assert.equal(exceeded.status, 409)
  assert.match((await exceeded.json()).error, /vượt phần còn khả dụng/)
  assert.equal(rows.length, 1)
})

test('handoff API shows remaining balance and void keeps history while releasing capacity', async () => {
  const get = () => new NextRequest('http://qa.invalid/api/orders/order-1/handoffs')
  const beforeVoid = await GET(get(), { params: { id: order.id } })
  assert.equal(beforeVoid.status, 200)
  const beforeBody = await beforeVoid.json()
  assert.equal(beforeBody.transitions.find((item: { fromStage: string }) => item.fromStage === 'extruder').remaining, '20.00')

  const voided = await VOID(new NextRequest('http://qa.invalid/api/orders/order-1/handoffs/handoff-1/void', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reason: 'Nhập nhầm số lượng' }),
  }), { params: { id: order.id, handoffId: 'handoff-1' } })
  assert.equal(voided.status, 200)

  const afterVoid = await GET(get(), { params: { id: order.id } })
  const afterBody = await afterVoid.json()
  assert.equal(afterBody.transitions.find((item: { fromStage: string }) => item.fromStage === 'extruder').remaining, '120.00')
  assert.ok(afterBody.handoffs[0].voidedAt)
  assert.equal(afterBody.handoffs[0].voidReason, 'Nhập nhầm số lượng')
})
