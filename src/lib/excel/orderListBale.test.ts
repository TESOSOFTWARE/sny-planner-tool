import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as XLSX from 'xlsx'
import { parseOrderList, classifyOrderImport } from './parseOrderList'
import { calculateOrderWeight } from '@/lib/calculations/orderWeight'
import { mapParsedRowToCreateInput } from '@/lib/orders/importPersist'

function fixture(qty: unknown, unit = 'BALES', packing: unknown = 'pending', length = 330, type: unknown = null) {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['TITLE'],
    ['PI NUMBER', 'CUSTOMER', 'NO', 'DATE', 'GSM', 'WIDTH', 'LENGTH', 'COLOR',
      'ORDER TYPE', 'QTY', 'PACKING', 'UNIT', 'PCS/BOX', 'PCS/BALE'],
    ['BALE-34', 'CUSTOMER-A', 1, '2026-10-01', 65, 20, length, 'BLACK',
      type, qty, packing, unit, 1, 1],
  ]), 'ORDERS')
  return parseOrderList(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }))[0]
}
for (const unit of ['BALE', 'BALES', 'BIG BAG BALE', 'Individually packed, Bale packing']) {
  test('0810-34 ' + unit + ': preserves quantity and computes total metres once', () => {
    const parsed = fixture(28, unit)
    assert.equal(parsed.orderType, 'meters')
    assert.equal(parsed.primaryPackingType, 'BALE')
    assert.equal(parsed.lengthM, 9240)
    assert.equal(parsed.qty, 28)
    assert.equal(parsed.isValid, true, parsed.validationErrors?.join('; '))
    const calculated = calculateOrderWeight({ ...parsed, orderType: parsed.orderType ?? 'meters' })
    assert.equal(calculated.qtySqm, 184800)
    assert.equal(calculated.totalWeightKgs, 12012)
    assert.equal(mapParsedRowToCreateInput(parsed, null).lengthM, 9240)
    assert.equal(classifyOrderImport([parsed], [])[0].status, 'new')
    assert.equal(parsed.lengthM, 9240)
  })
}
test('0810-34 quantity one retains LENGTH', () => {
  assert.equal(fixture(1).lengthM, 330)
})
for (const qty of [null, '', 0, -1, 1.5, 'invalid']) {
  test('0810-34 quantity ' + qty + ' is blocking', () => {
    const parsed = fixture(qty)
    assert.equal(parsed.isValid, false)
    assert.ok(parsed.validationErrors?.includes("Thiếu số lượng (QU'TY) cho hàng đóng kiện"))
    assert.equal(classifyOrderImport([parsed], [])[0].status, 'invalid')
    assert.equal(classifyOrderImport([{ ...parsed, isValid: true, validationErrors: [] }], [])[0].status, 'invalid')
  })
}
for (const packing of ['BALE', 'Đóng kiện', 'ROLL', 'CARTON', 'HEMMED BALE']) {
  test('0810-34 explicit ' + packing + ' preserves source LENGTH', () => {
    assert.equal(fixture(28, 'BALES', packing).lengthM, 330)
  })
}
for (const unit of ['ROLL', 'PCS', 'BOX', 'PANEL', 'PACK']) {
  test('0810-34 UNIT ' + unit + ' keeps existing type and source LENGTH', () => {
    const parsed = fixture(28, unit)
    assert.equal(parsed.lengthM, 330)
    assert.equal(parsed.orderType, unit === 'ROLL' ? 'rolls' : 'pieces')
  })
}
test('0810-34 explicit pieces/rolls retains unit length calculation', () => {
  const pieces = fixture(28, 'BALES', null, 330, 'pieces')
  const rolls = fixture(28, 'BALES', null, 330, 'rolls')
  assert.equal(pieces.lengthM, 330)
  assert.equal(pieces.pieceLength, 330)
  assert.equal(rolls.lengthM, 330)
  assert.equal(rolls.rollLength, 330)
})
test('0810-34 corrected total still obeys 100,000 metre limit', () => {
  const parsed = fixture(400, 'BALES', 'cfmed')
  assert.equal(parsed.lengthM, 132000)
  assert.equal(parsed.isValid, false)
  assert.equal(classifyOrderImport([parsed], [])[0].status, 'invalid')
})
