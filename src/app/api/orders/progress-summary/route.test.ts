import { withTestSession } from '@/lib/auth/testSession'
import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { NextRequest } from 'next/server'

const orders = { findMany: async () => [{ id: 'line-1', piNumber: 'PI-1', orderType: 'rolls' }] }
let planWhere: unknown
const plans = { findMany: async ({ where }: { where: unknown }) => { planWhere = where; return [
  { orderId: 'line-1', orderRef: 'PI-1', stage: 'extruder', metricLabel: 'Sản lượng kéo sợi', unit: 'kg', plannedValue: '1000' },
  { orderId: 'line-1', orderRef: 'PI-1', stage: 'rolling', metricLabel: 'Số lượng cuộn', unit: 'cuộn', plannedValue: '100' },
] } }
const extruder = { findMany: async () => [{ orderId: 'line-1', orderRef: 'PI-1', weightKgs: '650', reportDate: new Date('2026-11-12T00:00:00.000Z') }] }
const warping = { findMany: async () => [] }
const knitting = { findMany: async () => [] }
const rolling = { findMany: async () => [{ orderId: 'line-1', orderRef: 'PI-1', metricLabel: 'QUANTITY SMALL', metricValue: '30', date: new Date('2026-11-12T00:00:00.000Z') }] }
const fake = { productionOrder: orders, productionOutputPlan: plans, extruderDailyOutput: extruder, warpingDailyOutput: warping, knittingDailyDetail: knitting, rollingDailyMetric: rolling }
const singleton = globalThis as unknown as { prisma: unknown }
const previous = singleton.prisma
let get: typeof import('./route').GET

before(async () => {
  singleton.prisma = fake
  get = withTestSession((await import('./route')).GET, singleton.prisma)
})
after(() => { singleton.prisma = previous })

test('progress compares plan and imported actual for the selected month and compatible metric/unit', async () => {
  const response = await get(new NextRequest('http://qa.invalid/api/orders/progress-summary?month=2026-11'))
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.month, '2026-11')
  assert.deepEqual(planWhere, { planDate: { gte: new Date('2026-11-01T00:00:00.000Z'), lt: new Date('2026-12-01T00:00:00.000Z') } })
  const extruderRow = body.progress.find((row: { stage: string }) => row.stage === 'extruder')
  const rollingRow = body.progress.find((row: { stage: string }) => row.stage === 'rolling')
  assert.equal(extruderRow.planned, 1000)
  assert.equal(extruderRow.actual, 650)
  assert.equal(extruderRow.achievedPercent, 65)
  assert.equal(rollingRow.planned, 100)
  assert.equal(rollingRow.actual, 30)
  assert.equal(rollingRow.achievedPercent, 30)
})
