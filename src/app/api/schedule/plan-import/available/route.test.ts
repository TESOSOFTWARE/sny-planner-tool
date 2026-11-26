import assert from 'node:assert/strict'
import test, { after, before } from 'node:test'
import { NextRequest } from 'next/server'
import { withTestSession } from '@/lib/auth/testSession'

const queriedProfiles: string[] = []
const fake = {
  productionStagePlanImportBatch: {
    findFirst: async ({ where }: { where: { profile: string } }) => {
      queriedProfiles.push(where.profile)
      if (where.profile === 'fiber-demand-matrix') return { profile: where.profile, scopeKey: '2026-04', fileName: 'CHI KEO SOI APR.xlsx', confirmedAt: new Date('2026-04-02T00:00:00Z') }
      if (where.profile === 'extruder-machine') return { profile: where.profile, scopeKey: '2026-02', fileName: 'EXTRUDER FEB.xlsx', confirmedAt: new Date('2026-02-03T00:00:00Z') }
      return null
    },
  },
}
const singleton = globalThis as unknown as { prisma: unknown }
const previous = singleton.prisma
let get: typeof import('./route').GET

before(async () => {
  singleton.prisma = fake
  get = withTestSession((await import('./route')).GET, fake)
})
after(() => { singleton.prisma = previous })

test('available plans select the most recently confirmed profile and its month', async () => {
  const response = await get(new NextRequest('http://qa.invalid/api/schedule/plan-import/available?stage=extruder'))
  assert.equal(response.status, 200)
  assert.deepEqual(queriedProfiles.slice(-2), ['extruder-machine', 'fiber-demand-matrix'])
  const body = await response.json()
  assert.equal(body.profiles[0].profile, 'fiber-demand-matrix')
  assert.equal(body.profiles[0].scopeKey, '2026-04')
})

test('unknown schedule stage is rejected without querying the database', async () => {
  const beforeCount = queriedProfiles.length
  const response = await get(new NextRequest('http://qa.invalid/api/schedule/plan-import/available?stage=unknown'))
  assert.equal(response.status, 422)
  assert.equal(queriedProfiles.length, beforeCount)
})
