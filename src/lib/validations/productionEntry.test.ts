import { test } from 'node:test'
import assert from 'node:assert/strict'
import { manualProductionEntryInput, productionPlanInput, utcDay } from './productionEntry'

const valid = { stage: 'extruder', date: '2026-10-30', metricLabel: 'Sản lượng', value: 12.5, unit: 'kg' }

test('MoM30 production entry accepts valid actual and plan without forcing an order link', () => {
  assert.equal(manualProductionEntryInput.safeParse(valid).success, true)
  assert.equal(productionPlanInput.safeParse(valid).success, true)
})

test('MoM30 production entry rejects negative quantities, invalid stages and invalid calendar dates', () => {
  assert.equal(manualProductionEntryInput.safeParse({ ...valid, value: -1 }).success, false)
  assert.equal(productionPlanInput.safeParse({ ...valid, stage: 'unknown' }).success, false)
  assert.equal(utcDay('2026-02-30'), null)
})

test('MoM30 production date normalization is UTC midnight', () => {
  assert.equal(utcDay('2026-10-30')?.toISOString(), '2026-10-30T00:00:00.000Z')
})
