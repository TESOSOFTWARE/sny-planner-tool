import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as XLSX from 'xlsx'
import { parseOrderList, classifyOrderImport } from './parseOrderList'
import { importedOrderRowSchema, approvedOrderStateSchema, orderListImportRowSchema } from '@/lib/validations/order'
import { explicitOrderListPacking } from './orderListPacking'
import { mapParsedRowToCreateInput } from '@/lib/orders/importPersist'

function row(packing: unknown, unit: string, count: unknown = null) {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['TITLE'],
    ['PI NUMBER', 'CUSTOMER', 'NO', 'DATE', 'GSM', 'WIDTH', 'LENGTH', 'COLOR', 'ORDER TYPE', 'QTY', 'PACKING', 'UNIT', 'PCS/BOX', 'PCS/BALE'],
    ['PI-33', 'CUSTOMER-A', 1, '2026-10-01', 100, 2, 50, 'BLACK', 'pieces', 10, packing, unit, count, count],
  ]), 'ORDER LIST')
  return parseOrderList(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }))[0]
}
for (const packing of [null, 'cfmed', 'pending', 'half folding and rolling with core', 'Straight folding']) {
  test(`33B note ${packing} does not override UNIT PCS`, () => {
    const parsed = row(packing, 'PCS')
    assert.equal(parsed.primaryPackingType, 'CARTON')
    assert.equal(parsed.piecesPerCarton, null)
    assert.equal(parsed.isValid, true, parsed.validationErrors?.join('; '))
    assert.equal(parsed.validationWarnings?.length, 1)
    assert.equal(classifyOrderImport([parsed], [])[0].status, 'new')
    assert.equal(orderListImportRowSchema.safeParse(parsed).success, true)
    assert.equal(importedOrderRowSchema.safeParse(parsed).success, false)
    assert.equal(approvedOrderStateSchema.safeParse(parsed).success, false)
    const persisted = mapParsedRowToCreateInput(parsed, null)
    assert.equal(persisted.piecesPerCarton, null)
    assert.equal(persisted.primaryPackingType, 'CARTON')
  })
}
test('33B inferred BALE missing count accepted with warning', () => {
  const parsed = row('pending', 'Bale')
  assert.equal(parsed.primaryPackingType, 'BALE')
  assert.equal(parsed.isValid, true)
  assert.equal(parsed.validationWarnings?.length, 1)
  assert.equal(classifyOrderImport([parsed], [])[0].status, 'new')
})
for (const packing of ['CARTON', 'BALE']) {
  test(`33B explicit ${packing} missing count remains invalid`, () => {
    const parsed = row(packing, 'PCS')
    assert.equal(parsed.isValid, false)
    assert.equal(parsed.validationWarnings?.length, 0)
    assert.equal(classifyOrderImport([{ ...parsed, isValid: true }], [])[0].status, 'invalid')
  })
}
for (const count of [0, -1, 1.5, 'invalid']) {
  test(`33B provided invalid count ${count} is never warning-only`, () => {
    const parsed = row(null, 'PCS', count)
    assert.equal(parsed.isValid, false)
    assert.equal(parsed.validationWarnings?.length, 0)
    assert.equal(classifyOrderImport([parsed], [])[0].status, 'invalid')
  })
}
test('33B valid explicit count accepted without warning; claim alone cannot bypass validation', () => {
  const valid = row('CARTON', 'PCS', 20)
  assert.equal(valid.isValid, true)
  assert.equal(valid.validationWarnings?.length, 0)
  assert.equal(approvedOrderStateSchema.safeParse(valid).success, true)
  const invalid = { ...row('CARTON', 'PCS'), isValid: true, isInferred: true, rawPacking: 'CARTON' }
  assert.equal(classifyOrderImport([invalid], [])[0].status, 'invalid')
})
test('33B missing raw source is strict; unrelated GSM errors remain blocking', () => {
  const parsed = row(null, 'PCS')
  assert.equal(classifyOrderImport([{ ...parsed, isValid: true, rawUnit: undefined }], [])[0].status, 'invalid')
  assert.equal(classifyOrderImport([{ ...parsed, isValid: true, gsm: 0 }], [])[0].status, 'invalid')
})
test('33B whole keyword detection preserves HEMMED priority and ignores rolling', () => {
  assert.equal(explicitOrderListPacking('HEMMED CARTON'), 'HEMMED')
  assert.equal(explicitOrderListPacking('BALES'), 'BALE')
  assert.equal(explicitOrderListPacking('ROLL'), 'ROLL')
  assert.equal(explicitOrderListPacking('half folding and rolling with core'), null)
})
