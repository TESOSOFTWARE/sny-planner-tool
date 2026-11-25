import assert from 'node:assert/strict'
import test from 'node:test'
import { aggregateProductionProgress } from './progressSummary'

test('progress aggregates by PI, stage, metric, unit, and month-scoped inputs', () => {
  const rows = aggregateProductionProgress([
    { piNumber: 'PI-1', stage: 'extruder', metricLabel: 'Sản lượng kéo sợi', unit: 'kg', kind: 'plan', value: 1000 },
    { piNumber: ' pi-1 ', stage: 'extruder', metricLabel: 'Sản lượng kéo sợi', unit: 'KG', kind: 'actual', value: 400, reportDate: '2026-11-01' },
    { piNumber: 'PI-1', stage: 'extruder', metricLabel: 'Sản lượng kéo sợi', unit: 'kg', kind: 'actual', value: 100, reportDate: '2026-11-02' },
    { piNumber: 'PI-1', stage: 'knitting', metricLabel: 'Sản lượng dệt', unit: 'm', kind: 'actual', value: 200, reportDate: '2026-11-03' },
  ])

  assert.equal(rows.length, 2)
  assert.deepEqual(rows[0], {
    piNumber: 'PI-1', stage: 'extruder', metricLabel: 'Sản lượng kéo sợi', unit: 'kg',
    planned: 1000, actual: 500, achievedPercent: 50, state: 'IN_PROGRESS', lastActualDate: '2026-11-02',
  })
  assert.equal(rows[1].state, 'NO_PLAN')
  assert.equal(rows[1].achievedPercent, null)
})

test('different units or metrics never collapse into a false percentage', () => {
  const rows = aggregateProductionProgress([
    { piNumber: 'PI-2', stage: 'knitting', metricLabel: 'Sản lượng dệt', unit: 'kg', kind: 'plan', value: 200 },
    { piNumber: 'PI-2', stage: 'knitting', metricLabel: 'Sản lượng dệt', unit: 'm', kind: 'actual', value: 50 },
  ])
  assert.equal(rows.length, 2)
  assert.ok(rows.every(row => row.achievedPercent === null))
})
