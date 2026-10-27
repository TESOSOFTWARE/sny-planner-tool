import test, { before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { NextRequest } from 'next/server'

const materials = [
  { id: 'a', name: '9043 BRROWN', group: 'MB', stockReportDate: null, reportSnapshots: [] },
  { id: 'b', name: '9043 BROWN', group: 'MB', stockReportDate: null, reportSnapshots: [] },
  { id: 'c', name: 'HDPE SAME', group: 'HDPE', stockReportDate: null, reportSnapshots: [] },
]
let updates = 0
const tx = {
  $executeRawUnsafe: async () => undefined,
  material: {
    findUnique: async ({ where }: { where: { id: string } }) => materials.find(m => m.id === where.id),
    findMany: async ({ where }: { where: { group: string } }) => materials.filter(m => m.group === where.group),
    update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      updates++
      return { ...materials.find(m => m.id === where.id), ...data, currentStock: 0, minThreshold: null, createdAt: new Date(), updatedAt: new Date() }
    },
  },
}
const fake = { $transaction: async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx) }
const singleton = globalThis as unknown as { prisma: unknown }, previous = singleton.prisma
let patch: typeof import('./route').PATCH
before(async () => { singleton.prisma = fake; patch = (await import('./route')).PATCH })
after(() => { singleton.prisma = previous })
beforeEach(() => { updates = 0 })
function request(name: string) { return new NextRequest('http://localhost/api/materials/a', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) }) }
test('duplicate normalized name within group is rejected', async () => {
  const res = await patch(request('  9043   brown  '), { params: { id: 'a' } })
  assert.equal(res.status, 409)
  assert.equal(updates, 0)
})
test('same name in a different group is accepted', async () => {
  const res = await patch(request('HDPE SAME'), { params: { id: 'a' } })
  assert.equal(res.status, 200)
  assert.equal(updates, 1)
})
