import assert from 'node:assert/strict'
import test from 'node:test'
import * as XLSX from 'xlsx'
import { parseExtruderReport } from './parseExtruderReport'

function workbook(): Buffer {
  const serial = Math.floor((Date.UTC(2026, 10, 1) - Date.UTC(1899, 11, 30)) / 86_400_000)
  const rows: unknown[][] = [
    ['SNY VINA CO.,LTD.'],
    [null, serial],
    ['1st EXTRUDER MACHINE'],
    ['NO', 'COLOR', 'DENIER', 'WEIGHT', 'TOTAL', 'REMARK', null],
    ['D', 'BLUE', 24, 10, 10, '10 BEAM (40 STRAND)', 'PI-1'],
    ['N', '', 24, 'not-a-number', null, '8 BEAM (32 STRAND)', 'PI-1'],
  ]
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), 'EXTRUDER')
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}

function mergedRemarkWorkbook(options: { startAtRow?: number; piInRemarkColumn?: boolean } = {}): Buffer {
  const serial = Math.floor((Date.UTC(2026, 10, 1) - Date.UTC(1899, 11, 30)) / 86_400_000)
  const code = 'ALROBOO26-8+9'
  const startAtRow = options.startAtRow ?? 0
  const piColumn = options.piInRemarkColumn ? 6 : 7
  const rows: unknown[][] = [
    ...Array.from({ length: startAtRow }, () => [] as unknown[]),
    ['SNY VINA CO.,LTD.'],
    [null, serial],
    ['1st EXTRUDER MACHINE'],
    ['NO', 'COLOR', null, 'DENIER', 'WEIGHT', 'TOTAL', 'REMARK', null],
    ['D', 'BLUE', null, 24, 10, 10, options.piInRemarkColumn ? code : '10 BEAM (40 STRAND)', options.piInRemarkColumn ? null : code],
    ['N', 'BLUE', null, 24, 8, 18, options.piInRemarkColumn ? null : '8 BEAM (32 STRAND)', null],
    ['D', 'RED', null, 24, 7, 25, '7 BEAM (28 STRAND)', null],
  ]
  const book = XLSX.utils.book_new()
  const sheet = XLSX.utils.aoa_to_sheet(rows)
  sheet['!merges'] = [{ s: { r: startAtRow + 4, c: piColumn }, e: { r: startAtRow + 5, c: piColumn } }]
  XLSX.utils.book_append_sheet(book, sheet, 'EXTRUDER')
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}

test('invalid Extruder source line is retained with Excel row and raw weight', () => {
  const rows = parseExtruderReport(workbook())
  assert.equal(rows.length, 2)
  assert.equal(rows[0].sourceRow, 5)
  assert.equal(rows[0].isValid, true)
  assert.equal(rows[1].sourceRow, 6)
  assert.equal(rows[1].sourceWeight, 'not-a-number')
  assert.equal(rows[1].isValid, false)
  assert.deepEqual(rows[1].validationErrors, ['Thiếu COLOR', 'WEIGHT thiếu hoặc không phải số'])
})

test('merged EXTRUDER PI remark is carried only through its merge range and plus code stays intact', () => {
  const rows = parseExtruderReport(mergedRemarkWorkbook())
  assert.equal(rows.length, 3)
  assert.equal(rows[0].orderRef, 'ALROBOO26-8+9')
  assert.equal(rows[1].orderRef, 'ALROBOO26-8+9')
  assert.ok(rows[1].sourceOrderRefs?.includes('ALROBOO26-8+9'))
  assert.equal(rows[2].orderRef, null)
  assert.equal(rows[2].beamNote, '7 BEAM (28 STRAND)')
})

test('merged PI in the REMARK column uses absolute worksheet row and column coordinates', () => {
  const buffer = mergedRemarkWorkbook({ startAtRow: 2, piInRemarkColumn: true })
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  assert.equal(workbook.Sheets.EXTRUDER['!ref'], 'A3:H9')
  const rows = parseExtruderReport(buffer)
  assert.equal(rows.length, 3)
  assert.equal(rows[0].sourceRow, 7)
  assert.equal(rows[1].sourceRow, 8)
  assert.equal(rows[0].orderRef, 'ALROBOO26-8+9')
  assert.equal(rows[1].orderRef, 'ALROBOO26-8+9')
  assert.equal(rows[2].orderRef, null)
})
