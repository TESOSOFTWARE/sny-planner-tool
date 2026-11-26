import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test, { after, before, beforeEach } from 'node:test'
import { NextRequest } from 'next/server'
import * as XLSX from 'xlsx'
import { withTestSession } from '@/lib/auth/testSession'
import { parseStagePlanWorkbook } from '@/lib/excel/parseStagePlanWorkbook'

const batches = new Map<string, Record<string, unknown>>()
let savedRows: Record<string, unknown>[] = []
let batchCreates = 0
const batchStore = {
  findUnique: async ({ where }: { where: { fileHash_profile_scopeKey: { fileHash: string; profile: string; scopeKey: string } } }) => {
    const key = `${where.fileHash_profile_scopeKey.fileHash}|${where.fileHash_profile_scopeKey.profile}|${where.fileHash_profile_scopeKey.scopeKey}`
    const batch = batches.get(key)
    return batch ? { ...batch, rows: savedRows.filter(row => row.batchId === batch.id).map((_, index) => ({ id: `stage-row-${index + 1}` })) } : null
  },
  create: async ({ data }: { data: Record<string, unknown> }) => {
    batchCreates += 1
    const batch = { ...data, id: `stage-batch-${batchCreates}`, createdAt: new Date('2026-11-25T00:00:00Z'), confirmedAt: new Date('2026-11-25T00:00:00Z') }
    const key = `${data.fileHash}|${data.profile}|${data.scopeKey}`
    batches.set(key, batch)
    return batch
  },
}
const rowStore = {
  createMany: async ({ data }: { data: Record<string, unknown>[] }) => { savedRows.push(...data); return { count: data.length } },
}
const fake = {
  productionStagePlanImportBatch: batchStore,
  productionStagePlanImportRow: rowStore,
  $transaction: async (callback: (client: unknown) => unknown) => callback(fake),
}
const singleton = globalThis as unknown as { prisma: unknown }
const previous = singleton.prisma
let confirm: typeof import('./confirm/route').POST
let preview: typeof import('./route').POST

before(async () => {
  singleton.prisma = fake
  preview = withTestSession((await import('./route')).POST, fake)
  confirm = withTestSession((await import('./confirm/route')).POST, fake)
})
after(() => { singleton.prisma = previous })
beforeEach(() => { batches.clear(); savedRows = []; batchCreates = 0 })

function workbookBuffer(sourceValue = 'STOP', rowCount = 1) {
  // A tiny, sanitized EXTRUDER month workbook: one machine/order and one source value.
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    [null, '`', 'EXTRUDER WORKING INSTRUCTION'],
    [null, null, 'No.', 'ORDER', 'Color', 'M.B', 'Gauge', 'Denier', 'UV', 'FR', 'IR', 'NHỰA MF', 'NHỰA UV 4%', 'TÁI CHẾ', '1-Jan'],
    [null, 'NO 1'],
    ...Array.from({ length: rowCount }, (_, index) => [null, null, index + 1, `PI-TEST-${String(index + 1).padStart(3, '0')}`, 'BLACK', 'MB-01', 18.5, 275, 2, null, null, 8, 8, null, sourceValue]),
  ]), '1.2023')
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}

function expectedSnapshot(buffer: Buffer) {
  const parsed = parseStagePlanWorkbook(buffer, 'EXTRUDER 2023.xlsx', 'extruder-machine', '1.2023')
  const fileHash = createHash('sha256').update(buffer).digest('hex')
  return createHash('sha256').update(JSON.stringify({ fileHash, profile: parsed.profile, scopeKey: parsed.scopeKey, rows: parsed.rows })).digest('hex')
}

function confirmRequest(buffer: Buffer, snapshot: string) {
  const form = new FormData()
  const fileBytes = new Uint8Array(buffer.byteLength)
  fileBytes.set(buffer)
  form.set('file', new File([fileBytes.buffer], 'EXTRUDER 2023.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  form.set('profile', 'extruder-machine')
  form.set('sheet', '1.2023')
  form.set('expectedSnapshot', snapshot)
  return new NextRequest('http://qa.invalid/api/schedule/plan-import/confirm', { method: 'POST', body: form })
}

function previewRequest(buffer: Buffer, profile = 'extruder-machine', sheet?: string) {
  const fileBytes = new Uint8Array(buffer.byteLength)
  fileBytes.set(buffer)
  const form = new FormData()
  form.set('file', new File([fileBytes.buffer], 'EXTRUDER 2023.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  form.set('profile', profile)
  if (sheet) form.set('sheet', sheet)
  return new NextRequest('http://qa.invalid/api/schedule/plan-import', { method: 'POST', body: form })
}

test('preview lists available month sheets without writing plan rows', async () => {
  const response = await preview(previewRequest(workbookBuffer()))
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.needsSheetSelection, true)
  assert.ok(body.availableSheets.includes('1.2023'))
  assert.equal(savedRows.length, 0)
  assert.equal(batchCreates, 0)
})

test('preview returns full-workbook dated counts while capping the returned sample', async () => {
  const response = await preview(previewRequest(workbookBuffer('STOP', 205), 'extruder-machine', '1.2023'))
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.totalRows, 205)
  assert.equal(body.datedCount, 205)
  assert.equal(body.undatedCount, 0)
  assert.equal(body.rows.length, 200)
  assert.equal(body.previewTruncated, true)
  assert.equal(batchCreates, 0)
})

test('confirm revalidates the parsed snapshot and stores raw plan rows once', async () => {
  const buffer = workbookBuffer(), snapshot = expectedSnapshot(buffer)
  const first = await confirm(confirmRequest(buffer, snapshot))
  assert.equal(first.status, 201)
  assert.equal(batchCreates, 1)
  assert.equal(savedRows.length, 1)
  assert.equal(savedRows[0].orderRef, 'PI-TEST-001')

  const retry = await confirm(confirmRequest(buffer, snapshot))
  assert.equal(retry.status, 200)
  assert.equal((await retry.json()).existing, true)
  assert.equal(batchCreates, 1)
  assert.equal(savedRows.length, 1)
})

test('corrected source content creates a new revision and retains the previous one', async () => {
  const original = workbookBuffer('STOP')
  const changed = workbookBuffer('700+700')
  assert.equal((await confirm(confirmRequest(original, expectedSnapshot(original)))).status, 201)
  assert.equal((await confirm(confirmRequest(changed, expectedSnapshot(changed)))).status, 201)
  assert.equal(batchCreates, 2)
  assert.equal(batches.size, 2)
  assert.equal(savedRows.length, 2)
  assert.deepEqual(savedRows.map(row => (row.displayData as Record<string, unknown>).sourceValue), ['STOP', '700+700'])
})

test('confirm rejects a stale preview snapshot before opening a database transaction', async () => {
  const response = await confirm(confirmRequest(workbookBuffer(), 'stale-preview'))
  assert.equal(response.status, 409)
  assert.equal(batchCreates, 0)
  assert.equal(savedRows.length, 0)
})
