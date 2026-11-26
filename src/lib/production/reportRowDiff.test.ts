import assert from 'node:assert/strict'
import test from 'node:test'
import { diffProductionReportRows, legacySourceKeyAdoptions, linkReportRowsBySourceKey, productionReportIdentityKey, productionReportSourceKey } from './reportRowDiff'

const sourceKey = productionReportSourceKey('EXTRUDER', '2026-11', 42)!
const existing = { id: 'old-1', sourceKey, machineId: 'EXT-01', reportDate: new Date('2026-11-02T00:00:00.000Z'), shift: 'D', color: 'BLACK', denier: 21, weightKgs: 100, orderRef: 'PI-1', orderId: 'line-1', dataSource: 'STATISTICAL REPORT 11-2026.xlsx' }

test('same source row is skipped when its report values are identical', () => {
  const diff = diffProductionReportRows([{ sourceKey, data: { ...existing, id: undefined, sourceKey, orderId: null, dataSource: 'corrected.xlsx' } }], [existing])
  assert.equal(diff.creates.length, 0)
  assert.equal(diff.updates.length, 0)
  assert.equal(diff.unchanged, 1)
})

test('changed source row updates in place and does not add a duplicate', () => {
  const diff = diffProductionReportRows([{ sourceKey, data: { machineId: 'EXT-01', reportDate: existing.reportDate, shift: 'D', color: 'BLACK', denier: 21, weightKgs: 125, orderRef: 'PI-1', orderId: null, dataSource: 'corrected.xlsx' } }], [existing])
  assert.equal(diff.creates.length, 0)
  assert.equal(diff.updates.length, 1)
  assert.equal(diff.updates[0].id, 'old-1')
  assert.equal(diff.updates[0].data.weightKgs, 125)
})

test('new source row is added while absent prior rows are only reported, never deleted', () => {
  const diff = diffProductionReportRows([
    { sourceKey, data: { machineId: 'EXT-01', reportDate: existing.reportDate, shift: 'D', color: 'BLACK', denier: 21, weightKgs: 100, orderRef: 'PI-1', orderId: null } },
    { sourceKey: productionReportSourceKey('EXTRUDER', '2026-11', 43), data: { machineId: 'EXT-01', reportDate: existing.reportDate, shift: 'N', color: 'BLUE', denier: 20, weightKgs: 50, orderRef: 'PI-2', orderId: null } },
  ], [existing, { ...existing, id: 'old-2', sourceKey: productionReportSourceKey('EXTRUDER', '2026-11', 44), shift: 'N', color: 'RED', weightKgs: 20 }])
  assert.equal(diff.creates.length, 1)
  assert.equal(diff.unchanged, 1)
  assert.equal(diff.missingInSource, 1)
})

test('invalid source row is excluded from missing-in-source count', () => {
  const diff = diffProductionReportRows([], [existing], { protectedSourceKeys: new Set([sourceKey]) })
  assert.equal(diff.creates.length, 0)
  assert.equal(diff.missingInSource, 0)
})

test('an exact legacy row adopts a source key without changing business values', () => {
  const legacy = { ...existing, id: 'legacy-1', sourceKey: null }
  const incoming = { sourceKey, data: { machineId: 'EXT-01', reportDate: existing.reportDate, shift: 'D', color: 'BLACK', denier: 21, weightKgs: 100, orderRef: 'PI-1', orderId: null } }
  assert.deepEqual(legacySourceKeyAdoptions([legacy], [{ ...incoming, data: { ...incoming.data, dataSource: 'import' } }]), [{ id: 'legacy-1', sourceKey }])
  const diff = diffProductionReportRows([incoming], [legacy])
  assert.equal(diff.creates.length, 0)
  assert.equal(diff.unchanged, 1)
  assert.equal(diff.adoptions.length, 1)
  assert.equal(diff.updates.length, 0)
})

test('rows without stable source coordinates are quarantined as ambiguous', () => {
  const diff = diffProductionReportRows([{ sourceKey: null, data: { weightKgs: 10 } }], [])
  assert.equal(diff.ambiguous, 1)
  assert.equal(diff.creates.length, 0)
})

test('an unmatched legacy row in the same source scope is not duplicated speculatively', () => {
  const incoming = { sourceKey, data: { machineId: 'EXT-01', reportDate: existing.reportDate, shift: 'D', color: 'BLACK', denier: 21, weightKgs: 120, orderRef: 'PI-1' } }
  const legacy = { ...existing, sourceKey: null, weightKgs: 100 }
  const diff = diffProductionReportRows([incoming], [legacy], {
    legacyCandidateKey: row => JSON.stringify([row.machineId, (row.reportDate as Date).toISOString(), row.shift]),
  })
  assert.equal(diff.ambiguous, 1)
  assert.equal(diff.creates.length, 0)
  assert.equal(diff.updates.length, 0)
})

test('source-row identity preserves an existing manual sub-line link without choosing another line', () => {
  const row = { sourceKey, orderRef: 'PI-1', orderId: null }
  const catalog = [{ id: 'line-1', piNumber: 'PI-1' }, { id: 'line-2', piNumber: 'PI-1' }]
  const existingLinks = [{ sourceKey, orderRef: 'PI-1', orderId: 'line-2' }]
  assert.equal(linkReportRowsBySourceKey([row], existingLinks, catalog).rows[0].orderId, 'line-2')
  assert.equal(linkReportRowsBySourceKey([{ ...row, sourceKey: 'new-key' }], [], catalog).rows[0].orderId, null)
})

test('two distinct known PI references in one source row are isolated as ambiguous', () => {
  const result = linkReportRowsBySourceKey([{ sourceKey, orderRef: 'PI-1', sourceOrderRefs: ['PI-1', 'PI-2'] }], [], [
    { id: 'line-1', piNumber: 'PI-1' }, { id: 'line-2', piNumber: 'PI-2' },
  ])
  assert.equal(result.rows.length, 0)
  assert.equal(result.ambiguousRows.length, 1)
})

test('exact rows still match after Excel row reorder', () => {
  const moved = productionReportSourceKey('EXTRUDER', '2026-11', 43)!
  const diff = diffProductionReportRows([{ sourceKey: moved, data: { machineId: 'EXT-01', reportDate: existing.reportDate, shift: 'D', color: 'BLACK', denier: 21, weightKgs: 100, orderRef: 'PI-1' } }], [existing])
  assert.equal(diff.creates.length, 0)
  assert.equal(diff.unchanged, 1)
  assert.equal(diff.missingInSource, 0)
})

test('changed values can still locate a moved row by unique stage identity', () => {
  const secondKey = productionReportSourceKey('EXTRUDER', '2026-11', 43)!
  const second = { ...existing, id: 'old-2', sourceKey: secondKey, color: 'BLUE', weightKgs: 20 }
  const diff = diffProductionReportRows([
    { sourceKey: secondKey, data: { machineId: 'EXT-01', reportDate: existing.reportDate, shift: 'D', color: 'BLACK', denier: 21, weightKgs: 125, orderRef: 'PI-1' } },
    { sourceKey, data: { machineId: 'EXT-01', reportDate: existing.reportDate, shift: 'D', color: 'BLUE', denier: 21, weightKgs: 20, orderRef: 'PI-1' } },
  ], [existing, second], { identityKey: row => productionReportIdentityKey([row.machineId, row.reportDate, row.shift, row.orderRef, row.color, row.denier]) })
  assert.equal(diff.creates.length, 0)
  assert.equal(diff.updates.length, 1)
  assert.equal(diff.updates[0].id, 'old-1')
  assert.equal(diff.unchanged, 1)
})
