import test from 'node:test'
import assert from 'node:assert/strict'
import * as XLSX from 'xlsx'
import { parseMaterialReportHistory } from './parseMaterialReport'
import { reportPeriodLabel } from '../../components/materials/MaterialReportsModal'

function fixture(label: string): Buffer {
  const rows = [
    [null, 'RAW MATERIAL STOCK LIST'],
    [null, null, null, null, null, null, null, null, null, label],
    [null, 'NO.', 'MAIN RAW MATERIAL', null, null, null, null, null, 'FISRT STOCK', 'IN', 'HDPE BROKEN', 'OUT TAPE', 'REJECT', 'OUT USEING', 'LAST STOCK'],
    [null, 1, 'CODE', 'Virgin', null, null, null, null, 100, 5, 2, 3, 4, 10, 92],
  ]
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), 'HDPE')
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}

test('three-day label is one period preserving the original label and bounds', () => {
  const rows = parseMaterialReportHistory(fixture('09+10+11/10/2026'))
  assert.equal(rows.length, 1)
  assert.equal(rows[0].reportDate, '2026-10-09')
  assert.equal(rows[0].reportPeriodEnd, '2026-10-11')
  assert.equal(rows[0].sourceDateLabel, '09+10+11/10/2026')
})
test('two-day period retains previous semantics', () => {
  const row = parseMaterialReportHistory(fixture('03+04/10/2026'))[0]
  assert.equal(row.reportDate, '2026-10-03')
  assert.equal(row.reportPeriodEnd, '2026-10-04')
  assert.equal(row.sourceDateLabel, '03+04/10/2026')
})
test('invalid, repeated, decreasing or nonexistent dates are rejected', () => {
  for (const label of ['11+10/10/2026', '30+31+32/10/2026', '09+09/10/2026', '00+01/10/2026', '28+29/02/2026']) {
    assert.throws(() => parseMaterialReportHistory(fixture(label)), /Không tìm thấy ngày hợp lệ/)
  }
})
test('period label displays the original three-day label', () => {
  const row = parseMaterialReportHistory(fixture('09+10+11/10/2026'))[0]
  assert.equal(reportPeriodLabel(row.reportDate, row), '09+10+11/10/2026')
})
