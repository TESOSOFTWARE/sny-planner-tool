import { withTestSession } from '@/lib/auth/testSession'
import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'

const progressByOrder: Record<string, number> = { vn: 250, utc: 250 }
const recentDate = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`)
const prisma = {
  productionOrder: { findUnique: async ({ where }: { where: { id: string } }) => ({ id: where.id, piNumber: 'TEST-M30-001', lengthM: 100, isDraft: false }) },
  knittingDailyDetail: {
    aggregate: async ({ where }: { where: { orderId: string } }) => ({ _count: { mValue: 1 }, _sum: { mValue: progressByOrder[where.orderId] } }),
    count: async () => 0,
    findMany: async ({ where }: { where: { orderId: string } }) => [{ reportDate: recentDate, mValue: progressByOrder[where.orderId] }],
  },
}
let GET: typeof import('./route').GET
const singleton = globalThis as unknown as { prisma: unknown }
const previous = singleton.prisma
before(async () => { singleton.prisma = prisma; GET = withTestSession((await import('./route')).GET, singleton.prisma) })
after(() => { singleton.prisma = previous })

test('PI item progress uses linked knittingDailyDetail.mValue, not shared machine/day schedule output', async () => {
  const produced: number[] = []
  for (const orderId of ['vn', 'utc']) {
    const res = await GET(new Request('http://localhost') as never, { params: { orderId } })
    assert.equal(res.status, 200)
    const body = await res.json() as { producedMeters: number; remainingMeters: number; hasData: boolean }
    assert.equal(body.producedMeters, 250, orderId)
    assert.equal(body.remainingMeters, 0, orderId)
    assert.equal(body.hasData, true)
    produced.push(body.producedMeters)
  }
  assert.equal(produced.reduce((sum, value) => sum + value, 0), 500)
})
