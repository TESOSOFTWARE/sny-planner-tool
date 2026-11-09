import test from 'node:test'
import assert from 'node:assert/strict'
import { permissionForRequest, PERMISSIONS, ADMIN_ONLY_PERMISSIONS } from './permissions'

test('permission catalog is unique and all keys belong to declared modules', () => {
  assert.equal(new Set(PERMISSIONS).size, PERMISSIONS.length)
  for (const key of PERMISSIONS) assert.match(key, /^[a-z]+\.[a-z.]+$/)
})
test('production routes map to least-action permission by operation', () => {
  assert.equal(permissionForRequest('/api/orders', 'GET'), 'orders.read')
  assert.equal(permissionForRequest('/api/orders/multi-line', 'POST'), 'orders.create')
  assert.equal(permissionForRequest('/api/orders/42/approve', 'POST'), 'orders.approve')
  assert.equal(permissionForRequest('/api/orders/bulk-delete', 'POST'), 'orders.import')
  assert.equal(permissionForRequest('/api/customers', 'POST'), 'customers.create')
  assert.equal(permissionForRequest('/api/customers/search', 'GET'), 'customers.read')
  assert.equal(permissionForRequest('/api/assignments/42', 'DELETE'), 'schedule.remove')
  assert.equal(permissionForRequest('/api/production-records', 'GET'), 'output.read')
  assert.equal(permissionForRequest('/api/users', 'POST'), 'access.users.manage')
  assert.equal(permissionForRequest('/api/roles', 'POST'), 'access.roles.manage')
})
test('unknown endpoint denies by default and privileged administration keys are isolated', () => {
  assert.equal(permissionForRequest('/api/unregistered-secret', 'GET'), null)
  assert.deepEqual(ADMIN_ONLY_PERMISSIONS, ['access.users.manage', 'access.roles.manage'])
})
