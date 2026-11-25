import { withTestSession } from '@/lib/auth/testSession'
// 1810-07: real parser and both POST handlers, synthetic files, fake Prisma only.
import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import * as XLSX from 'xlsx'
import { NextRequest } from 'next/server'
import { parseRollingReport, RollingDateConflictError } from '@/lib/excel/parseRollingReport'
import { rollingImportSnapshot } from '@/lib/materials/rollingImportSnapshot'

const fileName = 'QA ROLLING 05-2026.xlsx', period = { month: 5, year: 2026 }
function workbook(labels: string[], values: unknown[], extraRow?: unknown[]) {
  const rows: unknown[][] = [['QA report'], [], [], [], [], [1, 'QA-CUSTOMER', 'BLUE', 2, 100, 50]]
  labels.forEach((label, index) => {
    const col = 6 + index * 8
    rows[3][col] = label; rows[4][col] = 'QUANTITY SMALL'; rows[5][col] = values[index]
    if (extraRow) { rows[6] ??= [2, 'OTHER-CUSTOMER', 'RED', 2, 100, 50]; rows[6][col] = extraRow[index] }
  })
  const sheet = XLSX.utils.aoa_to_sheet(rows)
  sheet['!merges'] = labels.map((_, index) => ({ s: { r: 3, c: 6 + index * 8 }, e: { r: 3, c: 13 + index * 8 } }))
  const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, sheet, 'ROLLING')
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}
function conflict(labels: string[], values: (number | null)[], expectedDay: string) {
  assert.throws(() => parseRollingReport(workbook(labels, values), fileName), error => {
    assert.ok(error instanceof RollingDateConflictError)
    assert.match(error.message, new RegExp(expectedDay))
    assert.match(error.message, /cột G–N/); assert.match(error.message, /cột O–V/)
    return true
  })
}
test('1810-07 same populated day reports date and both column ranges', () => conflict(['13th', '13th'], [10, 20], '13/05/2026'))
test('1810-07 overlapping combined label detects its second day too', () => conflict(['11+12th', '12th'], [10, 20], '12/05/2026'))
test('1810-07 overlap of two populated combined blocks is rejected', () => conflict(['9+10th', '10+11th'], [10, 20], '10/05/2026'))
test('1810-07 empty or zero-only repeated template block is harmless', () => {
  for (const value of [null, 0]) {
    const result = parseRollingReport(workbook(['13th', '13th'], [10, value]), fileName)
    assert.equal(result.metrics.length, 1); assert.equal(result.metrics[0].metricValue, 10)
  }
})
test('1810-07 blocks populated in different source rows still conflict', () => {
  assert.throws(() => parseRollingReport(workbook(['13th', '13th'], [10, null], [null, 20]), fileName), RollingDateConflictError)
})
test('1810-07 non-overlapping combined blocks retain raw labels and the existing first-date mapping', () => {
  const result = parseRollingReport(workbook(['9+10th', '11+12th'], [10, 20]), fileName)
  assert.deepEqual(result.metrics.map(row => [row.date, row.dateLabelRaw, row.metricValue]), [['2026-05-09', '9+10th', 10], ['2026-05-11', '11+12th', 20]])
})
test('1810-07 populated 31+1 cross-month block is rejected instead of assigned only to day 31', () => {
  const result = parseRollingReport(workbook(['1st', '31th+1th'], [10, 20]), fileName)
  assert.equal(result.metrics.length, 1)
  assert.equal(result.dateBlockMappings[1].isoDate, null)
  assert.equal(result.dateBlockMappings[1].hasData, true)
})

let reads = 0, writes = 0
const metric = {
  findMany: async () => { reads++; return [] },
  deleteMany: async () => { writes++; return { count: 0 } },
  createMany: async ({ data }: { data: unknown[] }) => { writes++; return { count: data.length } },
}
const fake = { productionOrder: { findMany: async () => { reads++; return [] } }, rollingDailyMetric: metric, $transaction: async (run: (tx: { rollingDailyMetric: typeof metric; $executeRaw: () => Promise<number> }) => unknown) => run({ rollingDailyMetric: metric, $executeRaw: async () => 0 }) }
const singleton = globalThis as unknown as { prisma: unknown }, previous = singleton.prisma
let preview: typeof import('./import/route').POST, confirm: typeof import('./import/confirm/route').POST
before(async () => { singleton.prisma = fake; preview = withTestSession((await import('./import/route')).POST, singleton.prisma); confirm = withTestSession((await import('./import/confirm/route')).POST, singleton.prisma) })
after(() => { singleton.prisma = previous })
function request(buffer: Buffer, selectedPeriod = period) {
  const form = new FormData()
  form.append('file', new Blob([Uint8Array.from(buffer).buffer]), fileName)
  form.append('month', String(selectedPeriod.month)); form.append('year', String(selectedPeriod.year))
  // A valid snapshot must not authorize a file with overlapping populated blocks.
  form.append('expectedSnapshot', rollingImportSnapshot(buffer, selectedPeriod))
  return new NextRequest('http://qa.invalid/rolling/import', { method: 'POST', body: form })
}
test('1810-07 populated invalid date block is listed in preview and blocks confirmation', async () => {
  const invalidPeriod = { month: 4, year: 2026 }
  const buffer = workbook(['31th'], [10])
  reads = 0; writes = 0
  const pre = await preview(request(buffer, invalidPeriod))
  assert.equal(pre.status, 200)
  const previewBody = await pre.json()
  assert.equal(previewBody.skippedDateBlocks[0].hasData, true)
  assert.equal(previewBody.skippedDateBlocks[0].blocked, true)
  reads = 0; writes = 0
  const saved = await confirm(request(buffer, invalidPeriod))
  assert.equal(saved.status, 422)
  assert.equal(reads, 0); assert.equal(writes, 0)
})
test('1810-07 invalid numeric values are listed and block scoped replacement', async () => {
  const buffer = workbook(['13th'], [-2])
  reads = 0; writes = 0
  const pre = await preview(request(buffer))
  assert.equal(pre.status, 200)
  const previewBody = await pre.json()
  assert.equal(previewBody.invalidMetricCount, 1)
  assert.equal(previewBody.rows.at(-1).isValid, false)
  reads = 0; writes = 0
  const saved = await confirm(request(buffer))
  assert.equal(saved.status, 422)
  assert.equal(reads, 0); assert.equal(writes, 0)
})
for (const labels of [['13th', '13th'], ['11+12th', '12th']]) {
  test(`1810-07 preview and direct confirm reject ${labels.join('/')} before any DB call`, async () => {
    reads = 0; writes = 0
    for (const run of [preview, confirm]) {
      const response = await run(request(workbook(labels, [10, 20])))
      assert.equal(response.status, 422)
      const body = await response.json()
      assert.equal(body.success, false); assert.match(body.error, /cột G–N.*cột O–V/)
    }
    assert.equal(reads, 0); assert.equal(writes, 0)
  })
}
test('1810-07 valid preview and confirm still work after rejected confirms release the mutex', async () => {
  reads = 0; writes = 0
  const response = await preview(request(workbook(['13th', '14th'], [10, 20])))
  assert.equal(response.status, 200)
  const previewBody = await response.json()
  assert.equal(previewBody.totalMetrics, 2)
  assert.equal(previewBody.rows.length, 2)
  assert.deepEqual(previewBody.rows.map((row: { metricValue: number }) => row.metricValue), [10, 20])
  assert.equal(previewBody.sampleRows.length, 2)
  assert.ok(reads > 0); assert.equal(writes, 0)
  const saved = await confirm(request(workbook(['13th', '14th'], [10, 20])))
  assert.equal(saved.status, 200)
  assert.equal((await saved.json()).recordsInserted, 2)
  assert.equal(writes, 2) // fake delete/create only; no database connection exists.
})
