// Checks dynamic RBAC on local PostgreSQL and HTTP app; removes every fixture in finally.
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { hashPassword } from '../src/lib/auth/password'
const prisma = new PrismaClient(), base = process.env.SNY_TEST_URL ?? 'http://127.0.0.1:3000'
const userIds: string[] = [], roleIds: string[] = []
const rand = () => randomBytes(6).toString('hex')
const post = (path: string, body: unknown, cookie: string) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, Cookie: cookie }, body: JSON.stringify(body) })

async function main() {
  const target = new URL(process.env.DATABASE_URL ?? '')
  assert.equal(target.hostname, '127.0.0.1'); assert.equal(target.port, '55432'); assert.equal(target.pathname, '/sny_planner_local')
  const server = new URL(base)
  assert.equal(server.hostname, '127.0.0.1'); assert.ok(['3000', '3010'].includes(server.port))
  try {
    const adminRole = await prisma.snyRole.findUnique({ where: { name: 'Admin' } }); assert.ok(adminRole, 'Bootstrap Admin first')
    const email = 'rbac-admin-' + rand() + '@example.invalid', password = randomBytes(18).toString('base64url')
    const admin = await prisma.snyUser.create({ data: { email, passwordHash: await hashPassword(password), roles: { create: { roleId: adminRole.id } } } }); userIds.push(admin.id)
    let response = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify({ email, password }) })
    assert.equal(response.status, 200); const adminCookie = response.headers.get('set-cookie')?.split(';')[0]; assert.ok(adminCookie)
    response = await post('/api/roles', { name: 'RBAC test output reader ' + rand(), description: 'temporary local fixture', permissions: ['output.read'] }, adminCookie)
    assert.equal(response.status, 201, await response.clone().text()); const role = (await response.json()).role; roleIds.push(role.id)
    response = await post('/api/roles', { name: 'RBAC test escalation ' + rand(), permissions: ['access.users.manage'] }, adminCookie)
    assert.equal(response.status, 422, 'custom role cannot grant admin-only permission')
    const viewerEmail = 'rbac-viewer-' + rand() + '@example.invalid', viewerPassword = randomBytes(18).toString('base64url')
    response = await post('/api/users', { email: viewerEmail, password: viewerPassword, roleIds: [role.id] }, adminCookie)
    assert.equal(response.status, 201, await response.clone().text()); userIds.push((await response.json()).user.id)
    response = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify({ email: viewerEmail, password: viewerPassword }) })
    assert.equal(response.status, 200); const viewerCookie = response.headers.get('set-cookie')?.split(';')[0]; assert.ok(viewerCookie)
    assert.equal((await fetch(base + '/api/production-records?stage=extruder', { headers: { Cookie: viewerCookie } })).status, 200)
    assert.equal((await fetch(base + '/api/customers', { headers: { Cookie: viewerCookie } })).status, 403)
    assert.equal((await fetch(base + '/api/roles', { headers: { Cookie: viewerCookie } })).status, 403)
    console.log('PASS: Admin tao role/account; role thuong khong cap quyen quan tri; endpoint duoc cap 200; endpoint ngoai quyen 403.')
  } finally {
    if (userIds.length) await prisma.snyUser.deleteMany({ where: { id: { in: userIds } } })
    if (roleIds.length) await prisma.snyRole.deleteMany({ where: { id: { in: roleIds } } })
    await prisma.$disconnect()
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
