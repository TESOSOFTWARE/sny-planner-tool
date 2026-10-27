import test from 'node:test'
import assert from 'node:assert/strict'
import { periodsOverlap, stockKeepReason } from './monthlyImportRules'

test('detects overlapping inclusive periods', () => {
  assert.equal(periodsOverlap({ start: '2026-10-23', end: '2026-10-25' }, { start: '2026-10-24', end: '2026-10-24' }), true)
  assert.equal(periodsOverlap({ start: '2026-10-23', end: '2026-10-25' }, { start: '2026-10-26', end: '2026-10-26' }), false)
})
test('preserves manually entered stock with no baseline', () => {
  assert.equal(stockKeepReason({ stockReportDate: null, stockReportDirty: false, lastManualTx: null, newlyCreated: false }), 'no_report_baseline')
})
test('manual transaction takes precedence over missing baseline', () => {
  assert.equal(stockKeepReason({ stockReportDate: null, stockReportDirty: false, lastManualTx: '2026-10-01', newlyCreated: false }), 'manual_tx')
})
test('retains dirty stock and permits newly created material', () => {
  assert.equal(stockKeepReason({ stockReportDate: '2026-05-14', stockReportDirty: true, lastManualTx: null, newlyCreated: false }), 'manual_stock_edit')
  assert.equal(stockKeepReason({ stockReportDate: null, stockReportDirty: false, lastManualTx: null, newlyCreated: true }), null)
})

test('resolution parsing rejects malformed actions and sorts keys', async () => {
  const { parseResolutions } = await import('./reportHistoryImport')
  assert.deepEqual(parseResolutions(null), {})
  assert.deepEqual(Object.keys(parseResolutions('{"z":{"action":"skip"},"a":{"action":"create"}}')), ['a', 'z'])
  assert.throws(() => parseResolutions('{"x":{"action":"map"}}'), /không hợp lệ/)
})
