import { withTestSession } from '@/lib/auth/testSession'
import test, { after, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { NextRequest } from 'next/server'
import { STATISTICAL_REPORT_SHEETS } from '@/lib/production/importReview'

let batch: Record<string, unknown> | null = null
let createCount = 0
let savedSheets: Record<string, Record<string, unknown>> = {}
const sheetStore = {
  upsert: async ({ where, create, update }: { where: { batchId_sheetName: { sheetName: string } }; create: Record<string, unknown>; update: Record<string, unknown> }) => {
    const name = where.batchId_sheetName.sheetName
    const previous = savedSheets[name] ?? { ...create, id: `sheet-${name}`, createdAt: new Date(), updatedAt: new Date() }
    savedSheets[name] = { ...previous, ...update }
    return savedSheets[name]
  },
  findUnique: async ({ where }: { where: { batchId_sheetName: { sheetName: string } } }) => savedSheets[where.batchId_sheetName.sheetName] ?? null,
  findMany: async () => Object.values(savedSheets),
  findFirst: async () => null,
  update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
    const name = Object.keys(savedSheets).find(key => savedSheets[key].id === where.id)
    if (!name) return null
    savedSheets[name] = { ...savedSheets[name], ...data }
    return savedSheets[name]
  },
}
const fake = {
  productionReportImportBatch: {
    findMany: async () => batch ? [batch] : [],
    findUnique: async () => batch,
    create: async ({ data }: { data: Record<string, unknown> }) => {
      createCount++
      batch = { ...data, id: 'batch-1', createdAt: new Date('2026-11-20T00:00:00Z'), updatedAt: new Date('2026-11-20T00:00:00Z'), completedAt: null }
      return batch
    },
    update: async ({ data }: { data: Record<string, unknown> }) => {
      batch = { ...batch, ...data, updatedAt: new Date('2026-11-20T00:01:00Z') }
      return batch
    },
  },
  productionReportImportSheet: sheetStore,
  $queryRaw: async () => [],
  $transaction: async (callback: (client: unknown) => unknown) => callback(fake),
}
const singleton = globalThis as unknown as { prisma: unknown }
const previous = singleton.prisma
let createPost: typeof import('./route').POST
let patchSheet: typeof import('./[id]/route').PATCH

before(async () => {
  singleton.prisma = fake
  createPost = withTestSession((await import('./route')).POST, singleton.prisma)
  patchSheet = withTestSession((await import('./[id]/route')).PATCH, singleton.prisma)
})
after(() => { singleton.prisma = previous })
beforeEach(() => { batch = null; createCount = 0; savedSheets = {} })

function createRequest() {
  return new NextRequest('http://qa.invalid/api/production-imports', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      fileName: 'STATISTICAL REPORT 11-2026.xlsx', fileHash: 'a'.repeat(64), reportMonth: '2026-11',
      selectedSheets: STATISTICAL_REPORT_SHEETS, decisions: { materials: {}, knittingRemarks: {} },
    }),
  })
}

test('import batch deduplicates the same source file and month regardless of remapped material decisions', async () => {
  const first = await createPost(createRequest())
  assert.equal(first.status, 201)
  assert.equal(createCount, 1)
  const secondRequest = createRequest()
  const body = await secondRequest.json() as Record<string, unknown>
  body.decisions = { materials: { MF: { action: 'create' } }, knittingRemarks: {} }
  const second = await createPost(new NextRequest('http://qa.invalid/api/production-imports', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }))
  assert.equal(second.status, 200)
  assert.equal((await second.json()).existing, true)
  assert.equal(createCount, 1)
})

test('each batch sheet stores its parsed rows before status is confirmed and cannot be claimed twice', async () => {
  assert.equal((await createPost(createRequest())).status, 201)
  const request = (body: Record<string, unknown>) => new NextRequest('http://qa.invalid/api/production-imports/batch-1', {
    method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
  const sourceRows = [{ materialName: 'MF', sourceRow: 8 }]
  for (const sheet of STATISTICAL_REPORT_SHEETS) {
    const prepare = await patchSheet(request({ sheet, state: 'PREPARED', sourceRows }), { params: { id: 'batch-1' } })
    assert.equal(prepare.status, 200)
  }
  assert.deepEqual(savedSheets.HDPE.sourceRows, sourceRows)
  const claim = await patchSheet(request({ sheet: 'HDPE', state: 'PROCESSING' }), { params: { id: 'batch-1' } })
  assert.equal(claim.status, 200)
  const attemptToken = (await claim.json()).attemptToken as string
  assert.ok(attemptToken)
  assert.equal((await patchSheet(request({ sheet: 'HDPE', state: 'PROCESSING' }), { params: { id: 'batch-1' } })).status, 409)
  savedSheets.HDPE.attemptCommittedAt = new Date()
  savedSheets.HDPE.result = { recordsInserted: 2 }
  const complete = await patchSheet(request({ sheet: 'HDPE', state: 'CONFIRMED', attemptToken, result: { message: 'saved' } }), { params: { id: 'batch-1' } })
  assert.equal(complete.status, 200)
  const body = await complete.json()
  assert.equal(body.batch.sheetResults.HDPE.status, 'CONFIRMED')
  assert.equal(body.batch.status, 'PARTIAL')
})

test('server blocks a sheet claim until all five review snapshots exist', async () => {
  assert.equal((await createPost(createRequest())).status, 201)
  const request = new NextRequest('http://qa.invalid/api/production-imports/batch-1', {
    method: 'PATCH', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sheet: 'HDPE', state: 'PREPARED', sourceRows: [{ sourceRow: 4 }] }),
  })
  assert.equal((await patchSheet(request, { params: { id: 'batch-1' } })).status, 200)
  const claim = new NextRequest('http://qa.invalid/api/production-imports/batch-1', {
    method: 'PATCH', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sheet: 'HDPE', state: 'PROCESSING' }),
  })
  assert.equal((await patchSheet(claim, { params: { id: 'batch-1' } })).status, 409)
})

test('a stale uncertain sheet requires an explicit manager reconciliation before retry', async () => {
  assert.equal((await createPost(createRequest())).status, 201)
  const request = (body: Record<string, unknown>) => new NextRequest('http://qa.invalid/api/production-imports/batch-1', {
    method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
  const sourceRows = [{ sourceRow: 4 }]
  for (const sheet of STATISTICAL_REPORT_SHEETS) await patchSheet(request({ sheet, state: 'PREPARED', sourceRows }), { params: { id: 'batch-1' } })
  const claim = await patchSheet(request({ sheet: 'EXTRUDER', state: 'PROCESSING' }), { params: { id: 'batch-1' } })
  const staleToken = (await claim.json()).attemptToken as string
  savedSheets.EXTRUDER.updatedAt = new Date(Date.now() - 16 * 60 * 1000)
  const reconciled = await patchSheet(request({ sheet: 'EXTRUDER', state: 'RECONCILE_FAILED', result: { message: 'not written' } }), { params: { id: 'batch-1' } })
  assert.equal(reconciled.status, 200)
  assert.equal(savedSheets.EXTRUDER.status, 'FAILED')
  assert.equal((await patchSheet(request({ sheet: 'EXTRUDER', state: 'CONFIRMED', attemptToken: staleToken }), { params: { id: 'batch-1' } })).status, 409)
  assert.equal((await patchSheet(request({ sheet: 'EXTRUDER', state: 'PROCESSING' }), { params: { id: 'batch-1' } })).status, 200)
})
