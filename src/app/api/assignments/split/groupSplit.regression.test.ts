import test, { before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

type Row = {
  id: string; orderId: string; machineId: string; startDate: Date; endDate: Date
  allocatedMeters: number | null; estimatedDailyOutput: number | null; isPlaceholder: boolean; endDateSource: string
  order: { piNumber: string; subLineIndex: number; widthM: number; gsm: number; color: string; meshType: string }
}
let rows: Row[] = [], failOnCreate = 0, createCount = 0, overlapCount = 0, updateCount = 0
let conflict = false, omitSource = false, staleMember = false
let overlapQuery: unknown
const order = { piNumber: 'HSIA', widthM: 4.5, gsm: 230, color: 'BLACK', meshType: 'M+M' }
const prisma = { $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
  const working = rows.map(row => ({ ...row, order: { ...row.order } }))
  const tx = {
    $executeRaw: async () => 0,
    factoryCalendarMonth: { findMany: async () => [] },
    factoryCalendarException: { findMany: async () => [] },
    machineAssignment: {
      findUnique: async ({ where }: { where: { id: string } }) => working.find(row => row.id === where.id) ?? null,
      findMany: async ({ where }: { where: { machineId: string; startDate: { gte: Date; lte: Date }; endDate: { gte: Date; lte: Date } } }) => {
        assert.equal(where.machineId, 'M-014')
        assert.deepEqual(where.startDate, { gte: rows[0].startDate, lte: new Date(rows[0].startDate.getTime() + 86400000 - 1) })
        let found = working.filter(row => (!omitSource || row.id !== 'a') && row.machineId === where.machineId
          && row.startDate >= where.startDate.gte && row.startDate <= where.startDate.lte
          && row.endDate >= where.endDate.gte && row.endDate <= where.endDate.lte)
        if (staleMember) found = [...found, { ...working[0], id: 'stale', machineId: 'M-003' }]
        return found
      },
      findFirst: async ({ where }: { where: unknown }) => {
        overlapCount++; overlapQuery = where
        return conflict ? { ...working[0], order: { ...order, piNumber: 'BUSY' } } : null
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
        updateCount++
        const index = working.findIndex(row => row.id === where.id)
        assert(index >= 0)
        working[index] = { ...working[index], ...data }
        return working[index]
      },
      create: async ({ data }: { data: Omit<Row, 'id' | 'order'> }) => {
        createCount++
        if (createCount === failOnCreate) throw new Error('Simulated group create failure')
        const original = working.find(row => row.orderId === data.orderId)!
        const created = { ...data, id: 'new-' + createCount, order: original.order }
        working.push(created)
        return created
      },
    },
  }
  const response = await fn(tx)
  rows = working
  return response
} }
const singleton = globalThis as unknown as { prisma: unknown }, previous = singleton.prisma
let POST: typeof import('./route').POST
before(async () => { singleton.prisma = prisma; POST = (await import('./route')).POST })
after(() => { singleton.prisma = previous })
beforeEach(t => {
  if ('mock' in t) t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-28T05:00:00Z').getTime() })
  rows = [446.4, 180.6, 15].map((meters, index) => ({
    id: String.fromCharCode(97 + index), orderId: 'order-' + index, machineId: 'M-014',
    startDate: new Date('2026-10-25T17:00:00Z'), endDate: new Date('2026-10-29T17:00:00Z'),
    allocatedMeters: meters, estimatedDailyOutput: 500, isPlaceholder: false, endDateSource: 'COMPUTED',
    order: { ...order, subLineIndex: index + 1 },
  }))
  failOnCreate = createCount = overlapCount = updateCount = 0
  conflict = omitSource = staleMember = false
})
const input = { id: 'a', stopDate: '2026-10-27', targetStartDate: '2026-10-27', targetMachineId: 'M-001' }
const request = (patch: Record<string, unknown> = {}) => new Request('http://localhost/api/assignments/split', {
  method: 'POST', body: JSON.stringify({ ...input, ...patch }),
})
const sumMeters = (members: Row[]) => Math.round(members.reduce((sum, row) => sum + Number(row.allocatedMeters), 0) * 100) / 100

test('2610-02: 642m group moves 142m with common dates and one conflict query', async () => {
  const response = await POST(request({ targetDailyOutput: 100 }))
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.group.size, 3); assert.equal(body.group.groupTotal, 642)
  assert.equal(body.estimatedWovenMeters, 500); assert.equal(body.remainingMeters, 142)
  assert.deepEqual(body.group.members, [
    { id: 'a', woven: 347.66, remaining: 98.74 },
    { id: 'b', woven: 140.66, remaining: 39.94 },
    { id: 'c', woven: 11.68, remaining: 3.32 },
  ])
  assert.equal(updateCount, 3); assert.equal(createCount, 3); assert.equal(overlapCount, 1)
  const targets = rows.filter(row => row.machineId === 'M-001')
  assert.equal(sumMeters(targets), 142)
  assert(targets.every(row => row.estimatedDailyOutput === 100 && row.startDate.toISOString() === '2026-10-26T17:00:00.000Z'
    && row.endDate.toISOString() === '2026-10-27T17:00:00.000Z'))
  assert.deepEqual((overlapQuery as { id: unknown }).id, { notIn: ['a', 'b', 'c'] })
  assert(rows.filter(row => row.machineId === 'M-014').every(row => row.estimatedDailyOutput === 500))
})

test('2610-02: zero work moves all source rows without source fragments', async () => {
  const response = await POST(request({ stopDate: '2026-10-26', targetStartDate: '2026-10-26' }))
  assert.equal(response.status, 200); assert.equal((await response.json()).movedWholeAssignment, true)
  assert.equal(rows.length, 3); assert.equal(updateCount, 3); assert.equal(createCount, 0)
  assert(rows.every(row => row.machineId === 'M-001')); assert.equal(sumMeters(rows), 642)
})

test('2610-02: tiny row with zero woven moves existing row, without zero-metre source', async () => {
  rows[2].allocatedMeters = 0.01
  rows.forEach(row => { row.estimatedDailyOutput = 1 })
  const response = await POST(request())
  assert.equal(response.status, 200); assert.equal(rows.find(row => row.id === 'c')!.machineId, 'M-001')
  assert.equal(createCount, 2); assert.equal(updateCount, 3)
  assert(rows.every(row => Number(row.allocatedMeters) > 0)); assert.equal(sumMeters(rows), 627.01)
})

test('2610-02: fully woven tiny member remains source without destination phantom', async () => {
  rows[0].allocatedMeters = 0.01; rows[1].allocatedMeters = 0.02; rows[2].allocatedMeters = 0.01
  rows.forEach(row => { row.estimatedDailyOutput = 0.03 })
  const response = await POST(request())
  assert.equal(response.status, 200)
  assert.equal(rows.filter(row => row.machineId === 'M-001').length, 1)
  assert.equal(sumMeters(rows.filter(row => row.machineId === 'M-001')), 0.01)
  assert(rows.every(row => Number(row.allocatedMeters) > 0))
})

test('2610-02: future group gives group guidance without writes', async () => {
  rows.forEach(row => { row.startDate = new Date('2026-10-29T17:00:00Z'); row.endDate = new Date('2026-10-30T17:00:00Z') })
  const response = await POST(request({ stopDate: '2026-10-30', targetStartDate: '2026-10-30' }))
  assert.equal(response.status, 400); assert.match((await response.json()).message, /3 dòng và chưa bắt đầu: tick thanh nhóm/)
  assert.equal(updateCount + createCount, 0)
})

test('2610-02: invalid member metres or mismatched output rejected with line label', async () => {
  for (const field of ['meters', 'rate', 'precision', 'missing-source'] as const) {
    const original = rows.map(row => ({ ...row }))
    if (field === 'meters') rows[1].allocatedMeters = null
    if (field === 'rate') rows[1].estimatedDailyOutput = 501
    if (field === 'precision') rows[1].allocatedMeters = 1.001
    if (field === 'missing-source') rows[0].estimatedDailyOutput = null
    const response = await POST(request({ sourceDailyOutput: 500 }))
    assert.equal(response.status, 400); assert.match((await response.json()).message, /Dòng [12] của nhóm/)
    assert.equal(updateCount + createCount, 0); rows = original
  }
})

test('2610-02: duplicate same-order candidates are rejected, including duplicates-only group', async () => {
  rows = [rows[0], { ...rows[0], id: 'duplicate' }]
  const response = await POST(request())
  assert.equal(response.status, 400); assert.match((await response.json()).message, /cùng một dòng/)
  assert.equal(updateCount + createCount, 0)
})

test('2610-02: missing source or stale member fails safely before writes', async () => {
  for (const missing of [true, false]) {
    omitSource = missing; staleMember = !missing
    const response = await POST(request())
    assert.equal(response.status, 400); assert.match((await response.json()).message, /Nhóm lịch đã thay đổi/)
    assert.equal(updateCount + createCount, 0)
  }
})

test('2610-02: whole group completed returns no remaining without writes', async () => {
  const response = await POST(request({ stopDate: '2026-10-28', targetStartDate: '2026-10-28' }))
  assert.equal(response.status, 400); assert.match((await response.json()).message, /Không còn mét/)
  assert.equal(updateCount + createCount, 0)
})

test('2610-02: one destination conflict prevents all group writes', async () => {
  conflict = true
  const response = await POST(request())
  assert.equal(response.status, 409); assert.equal((await response.json()).conflict.piNumber, 'BUSY')
  assert.equal(overlapCount, 1); assert.equal(updateCount + createCount, 0)
})

test('2610-02: create failure rolls back all staged group updates and creates', async t => {
  const original = structuredClone(rows)
  failOnCreate = 2; t.mock.method(console, 'error', () => {})
  assert.equal((await POST(request())).status, 500)
  assert.equal(createCount, 2); assert.equal(updateCount, 2); assert.deepEqual(rows, original)
})
