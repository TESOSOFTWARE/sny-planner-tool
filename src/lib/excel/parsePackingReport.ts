// src/lib/excel/parsePackingReport.ts
// Server-only utility — parses SNY's Statistical Report Excel file, sheet "SẢN LƯỢNG ĐÓNG GÓI".
// Parses factory total daily outputs per calendar date (Day/Night shifts).

import * as XLSX from 'xlsx'

export interface ParsedPackingOutput {
  date:        string   // ISO date string (YYYY-MM-DD)
  qtyDay:      number | null
  totalMDay:   number | null
  weightDay:   number | null
  qtyNight:    number | null
  totalMNight: number | null
  weightNight: number | null
  dataSource:  string
  cellRef:     string
}

export interface ParsePackingResult {
  outputs:         ParsedPackingOutput[]
  totalRowsParsed: number
  availableSheets: string[]
  fileName:        string
}

function parseExcelDate(val: unknown, defaultMonth: number, defaultYear: number): string | null {
  if (val instanceof Date) {
    return val.toISOString().slice(0, 10)
  }
  const num = Number(val)
  if (!isNaN(num) && isFinite(num) && num > 30000 && num < 65000) {
    // Excel date serial
    const MS_PER_DAY = 86400000
    const EXCEL_EPOCH = Date.UTC(1899, 11, 30)
    const d = new Date(EXCEL_EPOCH + Math.floor(num) * MS_PER_DAY)
    return d.toISOString().slice(0, 10)
  }
  if (typeof val === 'string' && val.trim()) {
    const clean = val.trim()
    const d = new Date(clean)
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  }
  return null
}

function safeNum(val: unknown): number | null {
  if (val == null) return null
  const n = Number(val)
  return isNaN(n) || n <= 0 ? null : n
}

function safeInt(val: unknown): number | null {
  const n = safeNum(val)
  return n == null ? null : Math.round(n)
}

/**
 * Main parser for SẢN LƯỢNG ĐÓNG GÓI sheet.
 */
export function parsePackingReport(buffer: Buffer, fileName: string): ParsePackingResult {
  const wb = XLSX.read(buffer, { raw: false, cellDates: true })
  const availableSheets = wb.SheetNames

  const sheetName = availableSheets.find(
    (s) => s.toUpperCase().includes('ĐÓNG GÓI') || s.toUpperCase().includes('PACKING')
  )
  if (!sheetName) {
    throw new Error(`Sheet "SẢN LƯỢNG ĐÓNG GÓI" không tìm thấy. Các sheet trong file: ${availableSheets.join(', ')}`)
  }

  const ws = wb.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null })

  // Detect month and year from fileName (e.g. "07-2026" or "08-2026")
  let month = 7, year = 2026
  const monthMatch = fileName.match(/(\d{2})[-_](\d{4})/)
  if (monthMatch) {
    month = parseInt(monthMatch[1], 10)
    year  = parseInt(monthMatch[2], 10)
  }

  const outputs: ParsedPackingOutput[] = []
  let totalRowsParsed = 0

  // Data starts around Row 3 (Col D = Date)
  for (let r = 3; r < rows.length; r++) {
    const row = rows[r]
    if (!Array.isArray(row)) continue

    const rawDateVal = row[3] // Col D (idx 3)
    const dateStr = parseExcelDate(rawDateVal, month, year)
    if (!dateStr) continue

    const qtyDay      = safeInt(row[4])   // Col E
    const totalMDay   = safeNum(row[5])   // Col F
    const weightDay   = safeNum(row[6])   // Col G
    const qtyNight    = safeInt(row[7])   // Col H
    const totalMNight = safeNum(row[8])   // Col I
    const weightNight = safeNum(row[9])   // Col J

    // Skip rows where both day and night are completely empty/zero
    if (!qtyDay && !totalMDay && !weightDay && !qtyNight && !totalMNight && !weightNight) {
      continue
    }

    totalRowsParsed++
    outputs.push({
      date: dateStr,
      qtyDay,
      totalMDay,
      weightDay,
      qtyNight,
      totalMNight,
      weightNight,
      dataSource: fileName,
      cellRef: `Row ${r + 1}, Col D (date: ${dateStr})`,
    })
  }

  return {
    outputs,
    totalRowsParsed,
    availableSheets,
    fileName,
  }
}
