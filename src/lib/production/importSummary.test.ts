import assert from 'node:assert/strict'
import test from 'node:test'
import { publicImportResult, publicImportSheetResults } from './importSummary'

test('public import summaries retain counts but omit HDPE material-level stock details', () => {
  const value = publicImportSheetResults({
    HDPE: { status: 'CONFIRMED', updatedAt: '2026-11-20T00:00:00Z', result: { message: '5 vật tư', created: 5, counts: { new: 5 }, stockUpdated: [{ materialId: 'material-secret', name: 'HDPE A', to: 100 }], stockKept: [{ materialId: 'material-secret', name: 'HDPE A' }] } },
    EXTRUDER: { status: 'CONFIRMED', result: { recordsInserted: 42, receiptSecret: 'internal' } },
  })
  assert.deepEqual(value.HDPE?.result, { created: 5, counts: { new: 5 } })
  assert.deepEqual(value.EXTRUDER?.result, { recordsInserted: 42 })
})

test('public single-sheet receipt uses the same stock-detail allowlist', () => {
  assert.deepEqual(publicImportResult({ recordsInserted: 4, stockUpdated: [{ name: 'private' }] }), { recordsInserted: 4 })
})
