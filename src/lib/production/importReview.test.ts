import assert from 'node:assert/strict'
import test from 'node:test'
import { STATISTICAL_REPORT_SHEETS, summarizeImportRows } from './importReview'
import { reportSheetMatches } from '@/lib/excel/reportSheetMatches'

test('statistical import uses the five named source sheets', () => {
  assert.deepEqual(STATISTICAL_REPORT_SHEETS, ['HDPE', 'EXTRUDER', 'WARPING', 'KNITTING', 'ROLLING'])
  const workbookSheets = ['HDPE KO SỬ DỤNG', 'HDPE ', 'EXTRUDER', 'WARPING', 'KNITTING', 'ROLLING ', 'SẢN LƯỢNG ĐÓNG GÓI']
  const selected = STATISTICAL_REPORT_SHEETS.filter(sheet => workbookSheets.some(name => reportSheetMatches(name, sheet)))
  assert.deepEqual(selected, ['HDPE', 'EXTRUDER', 'WARPING', 'KNITTING', 'ROLLING'])
  assert.equal(reportSheetMatches('ROLLING OLD', 'ROLLING'), false)
  assert.equal(reportSheetMatches('ROLLING ', 'ROLLING'), true)
})

test('review summarizes dates, invalid rows, and PI rows without inventing item links', () => {
  const result = summarizeImportRows([
    { reportDate: '2026-11-01T00:00:00.000Z', orderRef: 'PI-1', orderId: 'line-1' },
    { date: '2026-11-02', orderRef: 'PI-2', orderId: null },
    { reportDate: '2026-10-31', isValid: false, validationErrors: ['bad value'] },
    { reportDate: new Date('2026-11-03T00:00:00.000Z'), materialName: 'HDPE' },
    { reportDate: '2026-11-04', reportPeriodEnd: '2026-12-01', materialName: 'HDPE' },
    { reportDate: 'not-a-date', orderRef: null, sourceOrderRefs: ['PI-3'] },
  ], '2026-11')

  assert.equal(result.totalRows, 6)
  assert.equal(result.invalidRows, 1)
  assert.equal(result.sourceRowsWithPI, 3)
  assert.equal(result.rowsLinkedToItem, 1)
  assert.equal(result.rowsNotLinkedToItem, 1)
  assert.equal(result.rowsPendingItemResolution, 1)
  assert.deepEqual(result.dates, ['2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-12-01'])
  assert.deepEqual(result.outOfPeriodDates, ['2026-10-31', '2026-12-01'])
})
