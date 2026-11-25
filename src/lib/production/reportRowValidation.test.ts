import assert from 'node:assert/strict'
import test from 'node:test'
import { invalidReportOutputRows } from './reportRowValidation'

test('invalid production rows keep source row and reasons and never become zero-output data', () => {
  assert.deepEqual(invalidReportOutputRows([
    { sourceRow: 18, color: '', weightKgs: 0, sourceWeight: 'bad', isValid: false, validationErrors: ['WEIGHT thiếu hoặc không phải số'] },
    { sourceRow: 19, color: 'BLUE', weightKgs: -4, isValid: false, validationErrors: ['WEIGHT không được âm'] },
    { sourceRow: 20, color: 'BLACK', weightKgs: 0, isValid: true, validationErrors: [] },
  ]), [
    { sourceRow: 18, reasons: ['WEIGHT thiếu hoặc không phải số', 'Thiếu COLOR', 'WEIGHT nguồn không phải số'] },
    { sourceRow: 19, reasons: ['WEIGHT không được âm'] },
  ])
})
