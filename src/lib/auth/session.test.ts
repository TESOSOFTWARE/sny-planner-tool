import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'

const singleton = globalThis as unknown as { prisma: unknown }, previous = singleton.prisma
let expiresAt = new Date(Date.now() + 60_000), queries = 0
let authError: typeof import('./session').authError
before(async () => {
  singleton.prisma = { snySession: { findUnique: async ({ where }: { where: { tokenHash: string } }) => {
    queries++; assert.match(where.tokenHash, /^[a-f0-9]{64}$/); assert.notEqual(where.tokenHash, 'a'.repeat(64))
    return { expiresAt, user: { id: 'test', email: 'test@example.invalid' } }
  } } }
  authError = (await import('./session')).authError
})
after(() => { singleton.prisma = previous })
function request(cookie = '', origin = 'http://qa.invalid') {
  return new Request('http://qa.invalid/api/orders', { headers: { Cookie: cookie, Host: 'qa.invalid', Origin: origin } })
}
test('missing/malformed session never queries DB', async () => {
  assert.equal((await authError('GET', request()))?.status, 401)
  assert.equal((await authError('GET', request('sny_session=bad')))?.status, 401)
  assert.equal(queries, 0)
})
test('expired sessions rejected; valid session requires same-origin for mutations', async () => {
  const cookie = 'sny_session=' + 'a'.repeat(64)
  expiresAt = new Date(0)
  assert.equal((await authError('GET', request(cookie)))?.status, 401)
  expiresAt = new Date(Date.now() + 60_000)
  assert.equal(await authError('GET', request(cookie)), null)
  assert.equal((await authError('POST', request(cookie, 'http://untrusted.invalid')))?.status, 403)
  assert.equal(await authError('POST', request(cookie)), null)
})
