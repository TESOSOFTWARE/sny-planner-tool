import test from 'node:test'
import assert from 'node:assert/strict'
import { hashPassword, verifyPassword } from './password'
test('passwords have independent salts and reject wrong credentials', async () => {
  const one = await hashPassword('A-long-test-password!'), two = await hashPassword('A-long-test-password!')
  assert.notEqual(one, two)
  assert.ok(await verifyPassword('A-long-test-password!', one))
  assert.equal(await verifyPassword('wrong', one), false)
  assert.equal(await verifyPassword('wrong', 'invalid'), false)
})
