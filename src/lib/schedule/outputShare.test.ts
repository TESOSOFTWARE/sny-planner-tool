import test from 'node:test'
import assert from 'node:assert/strict'
import { dayShare, type Coverer } from './outputShare'

const at = (day: string) => new Date(`${day}T00:00:00+07:00`)
const cov = (orderId: string, lengthM: number | null, start = '2026-10-26', end = '2026-10-27', machineId = 'M-014', allocatedMeters: unknown = null): Coverer =>
  ({ orderId, machineId, startDate: at(start), endDate: at(end), allocatedMeters, order: { lengthM } })
const day = new Date('2026-10-26T00:00:00Z')

test('3 dòng chung máy/ngày: tổng phần = 1 (sản lượng không gấp 3), tỉ lệ theo mét', () => {
  const all = [cov('a', 446.4), cov('b', 180.6), cov('c', 15)]
  const shares = ['a', 'b', 'c'].map(id => dayShare(id, 'M-014', day, all))
  assert.ok(Math.abs(shares.reduce((s, x) => s + x, 0) - 1) < 1e-9)
  assert.ok(Math.abs(shares[0] - 446.4 / 642) < 1e-9)
  assert.equal(shares[0] * 500 + shares[1] * 500 + shares[2] * 500, 500)
})

test('dòng chạy một mình: phần = 1 (giữ hành vi cũ)', () => assert.equal(dayShare('a', 'M-014', day, [cov('a', 100)]), 1))

test('ưu tiên allocatedMeters hơn lengthM; thiếu mét -> chia đều; ngày/máy khác không tính', () => {
  assert.equal(dayShare('a', 'M-014', day, [cov('a', 999, undefined, undefined, undefined, 100), cov('b', 999, undefined, undefined, undefined, 300)]), 0.25)
  assert.equal(dayShare('a', 'M-014', day, [cov('a', null), cov('b', null)]), 0.5)
  assert.equal(dayShare('a', 'M-014', day, [cov('a', 100), cov('b', 100, '2026-10-28', '2026-10-29'), cov('c', 100, undefined, undefined, 'M-015')]), 1)
  assert.equal(dayShare('x', 'M-014', day, [cov('a', 100)]), 0)
})

test('2 lịch chồng của CHÍNH một dòng chỉ đếm 1 lần (không làm dòng khác bị chia nhỏ)', () => {
  assert.equal(dayShare('a', 'M-014', day, [cov('a', 100), cov('a', 100), cov('b', 100)]), 0.5)
})