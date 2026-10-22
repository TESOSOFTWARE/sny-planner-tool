import test from 'node:test'
import assert from 'node:assert/strict'
import { sameSpecGroup, specKey, specWhere, groupCandidates, roundMeters, assignmentGroups, expandToGroups } from './specGroup'
import { overlapWhere } from './assignmentLock'

const a = { piNumber: '26HSIA1001', widthM: 4.5, gsm: 230, color: 'BLACK', meshType: 'Shade net M+M' }

test('cùng nhóm: trim + hoa thường; null chỉ khớp null', () => {
  assert.equal(sameSpecGroup(a, { ...a, color: ' black ', meshType: 'SHADE NET m+m' }), true)
  assert.equal(sameSpecGroup({ ...a, meshType: null }, { ...a, meshType: null }), true)
  assert.equal(sameSpecGroup({ ...a, meshType: null }, a), false)
})

test('khác khổ / GSM / màu / PI -> khác nhóm', () => {
  for (const o of [{ widthM: 4.3 }, { gsm: 200 }, { color: 'WHITE' }, { piNumber: '26HSIA1002' }]) assert.equal(sameSpecGroup(a, { ...a, ...o }), false)
})

test('thiếu trường quy cách (undefined) hoặc không có đơn -> không bao giờ cùng nhóm', () => {
  const { meshType: _omit, ...partial } = a
  assert.equal(specKey(partial), null)
  assert.equal(sameSpecGroup(partial, partial), false)
  assert.equal(sameSpecGroup(null, null), false)
  assert.equal(specWhere(partial), null)
})

test('overlapWhere: có group -> loại lịch cùng nhóm; không group -> y như cũ (không có NOT)', () => {
  const plain = overlapWhere('M-014', '2026-10-26', '2026-10-27')
  assert.equal(Object.hasOwn(plain, 'NOT'), false)
  assert.equal(Object.hasOwn(overlapWhere('M-014', '2026-10-26', '2026-10-27', [], { piNumber: 'X' }), 'NOT'), false)
  const grouped = overlapWhere('M-014', '2026-10-26', '2026-10-27', ['a'], a) as { NOT: { order: Record<string, unknown> }; machineId: string }
  assert.equal(grouped.machineId, 'M-014')
  assert.deepEqual(grouped.NOT.order.widthM, 4.5)
  assert.deepEqual(grouped.NOT.order.meshType, { equals: 'Shade net M+M', mode: 'insensitive' })
})

test('R-1: guard NOT NULL cho MỌI trường nhóm có giá trị; trường nhóm = null thì không thêm guard', () => {
  const full = specWhere(a) as { NOT?: Record<string, null>[] }
  assert.deepEqual(full.NOT, [{ widthM: null }, { gsm: null }, { color: null }, { meshType: null }])
  const noMesh = specWhere({ ...a, meshType: null }) as { NOT?: Record<string, null>[]; meshType: unknown }
  assert.equal(noMesh.meshType, null)
  assert.deepEqual(noMesh.NOT, [{ widthM: null }, { gsm: null }, { color: null }])
  const onlyPi = specWhere({ piNumber: 'X', widthM: null, gsm: null, color: null, meshType: null }) as { NOT?: unknown }
  assert.equal(onlyPi.NOT, undefined)
})

test('R-2: overlapWhere chỉ miễn dòng KHÁC — loại trừ theo id dòng đang lưu', () => {
  const where = overlapWhere('M-014', '2026-10-26', '2026-10-27', [], a, ['own-1', 'own-2']) as { NOT: { order: unknown; orderId: unknown } }
  assert.deepEqual(where.NOT.orderId, { notIn: ['own-1', 'own-2'] })
  const noOwn = overlapWhere('M-014', '2026-10-26', '2026-10-27', [], a) as { NOT: { orderId?: unknown } }
  assert.equal(noOwn.NOT.orderId, undefined)
})

const line = (id: string, subLineIndex: number, extra: Record<string, unknown> = {}) => ({ id, subLineIndex, ...a, lengthM: 10, assignments: [] as unknown[], ...extra })

test('groupCandidates: đúng các dòng cùng quy cách chưa có lịch, theo thứ tự dòng; bỏ khác khổ và đã có lịch', () => {
  const rows = [line('l2', 2), line('l0', 0), line('l1', 1), line('x', 3, { widthM: 4.3 }), line('y', 4, { assignments: [{}] }), line('z', 5, { piNumber: 'OTHER' })]
  assert.deepEqual(groupCandidates(rows, rows[1]).map(o => o.id), ['l1', 'l2'])
})

test('groupCandidates: dòng đã chọn đã có lịch / không chọn -> không gợi ý', () => {
  const rows = [line('a', 0, { assignments: [{}] }), line('b', 1)]
  assert.deepEqual(groupCandidates(rows, rows[0]), [])
  assert.deepEqual(groupCandidates(rows, null), [])
})

test('roundMeters: 446.4+180.6+15 = 642 (không lệch số thực)', () => assert.equal(roundMeters(446.4 + 180.6 + 15), 642))

const day = (v: string | Date) => String(v).slice(0, 10)
const asg = (id: string, sub: number, extra: Record<string, unknown> = {}, order: Record<string, unknown> = {}) =>
  ({ id, machineId: 'M-014', startDate: '2026-10-26', endDate: '2026-10-27', order: { ...a, subLineIndex: sub, ...order }, ...extra })

test('assignmentGroups: cùng máy + quy cách + ngày bắt đầu/kết thúc -> 1 nhóm; lệch ngày hoặc khác quy cách/máy -> tách riêng', () => {
  const rows = [asg('l2', 2), asg('l0', 0), asg('l1', 1), asg('late', 3, { endDate: '2026-10-28' }), asg('x', 4, {}, { widthM: 4.3 }), asg('m', 5, { machineId: 'M-015' })]
  const groups = assignmentGroups(rows, day)
  assert.equal(groups.length, 4)
  assert.deepEqual(groups.find(g => g.length > 1)!.map(r => r.id), ['l0', 'l1', 'l2'])
})

test('assignmentGroups: thiếu quy cách -> không gộp', () => {
  const rows = [asg('a', 0, {}, { meshType: undefined }), asg('b', 1, {}, { meshType: undefined })]
  assert.equal(assignmentGroups(rows, day).length, 2)
})

test('expandToGroups: tick 1 dòng nhóm = chọn cả nhóm; lịch lẻ giữ nguyên; không trùng', () => {
  const groups = assignmentGroups([asg('l0', 0), asg('l1', 1), asg('solo', 2, { endDate: '2026-10-29' })], day)
  assert.deepEqual(expandToGroups(['l1'], groups).sort(), ['l0', 'l1'])
  assert.deepEqual(expandToGroups(['solo', 'l0', 'l1'], groups).sort(), ['l0', 'l1', 'solo'])
  assert.deepEqual(expandToGroups(['unknown'], groups), ['unknown'])
})
