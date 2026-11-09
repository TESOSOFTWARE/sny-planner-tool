// [MoM 30/10 §4] Integration check only against the isolated local database/server.
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { hashPassword } from '../src/lib/auth/password'

async function main() {
  const target = new URL(process.env.DATABASE_URL ?? '')
  assert.equal(target.hostname, '127.0.0.1'); assert.equal(target.port, '55432'); assert.equal(target.pathname, '/sny_planner_local')
  const base = process.env.SNY_TEST_URL ?? 'http://127.0.0.1:3010', prisma = new PrismaClient()
  const server = new URL(base)
  assert.equal(server.hostname, '127.0.0.1'); assert.ok(['3000', '3010'].includes(server.port))
  const email = `authcheck-${randomBytes(8).toString('hex')}@example.invalid`, password = randomBytes(24).toString('hex')
  let userId: string | undefined
  const post = (path: string, body: unknown, cookie = '', origin = base) => fetch(base + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin, Cookie: cookie }, body: JSON.stringify(body), redirect: 'manual',
  })
  try {
    const user = await prisma.snyUser.create({ data: { email, passwordHash: await hashPassword(password) } }); userId = user.id
    assert.equal((await fetch(base + '/api/customers')).status, 401)
    assert.equal((await fetch(base + '/orders', { redirect: 'manual' })).status, 307)
    assert.equal((await post('/api/auth/login', { email, password: 'wrong' })).status, 401)
    const login = await post('/api/auth/login', { email, password }); assert.equal(login.status, 200)
    const cookie = login.headers.get('set-cookie')?.split(';')[0]; assert.ok(cookie)
    assert.match(login.headers.get('set-cookie') ?? '', /httponly/i)
    assert.equal((await fetch(base + '/api/customers', { headers: { Cookie: cookie } })).status, 200)
    assert.equal((await post('/api/orders', {}, cookie, 'http://untrusted.invalid')).status, 403)
    assert.equal((await post('/api/auth/logout', {}, cookie)).status, 200)
    assert.equal((await fetch(base + '/api/customers', { headers: { Cookie: cookie } })).status, 401)
    // Persisted lockout, not just a counter in the application process.
    for (let i = 0; i < 5; i++) assert.equal((await post('/api/auth/login', { email, password: 'wrong' })).status, 401)
    assert.equal((await post('/api/auth/login', { email, password })).status, 401)
    assert.ok((await prisma.snyUser.findUniqueOrThrow({ where: { id: user.id } })).lockedUntil)
    console.log('PASS: unauthenticated access, redirect, incorrect password, session, CSRF, logout revocation, lockout.')
  } finally {
    if (userId) await prisma.snyUser.delete({ where: { id: userId } })
    await prisma.$disconnect()
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
