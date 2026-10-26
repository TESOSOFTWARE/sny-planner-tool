import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'

const writes: Record<string, unknown>[] = []
const rows: Record<string, unknown>[] = []
const prisma = {
  $transaction: async (run: (tx: unknown) => Promise<unknown>) => run(prisma),
  $executeRaw: async () => 0,
  productionOrder: {
    findMany: async ({ select }: { select: Record<string, unknown> }) => {
      assert.equal(select.subLineIndex, true)
      return rows
    },
  },
  machineAssignment: {
    findFirst: async () => null,
    create: async ({ data }: { data: Record<string, unknown> }) => {
      writes.push(data)
      return { id: String(writes.length), ...data }
    },
  },
  factoryCalendarMonth: { findMany: async () => [] },
  factoryCalendarException: { findMany: async () => [] },
}
let POST: typeof import('./route').POST
const singleton = globalThis as unknown as { prisma: unknown }
const previous = singleton.prisma
before(async () => { singleton.prisma = prisma; POST = (await import('./route')).POST })
after(() => { singleton.prisma = previous })

function setRows(lengths: (number | null)[]) {
  writes.length = 0
  rows.splice(0, rows.length, ...lengths.map((lengthM, index) => ({
    id: String(index + 1), subLineIndex: index + 1, lengthM,
    piNumber: 'QA-2610', widthM: 4.5, gsm: 230, color: 'BLACK', meshType: 'M+M',
    isDraft: false, isPlaceholder: false, lifecycleStatus: 'APPROVED',
    _count: { assignments: 0 },
  })))
}
function request() {
  return new Request('http://localhost/api/assignments', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      machineId: 'M-014', orderIds: rows.map(row => row.id),
      startDate: '2026-10-31T17:00:00.000Z', endDate: '2026-11-01T17:00:00.000Z',
      estimatedDailyOutput: 500, endDateSource: 'COMPUTED',
    }),
  })
}

test('2610-01 R-2: 11 x 1.23 + 486.47 meters takes one working day at 500m/day', async () => {
  setRows([...Array<number>(11).fill(1.23), 486.47])
  assert.ok(rows.reduce((sum, row) => sum + Number(row.lengthM), 0) > 500)
  const response = await POST(request())
  assert.equal(response.status, 201)
  assert.equal(writes.length, 12)
  for (const write of writes) {
    // November 1 is Sunday: first working day is November 2 in Vietnam.
    assert.equal((write.startDate as Date).toISOString(), '2026-11-01T17:00:00.000Z')
    assert.equal((write.endDate as Date).toISOString(), '2026-11-01T17:00:00.000Z')
    assert.equal(write.estimatedDailyOutput, 500)
  }
  assert.deepEqual(writes.map(write => write.allocatedMeters), rows.map(row => row.lengthM))
})

test('2610-01 R-4: invalid member meters returns 400 identifying PI/line without writes', async () => {
  for (const invalid of [null, 0, -1, Number.NaN]) {
    setRows([invalid, 100])
    const response = await POST(request())
    assert.equal(response.status, 400)
    assert.equal((await response.json()).message,
      'Dòng 1 của PI QA-2610 chưa có số mét; bỏ tick dòng này hoặc bổ sung mét.')
    assert.equal(writes.length, 0)
  }
})
