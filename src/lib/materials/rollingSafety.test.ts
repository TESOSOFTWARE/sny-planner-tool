import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extractRollingScopedDates, simulateScopedReplacement } from './rollingSafety'

test('extractRollingScopedDates extracts distinct and sorted Date objects', () => {
  const metrics = [
    { date: new Date('2026-07-05T00:00:00.000Z') },
    { date: new Date('2026-07-01T00:00:00.000Z') },
    { date: new Date('2026-07-05T00:00:00.000Z') }, // duplicate
    { date: new Date('2026-07-03T00:00:00.000Z') },
  ]

  const scopedDates = extractRollingScopedDates(metrics)
  assert.equal(scopedDates.length, 3)
  assert.equal(scopedDates[0].toISOString(), '2026-07-01T00:00:00.000Z')
  assert.equal(scopedDates[1].toISOString(), '2026-07-03T00:00:00.000Z')
  assert.equal(scopedDates[2].toISOString(), '2026-07-05T00:00:00.000Z')
})

test('DoD-4.3: Scoped Replacement replaces only matching dates and prevents record doubling', () => {
  // Scenario 1: Initial import of July 1 to July 15 (15 records)
  const batch1 = Array.from({ length: 15 }, (_, i) => ({
    id: `rec-${i + 1}`,
    date: new Date(`2026-07-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`),
    value: 100,
  }))

  const initialScope = extractRollingScopedDates(batch1)
  const step1 = simulateScopedReplacement([], batch1, initialScope)
  assert.equal(step1.result.length, 15)
  assert.equal(step1.deletedCount, 0)
  assert.equal(step1.insertedCount, 15)

  // Scenario 2: User renames file and re-imports the exact same July 1 to July 15 (with updated values)
  const batch1Reimport = Array.from({ length: 15 }, (_, i) => ({
    id: `rec-updated-${i + 1}`,
    date: new Date(`2026-07-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`),
    value: 150,
  }))

  const reimportScope = extractRollingScopedDates(batch1Reimport)
  const step2 = simulateScopedReplacement(step1.result, batch1Reimport, reimportScope)

  // CRITICAL CHECK: Total count remains 15 (NOT doubled to 30!)
  assert.equal(step2.result.length, 15, 'Re-importing must not double record count')
  assert.equal(step2.deletedCount, 15, 'Previous 15 records in scope must be deleted')
  assert.equal(step2.insertedCount, 15, '15 new records inserted')
  assert.equal(step2.result[0].id, 'rec-updated-1')

  // Scenario 3: Next import of July 16 to July 30 (15 new records)
  const batch2 = Array.from({ length: 15 }, (_, i) => ({
    id: `rec-${i + 16}`,
    date: new Date(`2026-07-${String(i + 16).padStart(2, '0')}T00:00:00.000Z`),
    value: 200,
  }))

  const batch2Scope = extractRollingScopedDates(batch2)
  const step3 = simulateScopedReplacement(step2.result, batch2, batch2Scope)

  // July 1-15 preserved + July 16-30 appended -> exactly 30 total records
  assert.equal(step3.result.length, 30, 'New date scope must be appended while preserving earlier dates')
  assert.equal(step3.deletedCount, 0, 'No overlapping records for July 16-30')
  assert.equal(step3.insertedCount, 15)
})
