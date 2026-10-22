import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { searchOrderChoices } from './orderChoiceSearch'
import type { OrderStatus } from '../orderStatus'

const row = (id: number, widthM: number, calculatedStatus: OrderStatus, customer = 'Đặng Dung') => ({
  piNumber: '26HSIA1001', subLineIndex: id, widthM, calculatedStatus, customer,
  color: 'BLACK', meshType: 'Lưới M+M', gsm: 230,
})
const rows = [row(4, 4.3, 'DONE'), row(2, 4.5, 'SCHEDULED'), row(0, 4.5, 'RUNNING'),
  row(3, 4.3, 'PENDING'), row(1, 4.5, 'PENDING')]

test('tìm nhiều từ trên PI, màu, khổ, khách và loại lưới', () => {
  assert.equal(searchOrderChoices(rows, 'HSIA').length, 5)
  assert.deepEqual(searchOrderChoices(rows, 'black 4.5').map(o => o.subLineIndex), [0, 1, 2])
  assert.equal(searchOrderChoices(rows, '4,3').length, 2)
  assert.equal(searchOrderChoices(rows, 'dang dung luoi').length, 5)
  assert.equal(searchOrderChoices(rows, 'black 999').length, 0)
})

test('nhóm theo trạng thái rồi PI số và dòng', () => {
  const result = searchOrderChoices([...rows, { ...row(9, 4.5, 'PENDING'), piNumber: '26HSIA2' }], '')
  assert.deepEqual(result.map(o => o.group), ['Đang sản xuất', 'Chưa lên lịch', 'Chưa lên lịch', 'Chưa lên lịch', 'Đã lên lịch', 'Hoàn thành'])
  assert.deepEqual(result.filter(o => o.calculatedStatus === 'PENDING').map(o => o.subLineIndex), [9, 1, 3])
})

test('tìm chữ và đơn vị hiện trên nhãn', () => {
  const reserved = { ...row(0, 4.5, 'RUNNING'), isPlaceholder: true, lifecycleStatus: 'PLACEHOLDER' }
  assert.equal(searchOrderChoices([reserved], '4.5m').length, 1)
  assert.equal(searchOrderChoices([reserved], '230gsm').length, 1)
  assert.equal(searchOrderChoices([reserved], 'giu cho').length, 1)
  assert.equal(searchOrderChoices([reserved], '4.5m 230gsm giu cho').length, 1)
})
