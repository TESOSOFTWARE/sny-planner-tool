import assert from 'node:assert/strict'
import test from 'node:test'
import * as XLSX from 'xlsx'
import { parseStagePlanWorkbook } from './parseStagePlanWorkbook'

function bufferFor(rows: unknown[][], name: string, merges?: XLSX.Range[], date1904 = false) {
  const workbook = XLSX.utils.book_new()
  workbook.Workbook = { WBProps: { date1904 } }
  const sheet = XLSX.utils.aoa_to_sheet(rows)
  if (merges) sheet['!merges'] = merges
  XLSX.utils.book_append_sheet(workbook, sheet, name)
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}

test('EXTRUDER machine profile keeps composite plan text verbatim by machine/date', () => {
  const parsed = parseStagePlanWorkbook(bufferFor([
    [null, '`', 'EXTRUDER WORKING INSTRUCTION'],
    [null, null, 'No.', 'ORDER', 'Color', 'M.B', 'Gauge', 'Denier', 'UV', 'FR', 'IR', 'NHỰA MF', 'NHỰA UV 4%', 'TÁI CHẾ', '1-Jan', '2-Jan'],
    [null, 'NO 1'],
    [null, null, 1, 'PI-01', 'BLACK', 'MB-01', 18.5, 275, 2, null, null, 8, 8, null, '700+700', 'STOP'],
  ], '1.2023'), 'EXTRUDER 2023.xlsx', 'extruder-machine', '1.2023')
  assert.equal(parsed.stage, 'extruder')
  assert.equal(parsed.scopeKey, '2023-01')
  assert.equal(parsed.rows.length, 2)
  assert.equal(parsed.rows[0].machineLabel, 'NO 1')
  assert.equal(parsed.rows[0].displayData.sourceValue, '700+700')
  assert.equal(parsed.rows[1].displayData.sourceValue, 'STOP')
})

test('EXTRUDER profile asks the manager to select a month sheet before parsing rows', () => {
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['header']]), '1.2023')
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['header']]), '2.2023')
  const parsed = parseStagePlanWorkbook(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer, 'EXTRUDER 2023.xlsx', 'extruder-machine')
  assert.equal(parsed.needsSheetSelection, true)
  assert.deepEqual(parsed.availableSheets, ['1.2023', '2.2023'])
  assert.equal(parsed.rows.length, 0)
})

test('fiber demand matrix retains raw spec columns without inventing a unit', () => {
  const date = Math.floor((Date.UTC(2026, 3, 1) - Date.UTC(1899, 11, 30)) / 86_400_000)
  const parsed = parseStagePlanWorkbook(bufferFor([
    ['Date', 'GREEN 9199'],
    [null, '14.5 UV 0.2%'],
    [date, 467],
  ], 'APR'), 'CHI KÉO SỢI THANG 04-2026.xlsx', 'fiber-demand-matrix', 'APR', 2026)
  assert.equal(parsed.rows.length, 1)
  assert.equal(parsed.rows[0].planDate, '2026-04-01')
  assert.deepEqual((parsed.rows[0].displayData.products as Array<{ value: unknown }>).map(value => value.value), [467])
  assert.equal(parsed.rows[0].displayData.valueUnit, null)
})

test('fiber matrix distinguishes repeated source dates and reads the 1904 date system', () => {
  const date = Math.floor((Date.UTC(2026, 3, 1) - Date.UTC(1904, 0, 1)) / 86_400_000)
  const parsed = parseStagePlanWorkbook(bufferFor([
    ['Date', 'GREEN 9199'],
    [null, '14.5 UV 0.2%'],
    [date, 467],
    [date, 468],
  ], 'APR', undefined, true), 'CHI KEO SOI 2026.xlsx', 'fiber-demand-matrix', 'APR', 2026)
  assert.equal(parsed.rows.length, 2)
  assert.equal(parsed.rows[0].planDate, '2026-04-01')
  assert.notEqual(parsed.rows[0].sourceKey, parsed.rows[1].sourceKey)
})

test('invalid source dates are skipped instead of normalized into another month', () => {
  const parsed = parseStagePlanWorkbook(bufferFor([
    ['Date', 'GREEN 9199'],
    [null, '14.5 UV 0.2%'],
    ['31/02/2026', 467],
  ], 'APR'), 'CHI KEO SOI 2026.xlsx', 'fiber-demand-matrix', 'APR', 2026)
  assert.equal(parsed.rows.length, 0)
})

test('CC2018 work orders stay undated instead of being assigned a calendar date', () => {
  const parsed = parseStagePlanWorkbook(bufferFor([
    [null, null, 'PI-01'],
    [null, null, 'ORANGE FR 1.22M'],
    [null, null, null, 'WARPING WORK ORDER'],
    ['No', 'DENIOR', 'STRAND', 'COLOUR', 'WEAVING NO.', 'AMOUNT', 'BIM', 'WEIGHT (KG)', 'REMARK'],
    [1, 18.5, 146, 'ORANGE FR', 'NO. 1', '18 EA', 16, '16.5 KG', 'FRONT'],
  ], 'PI-01'), 'CC2018 ok.xlsb', 'warping-work-order')
  assert.equal(parsed.stage, 'warping')
  assert.equal(parsed.rows.length, 1)
  assert.equal(parsed.rows[0].planDate, null)
  assert.equal(parsed.rows[0].orderRef, 'PI-01')
  assert.ok(parsed.rows[0].warnings.length)
})

test('CC AQ work-order identifiers update for each block within the same sheet', () => {
  const parsed = parseStagePlanWorkbook(bufferFor([
    [null, null, 'AQ'],
    ['AQ 20-1', 'Mã'],
    [null, null, null, 'WARPING WORK ORDER'],
    ['No', 'DENIOR', 'STRAND', 'COLOUR', 'WEAVING NO.', 'AMOUNT', 'BIM', 'WEIGHT (KG)', 'REMARK'],
    [1, 18.5, 146, 'DARK GREEN UV 2%', '3', 10, 10, '20 KG', ''],
    [],
    ['AQ 20-2', 'Mã'],
    [null, null, null, 'WARPING WORK ORDER'],
    ['No', 'DENIOR', 'STRAND', 'COLOUR', 'WEAVING NO.', 'AMOUNT', 'BIM', 'WEIGHT (KG)', 'REMARK'],
    [1, 18.5, 146, 'DARK GREEN UV 2%', '3', 10, 10, '20 KG', ''],
  ], 'AQ'), 'cc AQ.xlsx', 'warping-work-order')

  assert.deepEqual(parsed.rows.map(row => row.orderRef), ['AQ 20-1', 'AQ 20-2'])
  assert.deepEqual(parsed.rows.map(row => row.displayData.orderRef), ['AQ 20-1', 'AQ 20-2'])
})

test('CC2018 parser supports binary XLSB workbooks and preserves source identifiers', () => {
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    [null, null, 'PI-02'],
    [null, null, 'GREEN NET'],
    [null, null, null, 'WARPING WORK ORDER'],
    ['No', 'DENIOR', 'STRAND', 'COLOUR', 'WEAVING NO.', 'AMOUNT', 'BIM', 'WEIGHT (KG)', 'REMARK'],
    [1, 20, 150, 'GREEN', 'M-003', 8, 3, 50, 'RAW NOTE'],
  ]), 'PI-02')
  const binary = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsb' }) as Buffer
  const parsed = parseStagePlanWorkbook(binary, 'CC2018 ok.xlsb', 'warping-work-order')
  assert.equal(parsed.rows.length, 1)
  assert.equal(parsed.rows[0].orderRef, 'PI-02')
  assert.equal((parsed.rows[0].displayData.fields as Record<string, unknown>).remark, 'RAW NOTE')
})

test('WARPING source date notes respect the workbook 1904 date system', () => {
  const date = Math.floor((Date.UTC(2026, 3, 1) - Date.UTC(1904, 0, 1)) / 86_400_000)
  const parsed = parseStagePlanWorkbook(bufferFor([
    [null, null, 'PI-03'],
    [null, null, 'GREEN NET'],
    [null, null, null, 'WARPING WORK ORDER'],
    ['No', 'DENIOR', 'STRAND', 'COLOUR', 'WEAVING NO.', 'AMOUNT', 'BIM', 'WEIGHT (KG)', 'REMARK'],
    [1, 18.5, 146, 'GREEN', 'NO. 1', '18 EA', 16, '16.5 KG', 'FRONT'],
    [],
    [],
    [null, null, null, null, null, null, null, null, null, null, null, date],
  ], 'PI-03', undefined, true), 'CC2018 1904.xlsx', 'warping-work-order')
  assert.equal(parsed.rows.length, 1)
  assert.equal(parsed.rows[0].displayData.sourceDateNote, '2026-04-01')
})

test('Pallet date mismatch is preserved as a warning and left unscheduled', () => {
  const parsed = parseStagePlanWorkbook(bufferFor([
    ['KẾ HOẠCH ĐÓNG PALLET'],
    [null, null, null, null, null, null, null, null, new Date('2026-05-12T00:00:00Z')],
    ['Đơn hàng', 'Màu', 'Khổ rộng', 'Chiều dài', 'Trọng lượng', 'Số lượng đơn hàng', 'Số lượng Pallet', 'Số cuộn/pallet', 'Kích thước Pallet', 'Số đơn hàng'],
    ['PI-01', 'BLUE', 2, 50, 95, 150, 2, 40, '1050x1200', 'PO-01'],
  ], '30.6.2025'), 'KẾ HOẠCH ĐÓNG PALLET.xlsx', 'pallet-dated', undefined, undefined, '2025-06')
  assert.equal(parsed.rows.length, 1)
  assert.equal(parsed.rows[0].planDate, null)
  assert.match(parsed.rows[0].warnings[0], /không khớp/)
})

test('Pallet row without a merged order reference stays unlinked', () => {
  const parsed = parseStagePlanWorkbook(bufferFor([
    ['Đơn hàng', 'Màu', 'Khổ rộng', 'Chiều dài', 'Trọng lượng', 'Số lượng đơn hàng', 'Số lượng Pallet', 'Số cuộn/pallet', 'Kích thước Pallet', 'Số đơn hàng'],
    ['PI-01', 'BLUE', 2, 50, 95, 150, 2, 40, '1050x1200', 'PO-01'],
    [null, 'GREEN', 3, 60, 120, 80, 1, 30, '1050x1200', 'PO-02'],
  ], '30.6.2025'), 'KẾ HOẠCH ĐÓNG PALLET.xlsx', 'pallet-dated', undefined, undefined, '2025-06')
  assert.equal(parsed.rows.length, 2)
  assert.equal(parsed.rows[0].orderRef, 'PI-01')
  assert.equal(parsed.rows[1].orderRef, null)
})

test('Pallet month scope reads only matching dated sheets', () => {
  const workbook = XLSX.utils.book_new()
  const header = ['Đơn hàng', 'Màu', 'Khổ rộng', 'Chiều dài', 'Trọng lượng', 'Số lượng đơn hàng', 'Số lượng Pallet', 'Số cuộn/pallet', 'Kích thước Pallet', 'Số đơn hàng']
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([header, ['PI-JUN', 'BLUE', 2, 50, 95, 150]]), '30.6.2025')
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([header, ['PI-MAY', 'GREEN', 3, 60, 120, 80]]), '31.5.2025')
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer
  const parsed = parseStagePlanWorkbook(buffer, 'KẾ HOẠCH ĐÓNG PALLET.xlsx', 'pallet-dated', undefined, undefined, '2025-06')
  assert.equal(parsed.scopeKey, '2025-06')
  assert.deepEqual(parsed.sourceSheets, ['30.6.2025'])
  assert.deepEqual(parsed.rows.map(row => row.orderRef), ['PI-JUN'])
})
