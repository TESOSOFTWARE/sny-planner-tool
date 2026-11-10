import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { NextRequest } from 'next/server'
import { withTestSession } from '@/lib/auth/testSession'

const singleton = globalThis as unknown as { prisma: unknown }, previous = singleton.prisma
let lastQuery: { where: { orderId?: unknown; orderRef?: unknown }; skip: number; take: number } | undefined
let calls = 0
const model = {
  findMany: async (query: NonNullable<typeof lastQuery>) => {
    calls++; lastQuery = query
    return [{ id: 'output', reportDate: new Date('2026-10-28Z'), date: new Date('2026-10-28Z'), orderRef: 'RAW PI text', orderId: null, color: 'BLUE', machineId: 'EXT-01', shift: 'D', weightKgs: '12.34', lengthM: null, metricLabel: 'QUANTITY SMALL', metricValue: '3' }]
  }, count: async () => 151,
}
let GET: typeof import('./route').GET
before(async () => {
  singleton.prisma = { extruderDailyOutput: model, warpingDailyOutput: model, knittingDailyDetail: model, rollingDailyMetric: model }
  GET = withTestSession((await import('./route')).GET, singleton.prisma)
})
after(() => { singleton.prisma = previous })
test('raw PI and unresolved link survive all four stage views; rolling retains metric label', async () => {
  for (const stage of ['extruder', 'warping', 'knitting', 'rolling']) {
    const response = await GET(new NextRequest('http://qa.invalid/api/production-records?stage=' + stage + '&q=RAW&state=unlinked&page=2&limit=50'))
    assert.equal(response.status, 200)
    const data = await response.json()
    assert.equal(data.total, 151); assert.equal(data.records[0].orderRef, 'RAW PI text'); assert.equal(data.records[0].orderId, null)
    assert.equal(lastQuery?.skip, 50); assert.equal(lastQuery?.take, 50); assert.equal(lastQuery?.where.orderId, null)
    assert.deepEqual(lastQuery?.where.orderRef, { contains: 'RAW', mode: 'insensitive' })
    if (stage === 'rolling') { assert.equal(data.records[0].metric, 'QUANTITY SMALL'); assert.equal(data.records[0].kilograms, null) }
  }
})
test('invalid filters and oversized page limits fail before data queries', async () => {
  const baseline = calls
  for (const query of ['stage=invalid', 'stage=extruder&limit=1000', 'stage=extruder&page=NaN', 'stage=extruder&state=guess']) {
    assert.equal((await GET(new NextRequest('http://qa.invalid/api/production-records?' + query))).status, 422)
  }
  assert.equal(calls, baseline)
})
test('shared pager supports its 200-row option', async () => {
  assert.equal((await GET(new NextRequest('http://qa.invalid/api/production-records?stage=extruder&limit=200'))).status, 200)
  assert.equal(lastQuery?.take, 200)
})
