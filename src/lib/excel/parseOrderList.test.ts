import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as XLSX from 'xlsx'
import { parseOrderList, classifyOrderImport, normalizeUvPct } from './parseOrderList'
import type { ProductionOrder } from '@/types'

function makeOrderListWorkbook(headers: string[], rows: unknown[][]): Buffer {
  const wb = XLSX.utils.book_new()
  const data = [
    ['TITLE / METADATA ROW'],
    headers,
    ...rows,
  ]
  const ws = XLSX.utils.aoa_to_sheet(data)
  XLSX.utils.book_append_sheet(wb, ws, 'ORDER LIST')
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
}

const standardHeaders = [
  'PI NUMBER', 'CUSTOMER', 'NO', 'DATE', 'GSM', 'WIDTH', 'LENGTH', 'COLOR',
  'ORDER TYPE', 'QTY', 'ROLL LEN', 'PIECE LEN', 'UV', 'FR', 'FR %',
  'DESCRIPTION', 'REMARK', 'MB CODE', 'PROD GSM', 'MESH TYPE',
  'SỐ KIM', 'SỐ DÀN', 'NOTE', 'PACKING', 'DELIVERY DATE', 'CONTAINER',
  'EYELET', 'EYELET COLOR', 'EYELET LINE', 'EYELET SPEC',
]

test('DoD-1.1: Import file with blank NO cells parses all rows without dropping any', () => {
  const rows: unknown[][] = []
  // 30 rows total: 20 with explicit NO, 10 with blank NO
  for (let i = 1; i <= 30; i++) {
    const isBlankNo = i % 3 === 0 // 10 rows will be blank NO
    rows.push([
      `PI-2026-${Math.ceil(i / 5)}`, // 6 PIs, each with 5 sub-lines
      'CUSTOMER-A',
      isBlankNo ? null : i,
      '2026-09-10',
      100, // GSM
      4.0, // width
      1000, // length
      'BLUE',
      'meters',
    ])
  }

  const buffer = makeOrderListWorkbook(standardHeaders, rows)
  const parsed = parseOrderList(buffer)

  assert.equal(parsed.length, 30, 'All 30 rows must be parsed, none dropped')
  for (const row of parsed) {
    assert.ok(row.subLineIndex != null && row.subLineIndex > 0, 'Every row must have a positive subLineIndex')
  }
})

test('DoD-1.2: Generated NO reserves explicit numbers appearing later in the same PI group', () => {
  // PI-MULTI has:
  // Row 1: explicit NO = 1
  // Row 2: blank NO (should get 3, because 2 appears later!)
  // Row 3: explicit NO = 2
  const rows: unknown[][] = [
    ['PI-MULTI', 'CUST-A', 1, '2026-09-10', 100, 4.0, 1000, 'BLUE', 'meters'],
    ['PI-MULTI', 'CUST-A', null, '2026-09-10', 100, 4.0, 1000, 'GREEN', 'meters'],
    ['PI-MULTI', 'CUST-A', 2, '2026-09-10', 100, 4.0, 1000, 'RED', 'meters'],
  ]

  const buffer = makeOrderListWorkbook(standardHeaders, rows)
  const parsed = parseOrderList(buffer)

  assert.equal(parsed.length, 3)
  assert.equal(parsed[0].subLineIndex, 1)
  assert.equal(parsed[1].subLineIndex, 3, 'Blank NO must skip reserved NO=2 and receive 3')
  assert.equal(parsed[2].subLineIndex, 2)

  // Ensure no duplicate (piNumber, subLineIndex)
  const keys = parsed.map(r => `${r.piNumber}#${r.subLineIndex}`)
  assert.equal(new Set(keys).size, 3, 'All subLineIndex must be unique within the PI')
})

test('DoD-1.3 & 1.4: classifyOrderImport classifies new, identical, conflict, and invalid rows accurately', () => {
  const existingOrders = [
    {
      id: 'ord-1',
      piNumber: 'PI-IDENTICAL',
      subLineIndex: 1,
      customer: { name: 'CUST-A' },
      customerId: 'c-1',
      orderDate: new Date('2026-09-10T00:00:00.000Z'),
      widthM: 4.0 as any,
      lengthM: 1000 as any,
      gsm: 100,
      color: 'BLUE',
      orderType: 'meters',
      isDraft: false,
    } as unknown as ProductionOrder,
    {
      id: 'ord-2',
      piNumber: 'PI-CONFLICT',
      subLineIndex: 1,
      customer: { name: 'CUST-A' },
      customerId: 'c-1',
      orderDate: new Date('2026-09-10T00:00:00.000Z'),
      widthM: 4.0 as any,
      lengthM: 1000 as any,
      gsm: 100,
      color: 'BLUE',
      orderType: 'meters',
      isDraft: false,
    } as unknown as ProductionOrder,
  ]

  const incomingRows = [
    // 1. Identical to ord-1
    {
      piNumber: 'PI-IDENTICAL',
      subLineIndex: 1,
      customer: 'CUST-A',
      orderDate: '2026-09-10',
      widthM: 4.0,
      lengthM: 1000,
      gsm: 100,
      color: 'BLUE',
      orderType: 'meters' as const,
      isValid: true,
      validationErrors: [],
    },
    // 2. Conflict with ord-2: same PI + subLine, but width changed to 6.0
    {
      piNumber: 'PI-CONFLICT',
      subLineIndex: 1,
      customer: 'CUST-A',
      orderDate: '2026-09-10',
      widthM: 6.0,
      lengthM: 1000,
      gsm: 100,
      color: 'BLUE',
      orderType: 'meters' as const,
      isValid: true,
      validationErrors: [],
    },
    // 3. New subline (NO=2) on PI-IDENTICAL
    {
      piNumber: 'PI-IDENTICAL',
      subLineIndex: 2,
      customer: 'CUST-A',
      orderDate: '2026-09-10',
      widthM: 4.0,
      lengthM: 2000,
      gsm: 100,
      color: 'RED',
      orderType: 'meters' as const,
      isValid: true,
      validationErrors: [],
    },
    // 4. Brand new PI
    {
      piNumber: 'PI-BRAND-NEW',
      subLineIndex: 1,
      customer: 'CUST-B',
      orderDate: '2026-09-12',
      widthM: 3.5,
      lengthM: 5000,
      gsm: 120,
      color: 'WHITE',
      orderType: 'meters' as const,
      isValid: true,
      validationErrors: [],
    },
    // 5. Invalid row (missing color, zero GSM)
    {
      piNumber: 'PI-INVALID',
      subLineIndex: 1,
      customer: 'CUST-C',
      orderDate: '2026-09-12',
      widthM: 0,
      lengthM: 0,
      gsm: 0,
      color: '',
      orderType: 'meters' as const,
      isValid: false,
      validationErrors: ['Thiếu Màu', 'Thiếu GSM (>0)', 'Thiếu Khổ m (>0)'],
    },
  ]

  const decisions = classifyOrderImport(incomingRows as any, existingOrders)

  assert.equal(decisions.length, 5)
  assert.equal(decisions[0].status, 'identical', 'Row 1 must be identical')
  assert.equal(decisions[1].status, 'conflict', 'Row 2 must conflict on changed width')
  assert.equal(decisions[2].status, 'new', 'Row 3 is a new subline on existing PI')
  assert.equal(decisions[3].status, 'new', 'Row 4 is a brand new PI')
  assert.equal(decisions[4].status, 'invalid', 'Row 5 must be marked invalid')
})

test('Internal file conflict: identical (PI, subline) with different content in same file', () => {
  const incomingRows = [
    {
      piNumber: 'PI-DUP',
      subLineIndex: 1,
      customer: 'CUST-A',
      orderDate: '2026-09-10',
      widthM: 4.0,
      lengthM: 1000,
      gsm: 100,
      color: 'BLUE',
      orderType: 'meters' as const,
      isValid: true,
    },
    {
      piNumber: 'PI-DUP',
      subLineIndex: 1,
      customer: 'CUST-A',
      orderDate: '2026-09-10',
      widthM: 5.0, // different width
      lengthM: 1000,
      gsm: 100,
      color: 'BLUE',
      orderType: 'meters' as const,
      isValid: true,
    },
  ]
  const decisions = classifyOrderImport(incomingRows as any, [])
  assert.equal(decisions[0].status, 'conflict')
  assert.equal(decisions[1].status, 'conflict')
})

test('UV% 4-tier contract: normalizeUvPct converts Excel values and percentages to 0-100 scale', () => {
  // 1. Decimal representation in Excel (0.02 = 2%)
  assert.equal(normalizeUvPct(0.02), 2)
  assert.equal(normalizeUvPct(0.015), 1.5)
  assert.equal(normalizeUvPct(0.005), 0.5)

  // 2. String representation with % sign
  assert.equal(normalizeUvPct('2%'), 2)
  assert.equal(normalizeUvPct(' 2.5 % '), 2.5)
  assert.equal(normalizeUvPct('0.5%'), 0.5)

  // 3. String representation as decimal
  assert.equal(normalizeUvPct('0.02'), 2)
  assert.equal(normalizeUvPct('2'), 2)
  assert.equal(normalizeUvPct('2.0'), 2)

  // 4. Zero and Boundary cases
  assert.equal(normalizeUvPct(0), 0)
  assert.equal(normalizeUvPct('0'), 0)
  assert.equal(normalizeUvPct(null), null)
  assert.equal(normalizeUvPct(undefined), null)
  assert.equal(normalizeUvPct(''), null)
  assert.equal(normalizeUvPct('invalid'), null)
})

test('UV% Excel import round-trip: raw cells parsed into 0-100 percentage scale', () => {
  const rows = [
    // Row 1: UV entered as 0.02 (Excel percentage format)
    ['PI-UV-1', 'CUST-A', 1, '2026-09-10', 100, 4.0, 1000, 'BLUE', 'meters', null, null, null, 0.02],
    // Row 2: UV entered as '2%' string
    ['PI-UV-2', 'CUST-A', 1, '2026-09-10', 100, 4.0, 1000, 'BLUE', 'meters', null, null, null, '2%'],
    // Row 3: UV entered as integer 2
    ['PI-UV-3', 'CUST-A', 1, '2026-09-10', 100, 4.0, 1000, 'BLUE', 'meters', null, null, null, 2],
    // Row 4: UV entered as empty/null
    ['PI-UV-4', 'CUST-A', 1, '2026-09-10', 100, 4.0, 1000, 'BLUE', 'meters', null, null, null, null],
  ]

  const buf = makeOrderListWorkbook(standardHeaders, rows)
  const parsed = parseOrderList(buf)

  assert.equal(parsed.length, 4)
  assert.equal(parsed[0].uvPct, 2, '0.02 from Excel should be normalized to 2%')
  assert.equal(parsed[1].uvPct, 2, '"2%" string should be normalized to 2%')
  assert.equal(parsed[2].uvPct, 2, '2 from Excel should be normalized to 2%')
  assert.equal(parsed[3].uvPct, null, 'null cell should remain null')
})

