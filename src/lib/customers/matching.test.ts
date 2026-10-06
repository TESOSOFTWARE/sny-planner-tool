import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeCustomerName,
  cleanCustomerName,
  findCustomerMatch,
  type CustomerCandidate,
} from './matching'

test('normalizeCustomerName trims, lowercases, and collapses whitespace', () => {
  assert.equal(normalizeCustomerName('  GROMAX   CO.  '), 'gromax co.')
  assert.equal(normalizeCustomerName('SEDCO'), 'sedco')
  assert.equal(normalizeCustomerName(null), '')
})

test('cleanCustomerName removes corporate suffixes and punctuation', () => {
  assert.equal(cleanCustomerName('SEDCO CO., LTD.'), 'sedco')
  assert.equal(cleanCustomerName('GROMAX INC.'), 'gromax')
  assert.equal(cleanCustomerName('TARPSWIN TRADING CORP'), 'tarpswin')
})

test('findCustomerMatch: exact match with case and spacing variations', () => {
  const candidates: CustomerCandidate[] = [
    { id: 'c-1', name: 'SEDCO CO., LTD.' },
    { id: 'c-2', name: 'GROMAX' },
  ]

  const res1 = findCustomerMatch('  sedco co., ltd.  ', candidates)
  assert.equal(res1.status, 'MATCHED')
  assert.equal(res1.customer?.id, 'c-1')

  const res2 = findCustomerMatch('gromax', candidates)
  assert.equal(res2.status, 'MATCHED')
  assert.equal(res2.customer?.id, 'c-2')
})

test('findCustomerMatch: fuzzy corporate alias match (DoD-2.1)', () => {
  const candidates: CustomerCandidate[] = [
    { id: 'c-1', name: 'SEDCO CO., LTD.' },
    { id: 'c-2', name: 'GROMAX INC.' },
    { id: 'c-3', name: 'INTERWAY TRADING' },
  ]

  // Query without corporate suffix should safely resolve to the unique candidate
  const res1 = findCustomerMatch('SEDCO', candidates)
  assert.equal(res1.status, 'MATCHED')
  assert.equal(res1.customer?.id, 'c-1')

  const res2 = findCustomerMatch('GROMAX', candidates)
  assert.equal(res2.status, 'MATCHED')
  assert.equal(res2.customer?.id, 'c-2')

  const res3 = findCustomerMatch('INTERWAY', candidates)
  assert.equal(res3.status, 'MATCHED')
  assert.equal(res3.customer?.id, 'c-3')
})

test('findCustomerMatch: ambiguous match returns AMBIGUOUS and does not pick arbitrarily (DoD-2.2)', () => {
  const candidates: CustomerCandidate[] = [
    { id: 'c-1', name: 'SEDCO CO., LTD.' },
    { id: 'c-2', name: 'SEDCO INC.' },
  ]

  const res = findCustomerMatch('SEDCO', candidates)
  assert.equal(res.status, 'AMBIGUOUS')
  assert.equal(res.customer, null)
  assert.ok(res.reason?.includes('khớp với nhiều bản ghi'))
})

test('findCustomerMatch: unmatched customer returns UNMATCHED (DoD-2.3)', () => {
  const candidates: CustomerCandidate[] = [
    { id: 'c-1', name: 'SEDCO' },
  ]

  const res = findCustomerMatch('BRAND NEW FACTORY', candidates)
  assert.equal(res.status, 'UNMATCHED')
  assert.equal(res.customer, null)
})
