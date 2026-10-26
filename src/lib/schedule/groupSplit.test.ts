import test from 'node:test'
import assert from 'node:assert/strict'
import { planGroupSplit, type GroupSplitInput } from './groupSplit'
import { estimateWovenBeforeStop, validSplitPlanningValue } from './estimatedWoven'

const input: GroupSplitInput = {
  calendar: { nonWorkingWeekdays: [0] },
  members: [
    { id: 'a', allocatedMeters: 446.4 },
    { id: 'b', allocatedMeters: 180.6 },
    { id: 'c', allocatedMeters: 15 },
  ],
  dailyOutput: 500, start: '2026-10-26', stopDate: '2026-10-27',
}

test('642m: machine weaves 500m once; largest remainder goes to the 180.6m line', () => {
  assert.deepEqual(planGroupSplit(input), {
    groupTotal: 642, workedDays: 1, estimatedWovenMeters: 500,
    remainingMeters: 142, lastWorkingDate: '2026-10-26',
    perMember: [
      { id: 'a', woven: 347.66, remaining: 98.74 },
      { id: 'b', woven: 140.66, remaining: 39.94 },
      { id: 'c', woven: 11.68, remaining: 3.32 },
    ],
  })
})

test('two working days cap production at group total and leave no negative remainder', () => {
  const result = planGroupSplit({ ...input, stopDate: '2026-10-28' })!
  assert.equal(result.estimatedWovenMeters, 642)
  assert.equal(result.remainingMeters, 0)
  assert.deepEqual(result.perMember, input.members.map(member => ({
    id: member.id, woven: member.allocatedMeters, remaining: 0,
  })))
})

test('stop on first day moves the complete group with zero woven and no last working date', () => {
  const result = planGroupSplit({ ...input, stopDate: input.start })!
  assert.equal(result.workedDays, 0)
  assert.equal(result.lastWorkingDate, null)
  assert.equal(result.estimatedWovenMeters, 0)
  assert.equal(result.remainingMeters, 642)
  assert.deepEqual(result.perMember, input.members.map(member => ({
    id: member.id, woven: 0, remaining: member.allocatedMeters,
  })))
})

test('singleton matches existing estimate without changing its rounding or calendar rules', () => {
  const result = planGroupSplit({ ...input, members: [{ id: 'only', allocatedMeters: 642 }] })!
  const { groupTotal, perMember, ...estimate } = result
  assert.equal(groupTotal, 642)
  assert.deepEqual(estimate, estimateWovenBeforeStop(input.calendar, input.start, input.stopDate, 642, 500))
  assert.deepEqual(perMember, [{ id: 'only', woven: 500, remaining: 142 }])
})

test('configured holiday is excluded before the stop date', () => {
  const result = planGroupSplit({
    ...input, stopDate: '2026-10-28',
    calendar: { nonWorkingWeekdays: [0], workingDateOverrides: { '2026-10-27': false } },
  })!
  assert.equal(result.workedDays, 1)
  assert.equal(result.estimatedWovenMeters, 500)
  assert.equal(result.lastWorkingDate, '2026-10-26')
})

test('equal remainders break ties by id, independent of caller order; tiny lines can reach zero', () => {
  const members = [
    { id: 'c', allocatedMeters: 0.01 }, { id: 'a', allocatedMeters: 0.01 },
    { id: 'b', allocatedMeters: 0.01 },
  ]
  const result = planGroupSplit({ ...input, members, dailyOutput: 0.02 })!
  assert.deepEqual(result.perMember, [
    { id: 'c', woven: 0, remaining: 0.01 },
    { id: 'a', woven: 0.01, remaining: 0 },
    { id: 'b', woven: 0.01, remaining: 0 },
  ])
  const reversed = planGroupSplit({ ...input, members: members.slice().reverse(), dailyOutput: 0.02 })!
  assert.deepEqual(reversed.perMember.slice().reverse(), result.perMember)
})

test('invalid values, duplicate ids, empty groups, and aggregate overflow are rejected', () => {
  for (const value of [0, -1, NaN, Infinity, 1.234, 100000000]) {
    assert.equal(planGroupSplit({ ...input, members: [{ id: 'bad', allocatedMeters: value }] }), null)
    assert.equal(planGroupSplit({ ...input, dailyOutput: value }), null)
  }
  assert.equal(planGroupSplit({ ...input, members: [] }), null)
  assert.equal(planGroupSplit({ ...input, members: [{ id: '', allocatedMeters: 1 }] }), null)
  assert.equal(planGroupSplit({ ...input, members: [{ id: 'a', allocatedMeters: 1 }, { id: 'a', allocatedMeters: 2 }] }), null)
  assert.equal(planGroupSplit({ ...input, members: [{ id: 'a', allocatedMeters: 99999999.99 }, { id: 'b', allocatedMeters: 0.01 }] }), null)
  assert.equal(planGroupSplit({ ...input, stopDate: '2026-02-30' }), null)
  assert.equal(planGroupSplit({ ...input, stopDate: '2026-10-25' }), null)
})

test('large Decimal values preserve exact cent totals despite unsafe Number products', () => {
  const result = planGroupSplit({
    ...input,
    members: [{ id: 'a', allocatedMeters: 55555555.55 }, { id: 'b', allocatedMeters: 44444444.44 }],
    dailyOutput: 77777777.77,
  })!
  assert.ok(result)
  assert.equal(result.groupTotal, 99999999.99)
  assert.equal(result.perMember.reduce((sum, row) => sum + Math.round(row.woven * 100), 0), 7777777777)
  assert.equal(result.perMember.reduce((sum, row) => sum + Math.round(row.remaining * 100), 0), 2222222222)
})

test('varied group sizes conserve each member and group cents; input remains unchanged', () => {
  for (let size = 1; size <= 50; size++) {
    const members = Array.from({ length: size }, (_, index) => ({
      id: 'line-' + index, allocatedMeters: (index * 997 + 1) / 100,
    }))
    const snapshot = JSON.stringify(members)
    const result = planGroupSplit({ ...input, members, dailyOutput: 123.45 })!
    assert.ok(result)
    const centSum = (key: 'woven' | 'remaining') => result.perMember.reduce((sum, row) => sum + Math.round(row[key] * 100), 0)
    assert.equal(centSum('woven'), Math.round(result.estimatedWovenMeters * 100))
    assert.equal(centSum('remaining'), Math.round(result.remainingMeters * 100))
    result.perMember.forEach((row, index) => {
      assert.equal(Math.round(row.woven * 100) + Math.round(row.remaining * 100), Math.round(members[index].allocatedMeters * 100))
      assert.ok(row.woven === 0 || validSplitPlanningValue(row.woven))
      assert.ok(row.remaining === 0 || validSplitPlanningValue(row.remaining))
    })
    assert.equal(JSON.stringify(members), snapshot)
  }
})
