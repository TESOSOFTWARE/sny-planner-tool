import { withTestSession } from '@/lib/auth/testSession'
import test, { before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { NextRequest } from 'next/server'
import * as XLSX from 'xlsx'

function workbook(): Buffer {
  const data: unknown[][] = [[null, 'RAW MATERIAL STOCK LIST'], [null, null, null, null, null, null, null, null, null, 46319], [null, 'NO.', 'MAIN RAW MATERIAL', null, null, null, null, null, 'FISRT STOCK', 'IN', 'HDPE BROKEN', 'OUT TAPE', 'REJECT', 'OUT USEING', 'LAST STOCK'], [null, 1, 'MF', null, null, null, null, null, 100, 20, 0, 0, 0, 10, 110]]
  const sheet = XLSX.utils.aoa_to_sheet(data)
  sheet.J2.z = 'dd/mm/yyyy'
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, sheet, 'HDPE')
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}
type Snapshot = { materialId: string; reportDate: Date; payload: unknown; contentHash?: string; version?: number }
let snapshots: Snapshot[] = []
let manual: Array<{ id: string; materialId: string; txDate: Date }> = []
let updates: unknown[] = []
let materials = [{ id: 'm1', name: 'MF', group: 'HDPE', currentStock: 90, stockReportDate: new Date('2026-05-14Z') as Date | null, stockReportDirty: false }]
const tx = {
  $executeRawUnsafe: async () => undefined,
  material: {
    findMany: async () => materials,
    create: async ({ data }: { data: { name: string; group: string; currentStock: number; stockReportDate: null; stockReportDirty: boolean } }) => { const value = { ...data, id: 'new1' }; materials.push(value); return value },
    update: async (input: unknown) => { updates.push(input); return {} },
  },
  materialTransaction: { findMany: async () => manual },
  materialReportSnapshot: {
    findMany: async () => snapshots,
    createMany: async ({ data }: { data: Snapshot[] }) => { snapshots.push(...data); return { count: data.length } },
    update: async ({ where, data }: { where: { materialId_reportDate: { materialId: string; reportDate: Date } }; data: Record<string, unknown> }) => {
      const row = snapshots.find(snapshot => snapshot.materialId === where.materialId_reportDate.materialId && snapshot.reportDate.getTime() === where.materialId_reportDate.reportDate.getTime())
      if (!row) throw new Error('snapshot missing')
      Object.assign(row, data)
      return row
    },
  },
}
const fake = { ...tx, $transaction: async (fn: (client: typeof tx) => Promise<unknown>) => {
  const oldSnapshots = [...snapshots], oldUpdates = [...updates]
  try { return await fn(tx) } catch (error) { snapshots = oldSnapshots; updates = oldUpdates; throw error }
} }
const singleton = globalThis as unknown as { prisma: unknown }, old = singleton.prisma
let preview: typeof import('./route').POST
let confirm: typeof import('./confirm/route').POST
before(async () => { singleton.prisma = fake; preview = withTestSession((await import('./route')).POST, singleton.prisma); confirm = withTestSession((await import('./confirm/route')).POST, singleton.prisma) })
after(() => { singleton.prisma = old })
beforeEach(() => { snapshots = []; manual = []; updates = []; materials = [{ id: 'm1', name: 'MF', group: 'HDPE', currentStock: 90, stockReportDate: new Date('2026-05-14Z'), stockReportDirty: false }] })
function request(hash?: string, resolutions?: string): NextRequest {
  const body = new FormData()
  body.append('file', new Blob([new Uint8Array(workbook())]), 'report.xlsx')
  if (hash) body.append('expectedSnapshot', hash)
  if (resolutions) body.append('resolutions', resolutions)
  return new NextRequest('http://localhost/api/materials/import-history', { method: 'POST', body })
}
test('preview is read only; confirm writes snapshot and stock', async () => {
  const pre = await preview(request())
  assert.equal(pre.status, 200)
  const body = await pre.json()
  assert.equal(body.counts.new, 1)
  assert.equal(body.rows.length, 1)
  assert.equal(body.rows[0].sourceRow, 4)
  assert.equal(snapshots.length, 0)
  assert.equal(updates.length, 0)
  const result = await confirm(request(body.expectedSnapshot))
  assert.equal(result.status, 200, JSON.stringify(await result.clone().json()))
  assert.equal((await result.json()).created, 1)
  assert.equal(snapshots.length, 1)
  assert.equal(updates.length, 1)
})
test('corrected material/date payload updates one snapshot version instead of creating a duplicate', async () => {
  const oldPayload = { materialName: 'MF', firstStock: 100, inQty: 20, outUsing: 10, outBroken: 0, outTape: 0, outReject: 0, lastStock: 110 }
  snapshots = [{ materialId: 'm1', reportDate: new Date('2026-04-04Z'), payload: oldPayload, contentHash: 'old', version: 1 }]
  const correctedRow = [[null, 'RAW MATERIAL STOCK LIST'], [null, null, null, null, null, null, null, null, null, 46116], [null, 'NO.', 'MAIN RAW MATERIAL', null, null, null, null, null, 'FISRT STOCK', 'IN', 'HDPE BROKEN', 'OUT TAPE', 'REJECT', 'OUT USEING', 'LAST STOCK'], [null, 1, 'MF', null, null, null, null, null, 100, 20, 0, 0, 0, 10, 125]]
  const sheet = XLSX.utils.aoa_to_sheet(correctedRow)
  sheet.J2.z = 'dd/mm/yyyy'
  const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, sheet, 'HDPE')
  const corrected = XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer
  const form = new FormData(); form.append('file', new Blob([new Uint8Array(corrected)]), 'report.xlsx'); form.append('month', '4'); form.append('year', '2026')
  const pre = await preview(new NextRequest('http://qa.invalid/materials/import-history', { method: 'POST', body: form }))
  const previewBody = await pre.json()
  assert.equal(pre.status, 200)
  assert.equal(previewBody.counts.updated, 1)
  const resultForm = new FormData(); resultForm.append('file', new Blob([new Uint8Array(corrected)]), 'report.xlsx'); resultForm.append('expectedSnapshot', previewBody.expectedSnapshot); resultForm.append('month', '4'); resultForm.append('year', '2026')
  const result = await confirm(new NextRequest('http://qa.invalid/materials/import-history/confirm', { method: 'POST', body: resultForm }))
  assert.equal(result.status, 200, JSON.stringify(await result.clone().json()))
  assert.equal((await result.json()).updated, 1)
  assert.equal(snapshots.length, 1)
  assert.equal(snapshots[0].version, 2)
  assert.equal((snapshots[0].payload as Record<string, unknown>).lastStock, 125)
})
test('manual transaction created after preview rejects stale confirmation', async () => {
  const pre = await preview(request()), body = await pre.json()
  manual.push({ id: 't1', materialId: 'm1', txDate: new Date('2026-10-01Z') })
  const result = await confirm(request(body.expectedSnapshot))
  assert.equal(result.status, 409)
  assert.equal((await result.json()).code, 'STALE_PREVIEW')
  assert.equal(snapshots.length, 0)
  assert.equal(updates.length, 0)
})
test('no baseline preserves existing stock while writing history', async () => {
  materials[0].stockReportDate = null
  const pre = await preview(request()), body = await pre.json()
  assert.equal(body.stockKept[0].reason, 'no_report_baseline')
  const result = await confirm(request(body.expectedSnapshot))
  assert.equal(result.status, 200)
  assert.equal(snapshots.length, 1)
  assert.equal(updates.length, 0)
})

test('explicit create writes material, snapshots and stock', async () => {
  materials = []
  const resolutions = JSON.stringify({ '["HDPE","MF"]': { action: 'create' } })
  const pre = await preview(request(undefined, resolutions)), body = await pre.json()
  assert.equal(body.counts.new, 1)
  const result = await confirm(request(body.expectedSnapshot, resolutions))
  assert.equal(result.status, 200, JSON.stringify(await result.clone().json()))
  assert.equal((await result.json()).materialsCreated, 1)
  assert.equal(materials.length, 1)
  assert.equal(snapshots[0].materialId, 'new1')
  assert.equal(updates.length, 1)
})
test('changing resolution after preview is stale', async () => {
  materials = []
  const pre = await preview(request()), body = await pre.json()
  const resolutions = JSON.stringify({ '["HDPE","MF"]': { action: 'create' } })
  const result = await confirm(request(body.expectedSnapshot, resolutions))
  assert.equal(result.status, 409)
  assert.equal(materials.length, 0)
})
