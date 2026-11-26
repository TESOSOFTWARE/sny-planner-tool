import { withTestSession } from '@/lib/auth/testSession'
import test, { before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { NextRequest } from 'next/server'

type SavedRow = Record<string, unknown> & { id: string; sourceKey: string | null }
let saved: SavedRow[] = []
let nextId = 1
const globalState = globalThis as unknown as { prisma: unknown }
let previousPrisma: unknown
let confirm: typeof import('./route').POST
type FakeTable = {
  findMany: (args: { where: { reportDate: { gte: Date; lt: Date } } }) => Promise<SavedRow[]>
  update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<SavedRow | undefined>
  createMany: (args: { data: Array<Record<string, unknown>> }) => Promise<{ count: number }>
}
type FakeTransaction = {
  $executeRawUnsafe: () => Promise<void>
  $transaction: (run: (tx: FakeTransaction) => Promise<unknown>) => Promise<unknown>
  productionOrder: { findMany: () => Promise<never[]> }
  extruderDailyOutput: FakeTable
}
let fake: FakeTransaction

fake = {
  $executeRawUnsafe: async () => undefined,
  $transaction: async run => run(fake),
  productionOrder: { findMany: async () => [] },
  extruderDailyOutput: {
    findMany: async ({ where }: { where: { reportDate: { gte: Date; lt: Date } } }) => saved.filter(row => {
      const date = new Date(row.reportDate as Date)
      return date >= where.reportDate.gte && date < where.reportDate.lt
    }),
    update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      saved = saved.map(row => row.id === where.id ? { ...row, ...data } : row)
      return saved.find(row => row.id === where.id)
    },
    createMany: async ({ data }: { data: Array<Record<string, unknown>> }) => {
      saved.push(...data.map(row => ({ ...row, id: `row-${nextId++}` } as SavedRow)))
      return { count: data.length }
    },
  },
}

before(async () => {
  previousPrisma = globalState.prisma
  globalState.prisma = fake
  confirm = withTestSession((await import('./route')).POST, fake)
})
after(() => { globalState.prisma = previousPrisma })
beforeEach(() => { saved = []; nextId = 1 })

function request(rows: unknown[]) {
  return new NextRequest('http://qa.invalid/api/extruder/import/confirm', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ rows, reportMonth: '2026-11', sourceFileName: 'report.xlsx' }),
  })
}

const validRow = (sourceRow: number, weightKgs: number) => ({
  machineId: 'EXT-01', reportDate: '2026-11-02T00:00:00.000Z', shift: 'D', color: 'BLACK',
  denier: 21, weightKgs, sourceWeight: String(weightKgs), sourceRow, isValid: true,
  validationErrors: [], beamNote: null, orderRef: 'PI-1', sourceOrderRefs: ['PI-1'],
})

test('same file row skips; corrected value updates the existing record without duplicates', async () => {
  const first = await confirm(request([validRow(42, 100)]))
  assert.equal(first.status, 200)
  assert.equal((await first.json()).recordsAdded, 1)
  const sourceKey = saved[0].sourceKey

  const retry = await confirm(request([validRow(42, 100)]))
  const retryBody = await retry.json()
  assert.equal(retry.status, 200)
  assert.equal(retryBody.recordsAdded, 0)
  assert.equal(retryBody.recordsUnchanged, 1)
  assert.equal(saved.length, 1)

  const corrected = await confirm(request([validRow(42, 125)]))
  const correctedBody = await corrected.json()
  assert.equal(corrected.status, 200)
  assert.equal(correctedBody.recordsAdded, 0)
  assert.equal(correctedBody.recordsUpdated, 1)
  assert.equal(saved.length, 1)
  assert.equal(saved[0].weightKgs, 125)
  assert.equal(saved[0].sourceKey, sourceKey)
})

test('invalid rows are skipped while valid rows are still added', async () => {
  const invalid = { ...validRow(10, 0), color: '', isValid: false, validationErrors: ['Thiếu COLOR'] }
  const result = await confirm(request([invalid, validRow(11, 80)]))
  const body = await result.json()
  assert.equal(result.status, 200)
  assert.equal(body.recordsAdded, 1)
  assert.equal(body.invalidSkipped, 1)
  assert.equal(saved.length, 1)
  assert.match(saved[0].sourceKey ?? '', /^[a-f0-9]{64}$/)
})
