import { test } from 'node:test'
import assert from 'node:assert/strict'
import { outputFallsWithinSchedule, resolveScheduleReplacement, scheduleOutputBounds } from './importSafety'

test('query bounds include the final UTC report date', () => {
  const bounds = scheduleOutputBounds({ startDate: '2026-09-10T00:00:00+07:00', endDate: '2026-09-10T00:00:00+07:00' })
  assert.equal(bounds.gte.toISOString(), '2026-09-10T00:00:00.000Z')
  assert.equal(bounds.lte.toISOString(), '2026-09-10T00:00:00.000Z')
})

const day = (n: number) => `2026-09-${String(n).padStart(2, '0')}T00:00:00+07:00`
const range = (machineId: string, start: number, end: number) => ({ machineId, startDate: day(start), endDate: day(end) })

test('includes the only/last output day, excludes adjacent days', () => {
  const assignment = range('M001', 10, 10)
  assert.equal(outputFallsWithinSchedule(new Date('2026-09-10T00:00:00Z'), assignment), true)
  assert.equal(outputFallsWithinSchedule(new Date('2026-09-09T00:00:00Z'), assignment), false)
  assert.equal(outputFallsWithinSchedule(new Date('2026-09-11T00:00:00Z'), assignment), false)
})

test('merged replacement cannot delete its unprotected future interval', () => {
  const old = [{ id: 'protected', ...range('M001', 1, 5) }, { id: 'future', ...range('M001', 6, 10) }]
  const incoming = [range('M001', 1, 10), range('M002', 1, 10)]
  const result = resolveScheduleReplacement(old, incoming, old.map(a => a.id), new Set(['protected']))
  assert.deepEqual(result.idsToDelete, [])
  assert.deepEqual(result.safeAssignments, [incoming[1]])
  assert.equal(result.preservedConflict, 1)
})

test('propagates retained interval conflicts but still replaces independent ranges', () => {
  const old = [
    { id: 'protected', ...range('M001', 1, 5) },
    { id: 'future', ...range('M001', 6, 10) },
    { id: 'later', ...range('M001', 11, 15) },
    { id: 'independent', ...range('M002', 1, 10) },
  ]
  const incoming = [range('M001', 1, 7), range('M001', 8, 15), range('M002', 1, 10)]
  const result = resolveScheduleReplacement(old, incoming, old.map(a => a.id), new Set(['protected']))
  assert.deepEqual(result.idsToDelete, ['independent'])
  assert.deepEqual(result.safeAssignments, [incoming[2]])
  assert.equal(result.preservedConflict, 2)
})

test('respects retained borderline intervals even without output', () => {
  const old = [{ id: 'borderline', ...range('M001', 1, 5) }]
  const result = resolveScheduleReplacement(old, [range('M001', 1, 10)], [], new Set())
  assert.equal(result.safeAssignments.length, 0)
  assert.deepEqual(result.idsToDelete, [])
})
