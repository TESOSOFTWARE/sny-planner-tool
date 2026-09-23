// src/lib/excel/parsePackingReport.ts
// Server-only utility — parses SNY's Statistical Report Excel file, sheet
// "SẢN LƯỢNG ĐÓNG GÓI". One row is the complete factory output for a day.

import * as XLSX from 'xlsx'

const MAX_DATES = 366
const EXCEL_EPOCH = Date.UTC(1899, 11, 30)
const MS_PER_DAY = 86_400_000

export interface ParsedPackingOutput {
  date: string
  qtyDay: number | null
  totalMDay: number | null
  weightDay: number | null
  qtyNight: number | null
  totalMNight: number | null
  weightNight: number | null
  dataSource: string
  cellRef: string
  isValid?: boolean
  validationErrors?: string[]
}

export interface ParsePackingResult {
  outputs: ParsedPackingOutput[]
  totalRowsParsed: number
  availableSheets: string[]
  fileName: string
}

type PackingMetricKey =
  | 'qtyDay'
  | 'totalMDay'
  | 'weightDay'
  | 'qtyNight'
  | 'totalMNight'
  | 'weightNight'

function dateFromParts(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    !Number.isFinite(date.getTime()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null
  }
  return date.toISOString().slice(0, 10)
}

function parseDate(value: unknown): string | null {
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) return null
    if (
      value.getUTCHours() !== 0 ||
      value.getUTCMinutes() !== 0 ||
      value.getUTCSeconds() !== 0 ||
      value.getUTCMilliseconds() !== 0
    ) {
      return null
    }
    return dateFromParts(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate())
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value) || !Number.isInteger(value) || value < 1 || value > 2_958_465) {
      return null
    }
    const date = new Date(EXCEL_EPOCH + value * MS_PER_DAY)
    return dateFromParts(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate())
  }

  if (typeof value !== 'string' || value.trim() === '') return null
  const clean = value.trim()
  let match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(clean)
  if (match) return dateFromParts(Number(match[1]), Number(match[2]), Number(match[3]))
  match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(clean)
  if (match) return dateFromParts(Number(match[3]), Number(match[2]), Number(match[1]))
  return null
}

function isBlank(value: unknown): boolean {
  return value == null || (typeof value === 'string' && value.trim() === '')
}

function metricValue(value: unknown, key: PackingMetricKey, rowNumber: number): number | null {
  if (isBlank(value)) return null
  if (typeof value === 'boolean' || (typeof value === 'string' && value.trim().startsWith('='))) {
    throw new Error(`Dòng ${rowNumber}: ${key} phải là số hữu hạn.`)
  }
  const number = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`Dòng ${rowNumber}: ${key} phải là số không âm hữu hạn.`)
  }
  if ((key === 'qtyDay' || key === 'qtyNight') && !Number.isInteger(number)) {
    throw new Error(`Dòng ${rowNumber}: ${key} phải là số nguyên không âm.`)
  }
  return number
}

function sameOutput(a: ParsedPackingOutput, b: ParsedPackingOutput): boolean {
  return (
    a.qtyDay === b.qtyDay &&
    a.totalMDay === b.totalMDay &&
    a.weightDay === b.weightDay &&
    a.qtyNight === b.qtyNight &&
    a.totalMNight === b.totalMNight &&
    a.weightNight === b.weightNight
  )
}

function hasUncachedFormula(ws: XLSX.WorkSheet, row: number, column: number): boolean {
  const cell = ws[XLSX.utils.encode_cell({ r: row, c: column })] as XLSX.CellObject | undefined
  return Boolean(cell && cell.f && cell.v == null)
}

/**
 * Main parser for SẢN LƯỢNG ĐÓNG GÓI sheet.
 * Filename text is metadata only; it never invents dates or selects rows.
 */
export function parsePackingReport(buffer: Buffer, fileName: string): ParsePackingResult {
  const workbook = XLSX.read(buffer, { raw: false, cellDates: true })
  const availableSheets = workbook.SheetNames
  const matchingSheets = availableSheets.filter((sheet) => {
    const upper = sheet.toUpperCase()
    return upper.includes('ĐÓNG GÓI') || upper.includes('PACKING')
  })
  if (matchingSheets.length === 0) {
    throw new Error(`Sheet "SẢN LƯỢNG ĐÓNG GÓI" không tìm thấy. Các sheet trong file: ${availableSheets.join(', ')}`)
  }
  if (matchingSheets.length > 1) {
    throw new Error(`File có nhiều sheet Đóng gói: ${matchingSheets.join(', ')}. Vui lòng giữ lại một sheet.`)
  }

  const sheetName = matchingSheets[0]
  const worksheet = workbook.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, defval: null })
  const byDate = new Map<string, ParsedPackingOutput>()

  for (let rowIndex = 3; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex]
    if (!Array.isArray(row)) continue
    const values = row.slice(3, 10)
    if (values.every(isBlank)) continue

    if (hasUncachedFormula(worksheet, rowIndex, 3)) {
      throw new Error(`Dòng ${rowIndex + 1}: ô ngày chứa công thức chưa có giá trị lưu.`)
    }
    const date = parseDate(row[3])
    if (!date) throw new Error(`Dòng ${rowIndex + 1}: ngày không hợp lệ.`)

    const metricColumns: Array<[PackingMetricKey, number]> = [
      ['qtyDay', 4],
      ['totalMDay', 5],
      ['weightDay', 6],
      ['qtyNight', 7],
      ['totalMNight', 8],
      ['weightNight', 9],
    ]
    const parsed: Record<PackingMetricKey, number | null> = {
      qtyDay: null,
      totalMDay: null,
      weightDay: null,
      qtyNight: null,
      totalMNight: null,
      weightNight: null,
    }
    for (const [key, column] of metricColumns) {
      if (hasUncachedFormula(worksheet, rowIndex, column)) {
        throw new Error(`Dòng ${rowIndex + 1}: ô ${key} chứa công thức chưa có giá trị lưu.`)
      }
      parsed[key] = metricValue(row[column], key, rowIndex + 1)
    }

    const output: ParsedPackingOutput = {
      date,
      ...parsed,
      dataSource: fileName,
      cellRef: `Row ${rowIndex + 1}, Col D (date: ${date})`,
      isValid: true,
      validationErrors: [],
    }
    if (Object.values(parsed).every((value) => value == null)) continue

    const previous = byDate.get(date)
    if (previous) {
      if (!sameOutput(previous, output)) {
        throw new Error(`Ngày ${date} xuất hiện nhiều lần với số liệu khác nhau.`)
      }
      continue
    }
    byDate.set(date, output)
    if (byDate.size > MAX_DATES) {
      throw new Error(`Báo cáo Đóng gói không được vượt quá ${MAX_DATES} ngày.`)
    }
  }

  const outputs = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date))
  return {
    outputs,
    totalRowsParsed: outputs.length,
    availableSheets,
    fileName,
  }
}
