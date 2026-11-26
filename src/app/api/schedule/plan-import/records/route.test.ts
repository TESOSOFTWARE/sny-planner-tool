import assert from 'node:assert/strict'
import test, { after, before } from 'node:test'
import { NextRequest } from 'next/server'
import { withTestSession } from '@/lib/auth/testSession'

let rowFilter: unknown
const at = (id: string, sheets: string[], createdAt: string) => ({
  id, stage: 'warping', profile: 'warping-work-order', scopeKey: 'all', fileName: `${id}.xlsx`,
  summary: { sourceSheets: sheets }, createdAt: new Date(createdAt), confirmedAt: new Date(createdAt),
  _count: { rows: sheets.length },
})
const batches = [
  at('new-b', ['SHEET-B'], '2026-11-25T03:00:00Z'),
  at('old-ab', ['SHEET-A', 'SHEET-B'], '2026-11-25T01:00:00Z'),
]
const fake = {
  productionStagePlanImportBatch: { findMany: async () => batches },
  productionStagePlanImportRow: {
    findMany: async ({ where }: { where: unknown }) => {
      rowFilter = where
      return [
        { id: 'row-new-b', batchId: 'new-b', sourceSheet: 'SHEET-B', sourceRow: 3, planDate: null, createdAt: new Date() },
        { id: 'row-old-a', batchId: 'old-ab', sourceSheet: 'SHEET-A', sourceRow: 4, planDate: null, createdAt: new Date() },
      ]
    },
    count: async ({ where }: { where: unknown }) => { rowFilter = where; return 2 },
  },
}
const singleton = globalThis as unknown as { prisma: unknown }
const previous = singleton.prisma
let get: typeof import('./route').GET

before(async () => {
  singleton.prisma = fake
  get = withTestSession((await import('./route')).GET, fake)
})
after(() => { singleton.prisma = previous })

test('work-order schedule selects latest rows per sheet without leaking superseded rows from a shared older batch', async () => {
  const response = await get(new NextRequest('http://qa.invalid/api/schedule/plan-import/records?stage=warping&profile=warping-work-order&scopeKey=all'))
  assert.equal(response.status, 200)
  const filter = rowFilter as { OR: Array<{ batchId: string; sourceSheet: { in: string[] } }> }
  assert.deepEqual(filter.OR, [
    { batchId: 'new-b', sourceSheet: { in: ['SHEET-B'] } },
    { batchId: 'old-ab', sourceSheet: { in: ['SHEET-A'] } },
  ])
  const body = await response.json()
  assert.equal(body.history.length, 2)
  assert.deepEqual(body.rows.map((row: { batchId: string }) => row.batchId), ['new-b', 'old-ab'])
  assert.equal(body.total, 2)
})
