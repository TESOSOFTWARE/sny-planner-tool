import { test } from 'node:test'
import assert from 'node:assert/strict'
import { itemCodeWarnings } from './itemCodeHint'

test('itemCodeWarnings: Rỗng hoặc khoảng trắng không sinh cảnh báo', () => {
  assert.deepEqual(itemCodeWarnings(['', '   '], 0), [])
  assert.deepEqual(itemCodeWarnings(['', '   '], 1), [])
})

test('itemCodeWarnings: Mã 16 ký tự hợp lệ và không trùng -> không có cảnh báo', () => {
  const lines = ['GBN1GRE260205054', 'GBN1RED250250024']
  assert.deepEqual(itemCodeWarnings(lines, 0), [])
  assert.deepEqual(itemCodeWarnings(lines, 1), [])
})

test('itemCodeWarnings: Mã nhập tay không bị cảnh báo độ dài', () => {
  const lines = ['QA-1', 'CUSTOM-ITEM-CODE-123456789']
  assert.deepEqual(itemCodeWarnings(lines, 0), [])
  assert.deepEqual(itemCodeWarnings(lines, 1), [])
})

test('itemCodeWarnings: Trùng mã với dòng khác trong cùng PI -> cảnh báo cả 2 dòng', () => {
  const lines = ['GBN1GRE260205054', 'GBN1RED250250024', 'GBN1GRE260205054']
  const warn0 = itemCodeWarnings(lines, 0)
  const warn1 = itemCodeWarnings(lines, 1)
  const warn2 = itemCodeWarnings(lines, 2)

  assert.equal(warn0.length, 1)
  assert.match(warn0[0], /Trùng mã với Dòng #3/)

  assert.equal(warn1.length, 0)

  assert.equal(warn2.length, 1)
  assert.match(warn2[0], /Trùng mã với Dòng #1/)
})

test('itemCodeWarnings: So sánh phân biệt hoa thường khi xét trùng mã', () => {
  const lines = ['gbn1gre260205054', 'GBN1GRE260205054']
  // Vì là 2 chuỗi khác nhau, không báo trùng
  assert.deepEqual(itemCodeWarnings(lines, 0), [])
  assert.deepEqual(itemCodeWarnings(lines, 1), [])
})
