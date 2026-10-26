import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { scheduleDay } from '@/lib/schedule/importSafety'

// The same VN schedule day may be stored at either VN midnight or UTC midnight.
const day = scheduleDay(new Date())
const vnMidnight = new Date(`${day}T00:00:00+07:00`)
const utcMidnight = new Date(`${day}T00:00:00Z`)
const assignments = [
  { orderId: 'vn', machineId: 'M-014', startDate: vnMidnight, endDate: vnMidnight, allocatedMeters: 100, order: { lengthM: 100 } },
  { orderId: 'utc', machineId: 'M-014', startDate: utcMidnight, endDate: utcMidnight, allocatedMeters: 100, order: { lengthM: 100 } },
]
type AssignmentWhere = {
  orderId?: string
  machineId?: { in: string[] }
  startDate?: { lte: Date }
  endDate?: { gte: Date }
}
const sharingQueries: AssignmentWhere[] = []
const prisma = {
  productionOrder: { findUnique: async ({ where }: { where: { id: string } }) => ({ id: where.id, lengthM: 100, isDraft: false }) },
  machineAssignment: {
    findMany: async ({ where }: { where: AssignmentWhere }) => {
      if (where.orderId) return assignments.filter(row => row.orderId === where.orderId)
      sharingQueries.push(where)
      // Honor every timestamp predicate: returning all rows would hide R-1.
      return assignments.filter(row =>
        (!where.machineId || where.machineId.in.includes(row.machineId)) &&
        (!where.startDate || row.startDate <= where.startDate.lte) &&
        (!where.endDate || row.endDate >= where.endDate.gte))
    },
  },
  knittingDailyOutput: { findMany: async () => [{ machineId: 'M-014', reportDate: utcMidnight, dailyMeters: 500 }] },
}
let GET: typeof import('./route').GET
const singleton = globalThis as unknown as { prisma: unknown }
const previous = singleton.prisma
before(async () => { singleton.prisma = prisma; GET = (await import('./route')).GET })
after(() => { singleton.prisma = previous })

test('2610-01 R-1: VN-midnight and UTC-midnight schedules share 500 m equally', async () => {
  const produced: number[] = []
  for (const orderId of ['vn', 'utc']) {
    const res = await GET(new Request('http://localhost') as never, { params: { orderId } })
    assert.equal(res.status, 200)
    const body = await res.json() as { producedMeters: number; avgDailyOutput: number }
    assert.equal(body.producedMeters, 250, orderId)
    assert.equal(body.avgDailyOutput, 250, orderId)
    produced.push(body.producedMeters)
  }
  assert.equal(produced.reduce((sum, value) => sum + value, 0), 500)
  assert.equal(sharingQueries.length, 2)
  for (const where of sharingQueries) {
    assert.equal(where.endDate?.gte.toISOString(), vnMidnight.toISOString())
    assert.equal(where.startDate?.lte.toISOString(), new Date(`${day}T23:59:59.999+07:00`).toISOString())
  }
})
