import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Prisma } from '@prisma/client'
import { preserveOrderLinks, OutputLinkConflict } from './preserveOrderLinks'
const row = { machineId: 'EXT-01', reportDate: '2026-09-10T00:00:00Z', shift: 'D', color: 'BLACK', orderRef: 'PI', denier: 100 }
const orders = [{ id: 'o1', piNumber: 'PI' }, { id: 'o2', piNumber: 'PI' }]
test('retains a manual subline link on quantity correction', () => {
  assert.equal(preserveOrderLinks([{ ...row, weightKgs: 200 }], [{ ...row, reportDate: new Date(row.reportDate), orderId: 'o2' }], orders)[0].orderId, 'o2')
})
test('does not choose an arbitrary subline for new rows', () => {
  assert.equal(preserveOrderLinks([row], [], orders)[0].orderId, null)
  assert.equal(preserveOrderLinks([row], [], orders.slice(0, 1))[0].orderId, 'o1')
})
test('rejects removal or identity change of linked records', () => {
  assert.throws(() => preserveOrderLinks([{ ...row, color: 'GREEN' }], [{ ...row, orderId: 'o2' }], orders), OutputLinkConflict)
})
test('rejects indistinguishable rows with different links', () => {
  assert.throws(() => preserveOrderLinks([row], [{ ...row, orderId: 'o1' }, { ...row, orderId: 'o2' }], orders), OutputLinkConflict)
})
test('uses report-specific fields and consumes old links one-to-one', () => {
  const base = { machineId: 'M-001', reportDate: '2026-09-10T00:00:00Z', shift: 'D', color: 'BLACK', orderRef: 'PI', width: 4 }
  const existing = [
    { ...base, weightSpec: 95, orderId: 'o1' },
    { ...base, weightSpec: 120, orderId: 'o2' },
  ]
  const incoming = [
    { ...base, weightSpec: 95, weightKgs: 10 },
    { ...base, weightSpec: 120, weightKgs: 20 },
  ]
  assert.deepEqual(preserveOrderLinks(incoming, existing, orders).map(row => row.orderId), ['o1', 'o2'])
  assert.throws(
    () => preserveOrderLinks([{ ...base, weightSpec: 95 }, { ...base, weightSpec: 95 }], existing.slice(0, 1), orders),
    OutputLinkConflict,
  )
})

test('matches the unchanged measured line regardless of incoming order', () => {
  const base = { machineId: 'EXT-01', reportDate: '2026-09-10T00:00:00Z', shift: 'D', color: 'BLACK', orderRef: 'PI', denier: 100 }
  const old = [{ ...base, weightKgs: 10, orderId: 'o1' }]
  for (const incoming of [
    [{ ...base, weightKgs: 20 }, { ...base, weightKgs: 10 }],
    [{ ...base, weightKgs: 10 }, { ...base, weightKgs: 20 }],
  ]) {
    const result = preserveOrderLinks(incoming, old, [{ id: 'o1', piNumber: 'PI' }, { id: 'o2', piNumber: 'PI' }])
    assert.equal(result.find(row => row.weightKgs === 10)?.orderId, 'o1')
    assert.equal(result.find(row => row.weightKgs === 20)?.orderId, null)
  }
})

test('matches multiple linked lines by values rather than row position', () => {
  const base = { machineId: 'EXT-01', reportDate: '2026-09-10T00:00:00Z', shift: 'D', color: 'BLACK', orderRef: 'PI', denier: 100 }
  const old = [
    { ...base, weightKgs: 10, orderId: 'o1' },
    { ...base, weightKgs: 20, orderId: 'o2' },
  ]
  const result = preserveOrderLinks([
    { ...base, weightKgs: 20 },
    { ...base, weightKgs: 10 },
  ], old, [{ id: 'o1', piNumber: 'PI' }, { id: 'o2', piNumber: 'PI' }])
  assert.deepEqual(result.map(row => row.orderId), ['o2', 'o1'])
})

test('allows duplicate unlinked rows on a repeated import', () => {
  const duplicate = { machineId: 'EXT-01', reportDate: '2026-09-10T00:00:00Z', shift: 'D', color: 'BLACK', orderRef: 'AMBIGUOUS', denier: 100, weightKgs: 0 }
  const result = preserveOrderLinks([duplicate, duplicate], [duplicate, duplicate], [
    { id: 'o1', piNumber: 'AMBIGUOUS' },
  ])
  assert.deepEqual(result.map(row => row.orderId), ['o1', 'o1'])
})

test('allows operational metric corrections on a single linked line', () => {
  const old = [{ machineId: 'M-001', reportDate: '2026-09-10T00:00:00Z', shift: 'D', color: 'BLACK', orderRef: 'PI', width: 4, meterPerDay: 100, orderId: 'o1' }]
  const incoming = [{ machineId: 'M-001', reportDate: '2026-09-10T00:00:00Z', shift: 'D', color: 'BLACK', orderRef: 'PI', width: 4, meterPerDay: 110 }]
  assert.equal(preserveOrderLinks(incoming, old, [{ id: 'o1', piNumber: 'PI' }])[0].orderId, 'o1')
})

test('allows operational metric corrections across distinguishable linked lines', () => {
  const base = { machineId: 'M-001', reportDate: '2026-09-10T00:00:00Z', shift: 'D', color: 'BLACK', orderRef: 'PI', width: 4 }
  const old = [
    { ...base, weightKgs: 10, meterPerDay: 100, cmPerMin: 96, totalPct: 98.5, orderId: 'o1' },
    { ...base, weightKgs: 20, meterPerDay: 100, cmPerMin: 96, totalPct: 98.5, orderId: 'o2' },
  ]
  const incoming = [
    { ...base, weightKgs: 20, meterPerDay: 110, cmPerMin: 108, totalPct: 99 },
    { ...base, weightKgs: 10, meterPerDay: 110, cmPerMin: 108, totalPct: 99 },
  ]
  assert.deepEqual(
    preserveOrderLinks(incoming, old, [{ id: 'o1', piNumber: 'PI' }, { id: 'o2', piNumber: 'PI' }]).map(row => row.orderId),
    ['o2', 'o1'],
  )
})

test('matches values after Prisma Decimal database rounding', () => {
  const base = { machineId: 'M-001', reportDate: '2026-09-10T00:00:00Z', shift: 'D', color: 'BLACK', orderRef: 'PI', width: 4 }
  const existing = [
    { ...base, weightKgs: new Prisma.Decimal('10.12'), orderId: 'o1' },
    { ...base, weightKgs: new Prisma.Decimal('20.46'), orderId: 'o2' },
  ]
  const incoming = [
    { ...base, weightKgs: 20.456 },
    { ...base, weightKgs: 10.123 },
  ]
  assert.deepEqual(
    preserveOrderLinks(incoming, existing, [{ id: 'o1', piNumber: 'PI' }, { id: 'o2', piNumber: 'PI' }]).map(row => row.orderId),
    ['o2', 'o1'],
  )
})

test('blocks an ambiguous multi-line correction rather than using row order', () => {
  const old = [
    { machineId: 'EXT-01', reportDate: '2026-09-10T00:00:00Z', shift: 'D', color: 'BLACK', orderRef: 'PI', denier: 100, weightKgs: 10, orderId: 'o1' },
    { machineId: 'EXT-01', reportDate: '2026-09-10T00:00:00Z', shift: 'D', color: 'BLACK', orderRef: 'PI', denier: 100, weightKgs: 20, orderId: 'o2' },
  ]
  const incoming = old.map(({ weightKgs, orderId, ...row }) => ({ ...row, weightKgs: 30 }))
  assert.throws(() => preserveOrderLinks(incoming, old, [{ id: 'o1', piNumber: 'PI' }, { id: 'o2', piNumber: 'PI' }]), OutputLinkConflict)
})

test('blocks a duplicate group with one linked and one unlinked old row', () => {
  const row = { machineId: 'EXT-01', reportDate: '2026-09-10T00:00:00Z', shift: 'D', color: 'BLACK', orderRef: 'PI', denier: 100, weightKgs: 10 }
  assert.throws(() => preserveOrderLinks(
    [row, row],
    [{ ...row, orderId: 'o1' }, row],
    [{ id: 'o1', piNumber: 'PI' }],
  ), OutputLinkConflict)
})
