import test from 'node:test'
import assert from 'node:assert/strict'
import { parseOrderListFr } from './orderListFr'

test('FR-only numeric fractions use percentage points without floating point artefacts', () => {
  for (const [input, expected] of [
    [0.065, 6.5], ['0,065', 6.5], [0.09, 9], ['0,09', 9], [0.11, 11],
    ['0,11', 11], [1, 100], [6.5, 6.5], [100, 100], [0, 0], ['0', 0],
    ['6,5%', 6.5], ['0.065%', 0.065], [' 9 % ', 9],
  ] as const) {
    assert.deepEqual(parseOrderListFr(input, null, false), {
      frFlag: expected > 0, frPct: expected,
    }, String(input))
  }
})

test('FR-only blank cells remain missing rather than becoming zero', () => {
  for (const input of [null, undefined, '', '   ']) {
    assert.deepEqual(parseOrderListFr(input, null, false), { frFlag: false, frPct: null })
  }
})

test('FR-only known flags remain flags with no invented percentage', () => {
  for (const input of [true, 'Yes', 'yes', ' y ', 'x', 'Có', 'true']) {
    assert.deepEqual(parseOrderListFr(input, null, false), { frFlag: true, frPct: null })
  }
  for (const input of [false, 'No', 'n', 'false', 'không']) {
    assert.deepEqual(parseOrderListFr(input, null, false), { frFlag: false, frPct: null })
  }
})

test('FR-only invalid values report an error without clamping or coercing', () => {
  for (const input of [-0.1, '-0,1', 150, '150%', 'oops', '6.5abc', '1,2,3',
    'NaN', Infinity, -Infinity, NaN, {}, [], '1e2', '0x10']) {
    const parsed = parseOrderListFr(input, null, false)
    assert.equal(parsed.frPct, null, String(input))
    assert.equal(parsed.frFlag, false, String(input))
    assert.match(parsed.error ?? '', /không hợp lệ/, String(input))
  }
})

test('separate FR% column preserves percentage-point scale and explicit FR flag', () => {
  assert.deepEqual(parseOrderListFr('Yes', 0.065, true), { frFlag: true, frPct: 0.065 })
  assert.deepEqual(parseOrderListFr('No', 6.5, true), { frFlag: false, frPct: 6.5 })
  assert.deepEqual(parseOrderListFr(null, 6.5, true), { frFlag: false, frPct: 6.5 })
  assert.deepEqual(parseOrderListFr(1, '6,5%', true), { frFlag: true, frPct: 6.5 })
  assert.deepEqual(parseOrderListFr('Yes', null, true), { frFlag: true, frPct: null })
})

test('FR% column without a separate flag infers flag from percentage', () => {
  assert.deepEqual(parseOrderListFr(null, 6.5, true, false), { frFlag: true, frPct: 6.5 })
  assert.deepEqual(parseOrderListFr(null, 0, true, false), { frFlag: false, frPct: 0 })
  assert.deepEqual(parseOrderListFr(null, null, true, false), { frFlag: false, frPct: null })
})

test('separate FR% invalid cells also report errors instead of silently becoming missing', () => {
  for (const input of ['Yes', '6bad', Infinity, true]) {
    const parsed = parseOrderListFr('Yes', input, true)
    assert.equal(parsed.frFlag, true)
    assert.equal(parsed.frPct, null)
    assert.match(parsed.error ?? '', /không hợp lệ/)
  }
})

test('explicit FR% preserves invalid finite values for legacy validation and inferred flag', () => {
  for (const input of [-1, 101]) {
    const parsed = parseOrderListFr(null, input, true, false)
    assert.equal(parsed.frPct, input)
    assert.equal(parsed.frFlag, input > 0)
    assert.match(parsed.error ?? '', /không hợp lệ/)
  }
})
