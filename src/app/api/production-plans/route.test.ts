import assert from 'node:assert/strict'
import test, { after, before } from 'node:test'
import { NextRequest } from 'next/server'
import { withTestSession } from '@/lib/auth/testSession'

const singleton = globalThis as unknown as { prisma: unknown }
const previous = singleton.prisma
let query: { where: { stage: string; planDate: unknown }; take: number } | undefined
const fake = {
  productionOutputPlan: {
    findMany: async (input: NonNullable<typeof query>) => {
      query = input
      return [{ id: 'plan-1', stage: 'extruder', planDate: new Date('2026-11-01T00:00:00.000Z'), plannedValue: '125.50' }]
    },
  },
}
let get: typeof import('./route').GET

before(async () => {
  singleton.prisma = fake
  get = withTestSession((await import('./route')).GET, fake)
})
after(() => { singleton.prisma = previous })

test('calendar query loads the selected month, not one date, and serializes planned values', async () => {
  const response = await get(new NextRequest('http://qa.invalid/api/production-plans?stage=extruder&from=2026-11-01&to=2026-11-30'))
  assert.equal(response.status, 200)
  assert.deepEqual(query?.where.planDate, { gte: new Date('2026-11-01T00:00:00.000Z'), lt: new Date('2026-12-01T00:00:00.000Z') })
  assert.equal(query?.take, 10_000)
  const body = await response.json()
  assert.equal(body.plans[0].plannedValue, '125.50')
})

test('existing one-day plan query remains supported', async () => {
  const response = await get(new NextRequest('http://qa.invalid/api/production-plans?stage=extruder&date=2026-11-25'))
  assert.equal(response.status, 200)
  assert.deepEqual(query?.where.planDate, { equals: new Date('2026-11-25T00:00:00.000Z') })
})

test('invalid and oversized calendar ranges are rejected before querying plans', async () => {
  let calls = 0
  const original = fake.productionOutputPlan.findMany
  fake.productionOutputPlan.findMany = async input => { calls++; return original(input) }
  for (const queryString of [
    'stage=extruder&from=2026-11-02&to=2026-11-01',
    'stage=extruder&from=2026-11-01&to=2026-12-02',
    'stage=extruder&from=invalid&to=2026-11-30',
  ]) assert.equal((await get(new NextRequest(`http://qa.invalid/api/production-plans?${queryString}`))).status, 422)
  assert.equal(calls, 0)
})
