// src/lib/excel/parsePastedText.ts
// Utility for parsing tab-separated text pasted from Excel.

import type { ParsedOrder } from '@/types'

/**
 * Robust date parser supporting YYYY-MM-DD, DD/MM/YYYY, and MM/DD/YYYY formats.
 * Returns date as YYYY-MM-DD string, or null if invalid.
 */
export function parseOrderDate(rawDate: string): string | null {
  const cleaned = rawDate.trim()
  if (!cleaned) return null

  // 1. YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
    const d = new Date(cleaned)
    if (!isNaN(d.getTime())) {
      return cleaned
    }
  }

  // 2. Match DD/MM/YYYY or M/D/YYYY or MM/DD/YYYY
  const match = cleaned.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (match) {
    const p1 = parseInt(match[1], 10)
    const p2 = parseInt(match[2], 10)
    const year = parseInt(match[3], 10)

    // Try parsing as DD/MM/YYYY (first choice)
    const day = p1
    const month = p2 - 1 // 0-indexed
    if (month >= 0 && month < 12 && day >= 1 && day <= 31) {
      const d = new Date(year, month, day)
      // Check rollover (e.g. Feb 31 -> Mar 3)
      if (
        !isNaN(d.getTime()) &&
        d.getDate() === day &&
        d.getMonth() === month &&
        d.getFullYear() === year
      ) {
        const mm = String(p2).padStart(2, '0')
        const dd = String(p1).padStart(2, '0')
        return `${year}-${mm}-${dd}`
      }
    }

    // Try parsing as MM/DD/YYYY (second choice)
    const monthFallback = p1 - 1
    const dayFallback = p2
    if (monthFallback >= 0 && monthFallback < 12 && dayFallback >= 1 && dayFallback <= 31) {
      const d = new Date(year, monthFallback, dayFallback)
      if (
        !isNaN(d.getTime()) &&
        d.getDate() === dayFallback &&
        d.getMonth() === monthFallback &&
        d.getFullYear() === year
      ) {
        const mm = String(p1).padStart(2, '0')
        const dd = String(p2).padStart(2, '0')
        return `${year}-${mm}-${dd}`
      }
    }
  }

  // Fallback to JS default parsing
  const d = new Date(cleaned)
  if (!isNaN(d.getTime())) {
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
  }

  return null
}

/**
 * Parses tab-separated rows copied from Excel.
 * Skips rows with missing or invalid required fields.
 */
export function parsePastedText(text: string): ParsedOrder[] {
  if (!text) return []

  const lines = text.split(/\r?\n/)
  const parsedOrders: ParsedOrder[] = []
  const piCounters = new Map<string, number>()

  for (const line of lines) {
    const trimmedLine = line.trim()
    if (!trimmedLine) continue

    const cols = trimmedLine.split('\t')

    // Parse PI Number (index 1) - required
    const piNumber = cols[1]?.trim()
    if (!piNumber) continue

    const count = (piCounters.get(piNumber) ?? 0) + 1
    piCounters.set(piNumber, count)

    // Parse Sub-line index (index 2) - required, default to row sequence
    const rawSubLine = cols[2]?.trim()
    const parsedSub = rawSubLine ? parseInt(rawSubLine, 10) : NaN
    const validSubLine = (!isNaN(parsedSub) && parsedSub > 0) ? parsedSub : count

    // Parse Customer (index 3) - required
    const customer = cols[3]?.trim()
    if (!customer) continue

    // Parse Date (index 4) - required
    const rawDate = cols[4]?.trim()
    if (!rawDate) continue
    const orderDate = parseOrderDate(rawDate)
    if (!orderDate) continue

    // Parse Item (index 5) & Description (index 6) - optional, append
    const col5 = cols[5]?.trim() || ''
    const col6 = cols[6]?.trim() || ''
    let description: string | null = null
    if (col5 && col6) {
      description = `${col5} - ${col6}`
    } else if (col5) {
      description = col5
    } else if (col6) {
      description = col6
    }

    // Parse UV % (index 7) - optional
    let uvPct: number | null = null
    const rawUv = cols[7]?.trim()
    if (rawUv) {
      if (rawUv.endsWith('%')) {
        const val = parseFloat(rawUv.replace('%', ''))
        if (!isNaN(val)) {
          uvPct = val / 100
        }
      } else {
        const val = parseFloat(rawUv)
        if (!isNaN(val)) {
          uvPct = val > 1 ? val / 100 : val
        }
      }
    }

    // Parse FR (index 8) - optional
    let frFlag = false
    const rawFr = cols[8]?.trim()
    if (rawFr) {
      const num = Number(rawFr)
      if (!isNaN(num) && num !== 0) {
        frFlag = true
      }
    }

    // Parse GSM (index 9) - required
    const rawGsm = cols[9]?.trim()
    if (!rawGsm) continue
    const gsm = parseInt(rawGsm, 10)
    if (isNaN(gsm) || gsm <= 0) continue

    // Parse Width (index 10) - required
    const rawWidth = cols[10]?.trim()
    if (!rawWidth) continue
    const widthM = parseFloat(rawWidth)
    if (isNaN(widthM) || widthM <= 0) continue

    // Parse Length (index 11) - required
    const rawLength = cols[11]?.trim()
    if (!rawLength) continue
    const lengthM = parseFloat(rawLength)
    if (isNaN(lengthM) || lengthM <= 0) continue

    // Parse Color (index 12) - required
    const rawColor = cols[12]?.trim()
    if (!rawColor) continue
    const color = rawColor.toUpperCase()

    // Parse Qty (index 14) - optional
    let qty: number | null = null
    const rawQty = cols[14]?.trim()
    if (rawQty) {
      const parsedQty = parseInt(rawQty, 10)
      if (!isNaN(parsedQty)) {
        qty = parsedQty
      }
    }

    // Add to list
    parsedOrders.push({
      piNumber,
      subLineIndex: validSubLine,
      customer,
      orderDate,
      widthM,
      lengthM,
      gsm,
      color,
      qty,
      uvPct,
      frFlag,
      description,
      remark: null, // Always null for pasted rows since there's no remark column mapped.
    })
  }

  return parsedOrders
}

export interface ParsedRowResult {
  order: ParsedOrder | null
  rawLine: string
  error: string | null
  isValid: boolean
}

/**
 * Parses tab-separated rows copied from Excel and retains validation errors.
 */
export function parsePastedTextExtended(text: string): ParsedRowResult[] {
  if (!text) return []

  const lines = text.split(/\r?\n/)
  const results: ParsedRowResult[] = []

  for (const line of lines) {
    const trimmedLine = line.trim()
    if (!trimmedLine) continue

    const cols = trimmedLine.split('\t')

    // Parse columns with validation
    const piNumber = cols[1]?.trim()
    if (!piNumber) {
      results.push({
        order: null,
        rawLine: trimmedLine,
        error: 'Missing PI Number (column 2)',
        isValid: false,
      })
      continue
    }

    const rawSubLine = cols[2]?.trim()
    const subLineIndex = rawSubLine ? parseInt(rawSubLine, 10) : 1
    const validSubLine = isNaN(subLineIndex) ? 1 : subLineIndex

    const customer = cols[3]?.trim()
    if (!customer) {
      results.push({
        order: null,
        rawLine: trimmedLine,
        error: 'Missing Customer (column 4)',
        isValid: false,
      })
      continue
    }

    const rawDate = cols[4]?.trim()
    if (!rawDate) {
      results.push({
        order: null,
        rawLine: trimmedLine,
        error: 'Missing Date (column 5)',
        isValid: false,
      })
      continue
    }
    const orderDate = parseOrderDate(rawDate)
    if (!orderDate) {
      results.push({
        order: null,
        rawLine: trimmedLine,
        error: `Invalid Date: "${rawDate}" (Expected YYYY-MM-DD, DD/MM/YYYY, or M/D/YYYY)`,
        isValid: false,
      })
      continue
    }

    // Optional fields
    const col5 = cols[5]?.trim() || ''
    const col6 = cols[6]?.trim() || ''
    let description: string | null = null
    if (col5 && col6) {
      description = `${col5} - ${col6}`
    } else if (col5) {
      description = col5
    } else if (col6) {
      description = col6
    }

    let uvPct: number | null = null
    const rawUv = cols[7]?.trim()
    if (rawUv) {
      if (rawUv.endsWith('%')) {
        const val = parseFloat(rawUv.replace('%', ''))
        if (!isNaN(val)) {
          uvPct = val / 100
        }
      } else {
        const val = parseFloat(rawUv)
        if (!isNaN(val)) {
          uvPct = val > 1 ? val / 100 : val
        }
      }
    }

    let frFlag = false
    const rawFr = cols[8]?.trim()
    if (rawFr) {
      const num = Number(rawFr)
      if (!isNaN(num) && num !== 0) {
        frFlag = true
      }
    }

    const rawGsm = cols[9]?.trim()
    if (!rawGsm) {
      results.push({
        order: null,
        rawLine: trimmedLine,
        error: 'Missing GSM (column 10)',
        isValid: false,
      })
      continue
    }
    const gsm = parseInt(rawGsm, 10)
    if (isNaN(gsm) || gsm <= 0) {
      results.push({
        order: null,
        rawLine: trimmedLine,
        error: `Invalid GSM: "${rawGsm}" (Must be a positive integer)`,
        isValid: false,
      })
      continue
    }

    const rawWidth = cols[10]?.trim()
    if (!rawWidth) {
      results.push({
        order: null,
        rawLine: trimmedLine,
        error: 'Missing Width (column 11)',
        isValid: false,
      })
      continue
    }
    const widthM = parseFloat(rawWidth)
    if (isNaN(widthM) || widthM <= 0) {
      results.push({
        order: null,
        rawLine: trimmedLine,
        error: `Invalid Width: "${rawWidth}" (Must be a positive number)`,
        isValid: false,
      })
      continue
    }

    const rawLength = cols[11]?.trim()
    if (!rawLength) {
      results.push({
        order: null,
        rawLine: trimmedLine,
        error: 'Missing Length (column 12)',
        isValid: false,
      })
      continue
    }
    const lengthM = parseFloat(rawLength)
    if (isNaN(lengthM) || lengthM <= 0) {
      results.push({
        order: null,
        rawLine: trimmedLine,
        error: `Invalid Length: "${rawLength}" (Must be a positive number)`,
        isValid: false,
      })
      continue
    }

    const rawColor = cols[12]?.trim()
    if (!rawColor) {
      results.push({
        order: null,
        rawLine: trimmedLine,
        error: 'Missing Color (column 13)',
        isValid: false,
      })
      continue
    }
    const color = rawColor.toUpperCase()

    let qty: number | null = null
    const rawQty = cols[14]?.trim()
    if (rawQty) {
      const parsedQty = parseInt(rawQty, 10)
      if (!isNaN(parsedQty)) {
        qty = parsedQty
      }
    }

    results.push({
      order: {
        piNumber,
        subLineIndex: validSubLine,
        customer,
        orderDate,
        widthM,
        lengthM,
        gsm,
        color,
        qty,
        uvPct,
        frFlag,
        description,
        remark: null,
      },
      rawLine: trimmedLine,
      error: null,
      isValid: true,
    })
  }

  return results
}
