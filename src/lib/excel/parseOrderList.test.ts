import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as XLSX from 'xlsx'
import { parseOrderList, classifyOrderImport, normalizeUvPct, deduplicateValidationErrors } from './parseOrderList'
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


test('FR percentage-only template infers the flag and preserves percentage validation', () => {
  const headers = ['PI NUMBER', 'CUSTOMER', 'NO', 'DATE', 'GSM', 'WIDTH', 'LENGTH', 'COLOR', 'ORDER TYPE', 'FR %']
  for (const [pct, flag, valid] of [[6.5, true, true], [100, true, true], [0, false, true], [null, false, true], [-1, false, false], [101, true, false]] as const) {
    const [row] = parseOrderList(makeOrderListWorkbook(headers, [
      ['PI-FR', 'CUSTOMER-A', 1, '2026-09-29', 100, 4, 1000, 'BLACK', 'meters', pct],
    ]))
    assert.equal(row.frFlag, flag, `flag for ${pct}`)
    assert.equal(row.frPct, pct, `percentage for ${pct}`)
    assert.equal(row.isValid, valid, `validation for ${pct}: ${JSON.stringify(row.validationErrors)}`)
  }
})

test('UNIT fallback (01/10): real SNY files use UNIT column, empty PACKING must not default to ROLL', () => {
  const headers = ['PI NUMBER', 'CUSTOMER', 'NO', 'DATE', 'GSM', 'WIDTH', 'LENGTH', 'COLOR', 'ORDER TYPE', 'PACKING TYPE', 'UNIT']
  const cases: Array<[string | null, string | null, string, string, string]> = [
    // [packing cell, unit cell, expected orderType, expected packing, note]
    [null, 'ROLL', 'rolls', 'ROLL', 'cuon'],
    [null, 'PCS', 'pieces', 'CARTON', 'tam'],
    [null, 'PANEL', 'pieces', 'CARTON', 'tam lon'],
    [null, 'PACK/BOX', 'pieces', 'CARTON', 'thung'],
    [null, 'BOX', 'pieces', 'CARTON', 'thung'],
    [null, 'BALES', 'meters', 'BALE', 'kien so nhieu'],
    [null, 'BIG BAG BALE', 'meters', 'BALE', 'kien bao'],
    [null, null, 'rolls', 'ROLL', 'khong thong tin giu default cu'],
    // Explicit columns win over UNIT
    ['BALE', 'PCS', 'meters', 'BALE', 'packing tuong minh thang'],
  ]
  for (const [packing, unit, expectedType, expectedPacking, note] of cases) {
    const [row] = parseOrderList(makeOrderListWorkbook(headers, [
      ['PI-UNIT', 'CUSTOMER-A', 1, '2026-09-29', 240, 2, 50, 'BLACK', null, packing, unit],
    ]))
    assert.equal(row.orderType, expectedType, `orderType for UNIT="${unit}" (${note})`)
    assert.equal(row.primaryPackingType, expectedPacking, `packing for UNIT="${unit}" (${note})`)
  }
})

test('H4 (01/10): PACKING TYPE keywords from real SNY data map to HEMMED', () => {
  const headers = ['PI NUMBER', 'CUSTOMER', 'NO', 'DATE', 'GSM', 'WIDTH', 'LENGTH', 'COLOR', 'ORDER TYPE', 'PACKING TYPE']
  const cases: Array<[string, string, string | null]> = [
    // [packing cell, expected primaryPackingType, expected subPackingType]
    ['HEMMED', 'HEMMED', 'CARTON'],
    ['reinforced hemmed edges', 'HEMMED', 'CARTON'],
    ['Debris net HDPE, reinforced hemmed edges, grommets', 'HEMMED', 'CARTON'],
    ['WEBBING HEM', 'HEMMED', 'CARTON'],
    ['Finished size after including webbing hem on 4 edges', 'HEMMED', 'CARTON'],
    ['HEM', 'HEMMED', 'CARTON'],
    ['May viền, đóng khuy', 'HEMMED', 'CARTON'],
    // Precedence: HEMMED wins over CARTON/BALE mentioned in the same cell
    ['HEMMED CARTON', 'HEMMED', 'CARTON'],
    ['HEMMED - pack in BALE', 'HEMMED', 'BALE'],
    // False-positive guards: substrings without word boundary must NOT match
    ['CHEMICAL treatment', 'ROLL', null],
    ['THEME pack', 'ROLL', null],
    // Regression: normal packing flow intact
    ['Thùng (CARTON)', 'CARTON', null],
    ['Kiện (BALE)', 'BALE', null],
    ['Theo cuộn (ROLL)', 'ROLL', null],
  ]
  for (const [packing, expectedPrimary, expectedSub] of cases) {
    const [row] = parseOrderList(makeOrderListWorkbook(headers, [
      ['PI-HEM', 'CUSTOMER-A', 1, '2026-09-29', 240, 2, 5000, 'DESERT SAND', 'meters', packing],
    ]))
    assert.equal(row.primaryPackingType, expectedPrimary, `primary for "${packing}"`)
    assert.equal(row.subPackingType ?? null, expectedSub, `sub for "${packing}"`)
  }
})

test('Legacy FR column remains authoritative when present', () => {
  const headers = ['PI NUMBER', 'CUSTOMER', 'NO', 'DATE', 'GSM', 'WIDTH', 'LENGTH', 'COLOR', 'ORDER TYPE', 'FR', 'FR %']
  for (const [flag, pct, expected, valid] of [['YES', 6.5, true, true], ['NO', 6.5, false, true], ['YES', null, true, false]] as const) {
    const [row] = parseOrderList(makeOrderListWorkbook(headers, [
      ['PI-FR', 'CUSTOMER-A', 1, '2026-09-29', 100, 4, 1000, 'BLACK', 'meters', flag, pct],
    ]))
    assert.equal(row.frFlag, expected)
    assert.equal(row.isValid, valid)
  }
})

test('Header TÌNH TRẠNG ĐƠN parses DRAFT, RESERVED, APPROVED correctly', () => {
  const headers = ['PI NUMBER', 'CUSTOMER', 'NO', 'DATE', 'GSM', 'WIDTH', 'LENGTH', 'COLOR', 'ORDER TYPE', 'TÌNH TRẠNG ĐƠN *']
  const cases: Array<[string, 'DRAFT' | 'RESERVED' | 'APPROVED', boolean]> = [
    ['Đã chốt — sản xuất (APPROVED)', 'APPROVED', false],
    ['Giữ chỗ máy — được xếp lịch (RESERVED)', 'RESERVED', true],
    ['Đơn nháp — chưa xếp lịch được (DRAFT)', 'DRAFT', false],
    ['GIỮ CHỖ', 'RESERVED', true],
    ['NHÁP', 'DRAFT', false],
    ['CHÍNH THỨC', 'APPROVED', false],
  ]
  for (const [val, expectedStatus, expectedPlaceholder] of cases) {
    const [row] = parseOrderList(makeOrderListWorkbook(headers, [
      ['PI-STATUS', 'CUSTOMER-A', 1, '2026-10-02', 150, 3, 500, 'BLUE', 'meters', val],
    ]))
    assert.equal(row.lifecycleStatus, expectedStatus, `lifecycleStatus for "${val}"`)
    assert.equal(row.isPlaceholder, expectedPlaceholder, `isPlaceholder for "${val}"`)
  }
})

test('DRAFT order is valid even when missing color, GSM, width, and length', () => {
  const headers = ['PI NUMBER', 'CUSTOMER', 'NO', 'DATE', 'GSM', 'WIDTH', 'LENGTH', 'COLOR', 'ORDER TYPE', 'TÌNH TRẠNG ĐƠN *']
  const [row] = parseOrderList(makeOrderListWorkbook(headers, [
    ['DFT26-004', 'ALROBOOA', 1, '2026-10-05', null, null, null, null, 'meters', 'DRAFT'],
  ]))

  assert.equal(row.lifecycleStatus, 'DRAFT')
  assert.equal(row.isValid, true, 'Draft order without technical specs must be valid')
  assert.equal(row.validationErrors?.length ?? 0, 0)
})

test('deduplicateValidationErrors removes redundant manual and Zod messages for same fields', () => {
  const rawErrors = [
    'Thiếu Màu',
    'Màu là bắt buộc',
    'Thiếu GSM (>0)',
    'GSM phải > 0',
    'Thiếu Khổ m (>0)',
    'Khổ m phải > 0',
    'Thiếu PI Number',
    'PI Number là bắt buộc',
  ]
  const deduplicated = deduplicateValidationErrors(rawErrors)
  assert.equal(deduplicated.length, 4, 'Should reduce 8 duplicate messages to 4 clean field messages')
  assert.deepEqual(deduplicated, [
    'Thiếu Màu',
    'Thiếu GSM (>0)',
    'Thiếu Khổ m (>0)',
    'Thiếu PI Number',
  ])
})