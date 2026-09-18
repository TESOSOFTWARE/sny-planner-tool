// src/lib/excel/parseOrderList.ts
// Server-only utility — parses ORDER_LIST .xlsx file using SheetJS.
// Validates each row strictly against mandatory order rules matching MultiLineOrderForm.

import * as XLSX from 'xlsx'
import type { ParsedOrder } from '@/types'

// ── Value coercion helpers ────────────────────────────────────────────────────

function safeStr(v: unknown): string | null {
  if (v == null) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

function safeNum(v: unknown): number | null {
  if (v == null) return null
  if (v instanceof Date) return null
  const n = Number(v)
  return isNaN(n) ? null : n
}

function safeInt(v: unknown): number | null {
  const n = safeNum(v)
  return n == null ? null : Math.round(n)
}

function safeDate(v: unknown): string | null {
  if (v instanceof Date) {
    return v.toISOString().slice(0, 10)
  }
  if (typeof v === 'string' && v.trim()) {
    const d = new Date(v.trim())
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  }
  return null
}

function safeBool(v: unknown): boolean {
  if (v == null) return false
  if (typeof v === 'boolean') return v
  const s = String(v).trim().toLowerCase()
  if (s === 'true' || s === 'yes' || s === 'y' || s === 'x' || s === '1') return true
  const n = Number(v)
  return !isNaN(n) && n !== 0
}

// ── Column detector ───────────────────────────────────────────────────────────

function findColIdx(
  headers: unknown[],
  matcher: (h: string) => boolean,
): number {
  return headers.findIndex(
    (h) => h != null && typeof h === 'string' && matcher(h),
  )
}

// ── Main parser ───────────────────────────────────────────────────────────────

export function parseOrderList(buffer: Buffer): ParsedOrder[] {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true })
  const sheetName = wb.SheetNames[0]
  if (!sheetName) {
    console.warn('[parseOrderList] Workbook has no sheets')
    return []
  }

  const sheet = wb.Sheets[sheetName]
  const allRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: null,
  })

  if (allRows.length < 3) {
    console.warn('[parseOrderList] Sheet has fewer than 3 rows — no data to parse')
    return []
  }

  const headers = allRows[1] as unknown[]
  const dataRows = allRows.slice(2)

  // ── Locate columns by header name ─────────────────────────────────────────
  const piIdColIdx = findColIdx(
    headers,
    (h) => {
      const value = h.toUpperCase()
      return value.includes('PI NUMBER') || value.includes('PI ID')
    },
  )
  // ORDER LIST OFFICIAL labels the actual PI column itself "PI NUMBER".
  // Older templates may use "PI ID" as a label for a display/helper column
  // followed by the real PI value, so only those legacy headers advance one
  // column.  Blindly adding one turns the sequence column into the PI number.
  const piHeader = piIdColIdx >= 0 ? String(headers[piIdColIdx]).toUpperCase() : ''
  const exactPiColIdx = findColIdx(headers, h => h.trim().toUpperCase() === 'PI NUMBER')
  const piNumberColIdx = exactPiColIdx >= 0 ? exactPiColIdx : piIdColIdx >= 0
    ? (piHeader.includes('PI ID') && !piHeader.includes('PI NUMBER') ? piIdColIdx + 1 : piIdColIdx)
    : -1
  const subLineColIdx = 2

  const customerColIdx = findColIdx(headers, (h) => h.toUpperCase() === 'CUSTOMER')
  const dateColIdx = findColIdx(headers, (h) => h.toLowerCase() === 'date' || h.toUpperCase().includes('ORDER DATE'))
  const gsmColIdx = findColIdx(headers, (h) => h.toUpperCase() === 'GSM')
  const prodGsmColIdx = findColIdx(headers, (h) => h.toUpperCase().includes('PROD') && h.toUpperCase().includes('GSM'))
  const widthColIdx = findColIdx(headers, (h) => h.toUpperCase().includes('WIDTH'))
  const lengthColIdx = findColIdx(headers, (h) => h.toUpperCase().includes('LENGTH'))
  const colorColIdx = findColIdx(headers, (h) => h.toUpperCase() === 'COLOR')
  const uvColIdx = findColIdx(headers, (h) => h.toUpperCase() === 'UV')
  const frColIdx = findColIdx(headers, (h) => h.toUpperCase() === 'FR')
  const frPctColIdx = findColIdx(headers, (h) => h.toUpperCase().includes('FR%') || (h.toUpperCase().includes('FR') && h.includes('%')))
  const qtyColIdx = findColIdx(
    headers,
    (h) =>
      h.toUpperCase().includes("QU'") ||
      h.toUpperCase() === 'QTY' ||
      h.toUpperCase().includes('QUANTITY'),
  )
  const orderTypeColIdx = findColIdx(headers, (h) => h.toUpperCase().includes('TYPE'))
  const rollLenColIdx = findColIdx(headers, (h) => h.toUpperCase().includes('ROLL') && h.toUpperCase().includes('LEN'))
  const pieceLenColIdx = findColIdx(headers, (h) => h.toUpperCase().includes('PIECE') && h.toUpperCase().includes('LEN'))
  const descColIdx = findColIdx(headers, (h) => h.toUpperCase() === 'DESCRIPTION')
  const remarkColIdx = findColIdx(headers, (h) => h.toUpperCase() === 'REMARK')
  const mbCodeColIdx = findColIdx(headers, (h) => h.toUpperCase().includes('MB') && h.toUpperCase().includes('CODE'))

  const results: ParsedOrder[] = []
  const piSubLineCounters = new Map<string, number>()

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i]
    if (!Array.isArray(row)) continue

    const get = (colIdx: number): unknown => (colIdx >= 0 ? row[colIdx] : null)

    const rawPi = piNumberColIdx >= 0 ? safeStr(get(piNumberColIdx)) : null
    const rawCustomer = safeStr(get(customerColIdx))
    const rawDate = safeDate(get(dateColIdx))
    const rawGsm = safeInt(get(gsmColIdx))
    const rawWidthM = safeNum(get(widthColIdx))
    const rawLengthM = safeNum(get(lengthColIdx))
    const rawColor = safeStr(get(colorColIdx))

    // Completely empty rows with no PI and no Customer → skip entirely
    if (!rawPi && !rawCustomer && !rawColor && !rawGsm && !rawWidthM && !rawLengthM) {
      continue
    }

    const piNumber = rawPi || 'CHƯA_CÓ_PI'
    const customer = rawCustomer || ''
    const orderDate = rawDate || ''
    const gsm = rawGsm || 0
    const widthM = rawWidthM || 0
    const lengthM = rawLengthM || 0
    const color = rawColor ? rawColor.toUpperCase() : ''

    const currentCount = (piSubLineCounters.get(piNumber) ?? 0) + 1
    piSubLineCounters.set(piNumber, currentCount)

    const fileSubLine = safeInt(get(subLineColIdx))
    const subLineIndex = fileSubLine != null && fileSubLine > 0 ? fileSubLine : currentCount

    const qty = safeInt(get(qtyColIdx))
    const uvPct = safeNum(get(uvColIdx))
    const frFlag = safeBool(get(frColIdx))
    const frPct = safeNum(get(frPctColIdx))
    const description = safeStr(get(descColIdx))
    const remark = safeStr(get(remarkColIdx))
    const mbCode = safeStr(get(mbCodeColIdx))
    const productionGsm = safeInt(get(prodGsmColIdx))
    const rollLength = safeNum(get(rollLenColIdx))
    const pieceLength = safeNum(get(pieceLenColIdx))

    let orderType: 'meters' | 'rolls' | 'pieces' = 'meters'
    const rawType = safeStr(get(orderTypeColIdx))?.toLowerCase()
    if (rawType === 'rolls' || (qty != null && rollLength != null)) {
      orderType = 'rolls'
    } else if (rawType === 'pieces' || (qty != null && pieceLength != null)) {
      orderType = 'pieces'
    }

    // ── Row-Level Mandatory Validation ───────────────────────────────────────
    const validationErrors: string[] = []

    if (!rawPi) validationErrors.push('Thiếu PI Number')
    if (!customer) validationErrors.push('Thiếu Khách hàng')
    if (!orderDate) validationErrors.push('Thiếu Ngày đặt hàng (YYYY-MM-DD)')
    if (!color) validationErrors.push('Thiếu Màu')
    if (widthM <= 0) validationErrors.push('Thiếu Khổ m (>0)')
    if (gsm <= 0) validationErrors.push('Thiếu GSM (>0)')

    if (orderType === 'meters' && lengthM <= 0) {
      validationErrors.push('Thiếu Chiều dài mét (>0)')
    }
    if (orderType === 'rolls') {
      if (qty == null || qty <= 0) validationErrors.push('Thiếu Số cuộn (>0)')
      if (rollLength == null || rollLength <= 0) validationErrors.push('Thiếu Mét/cuộn (>0)')
    }
    if (orderType === 'pieces') {
      if (qty == null || qty <= 0) validationErrors.push('Thiếu Số tấm (>0)')
      if (pieceLength == null || pieceLength <= 0) validationErrors.push('Thiếu Chiều dài tấm (>0)')
    }

    if (frFlag && (frPct == null || frPct <= 0)) {
      validationErrors.push('Thiếu % chống cháy (FR% > 0)')
    }

    const isValid = validationErrors.length === 0

    results.push({
      piNumber,
      subLineIndex,
      customer,
      orderDate,
      widthM,
      lengthM,
      gsm,
      color,
      productionGsm,
      orderType,
      qty,
      rollLength,
      pieceLength,
      uvPct,
      frFlag,
      frPct,
      description,
      remark,
      mbCode,
      isValid,
      validationErrors,
    })
  }

  return results
}
