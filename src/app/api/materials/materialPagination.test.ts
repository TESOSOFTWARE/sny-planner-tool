// 1810-05: real GET handlers, fake Prisma only; never connects to a database.
import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { NextRequest } from 'next/server'

const counts = { extruder: 402, warping: 113, knitting: 1590, rolling: 855, packing: 203 }
type Kind = keyof typeof counts
type Query = { skip?: number; take?: number; orderBy?: Record<string, string>[]; distinct?: string[]; select?: Record<string, boolean>; where?: unknown }
const captures: Partial<Record<Kind, Query>> = {}
const epoch = new Date('2026-05-13T00:00:00.000Z')
const rows = (kind: Kind) => Array.from({ length: counts[kind] }, (_, index) => ({
  id: `${kind}-${String(counts[kind] - index).padStart(4, '0')}`,
  date: epoch, reportDate: epoch, createdAt: epoch, updatedAt: epoch,
  machineId: 'M-001', shift: 'D', color: 'BLUE', orderRef: 'QA-PI',
  weightKgs: 1, lengthM: 1, metricLabel: 'TOTAL (M) BIG', metricValue: 1,
  dataSource: 'synthetic', qtyDay: 1, qtyNight: 0,
  totalMDay: 1, totalMNight: 0, weightDay: 1, weightNight: 0,
}))
function model(kind: Kind) {
  return {
    findMany: async (query: Query) => {
      if (query.distinct) return [{ machineId: 'M-001' }]
      const all = rows(kind)
      if (query.take === undefined) return all
      captures[kind] = query
      // Every fixture row ties on the business keys, across multiple page boundaries.
      const finalKey = query.orderBy?.at(-1)
      if (finalKey?.id === 'asc') all.sort((a, b) => a.id.localeCompare(b.id))
      return all.slice(query.skip ?? 0, (query.skip ?? 0) + query.take)
    },
    count: async () => counts[kind],
    aggregate: async () => ({ _sum: { weightKgs: counts[kind], lengthM: counts[kind] } }),
    groupBy: async () => kind === 'rolling' ? [{ orderRef: 'QA-PI' }] : [{ date: epoch }],
  }
}
const singleton = globalThis as unknown as { prisma: unknown }
const previous = singleton.prisma
const routes: Partial<Record<Kind, (request: NextRequest) => Promise<Response>>> = {}

before(async () => {
  singleton.prisma = {
    extruderDailyOutput: model('extruder'), warpingDailyOutput: model('warping'),
    knittingDailyDetail: model('knitting'), rollingDailyMetric: model('rolling'),
    packingDailyOutput: model('packing'),
  }
  routes.extruder = (await import('../extruder/records/route')).GET
  routes.warping = (await import('../warping/records/route')).GET
  routes.knitting = (await import('../knitting/detail/records/route')).GET
  routes.rolling = (await import('./rolling/records/route')).GET
  routes.packing = (await import('./packing/records/route')).GET
})
after(() => { singleton.prisma = previous })

for (const kind of Object.keys(counts) as Kind[]) {
  test(`${kind}: retain business sort, use unique id last, traverse every tied row exactly once`, async () => {
    const handler = routes[kind]!
    const expected = kind === 'rolling' ? [{ date: 'desc' }, { orderRef: 'asc' }, { id: 'asc' }]
      : kind === 'packing' ? [{ date: 'desc' }, { id: 'asc' }]
        : [{ reportDate: 'desc' }, { machineId: 'asc' }, { shift: 'asc' }, { id: 'asc' }]
    const ids: string[] = []
    for (let page = 1; page <= Math.ceil(counts[kind] / 100); page++) {
      const response = await handler(new NextRequest(`http://qa.invalid/records?page=${page}&limit=100`))
      assert.equal(response.status, 200)
      const data = await response.json()
      assert.equal(data.success, true)
      assert.equal(data.total ?? data.pagination.total, counts[kind])
      assert.equal(data.page ?? data.pagination.page, page)
      assert.equal(data.limit ?? data.pagination.limit, 100)
      assert.deepEqual(captures[kind]?.orderBy, expected)
      assert.equal(captures[kind]?.skip, (page - 1) * 100)
      assert.equal(data.records.length, Math.min(100, counts[kind] - (page - 1) * 100))
      ids.push(...data.records.map((row: { id: string }) => row.id))
      if (kind === 'rolling') assert.equal(data.sumMeters, counts[kind])
      else if (kind === 'packing') assert.equal(data.stats.sumTotalMeters, counts[kind])
      else assert.equal(Number(data.totalWeightKgs), counts[kind])
    }
    assert.equal(ids.length, counts[kind])
    assert.equal(new Set(ids).size, counts[kind])
    assert.deepEqual(ids, rows(kind).map(row => row.id).sort())
  })
  test(`${kind}: page 2 with 50 rows keeps the response contract and correct offset`, async () => {
    const response = await routes[kind]!(new NextRequest('http://qa.invalid/records?page=2&limit=50'))
    assert.equal(response.status, 200)
    const data = await response.json()
    assert.equal(data.records.length, 50)
    assert.equal(captures[kind]?.skip, 50)
    assert.equal(captures[kind]?.take, 50)
    assert.equal(data.records[0].id, `${kind}-0051`)
  })
}
