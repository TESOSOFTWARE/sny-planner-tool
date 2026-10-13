// src/lib/excel/parsePackingReport.ts
// Server-only utility — parses SNY's Statistical Report Excel file, sheet
// "SẢN LƯỢNG ĐÓNG GÓI". One row is the complete factory output for a day.

import * as XLSX from 'xlsx'

const MAX_DATES = 366

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
  period: PackingPeriod | null
  outOfPeriodOutputs: ParsedPackingOutput[]
  skippedRows: { total: number; header: number; blank: number }
}

export type PackingPeriod = { month: string; source: 'filename' | 'rows' }

export function packingPeriod(fileName: string, dates: readonly string[]): PackingPeriod | null {
  const match = /(?:^|[^\d])(0[1-9]|1[0-2])-(\d{4})(?!\d)/.exec(fileName)
  if (match) return { month: `${match[2]}-${match[1]}`, source: 'filename' }
  const counts = new Map<string, number>()
  for (const date of dates) counts.set(date.slice(0, 7), (counts.get(date.slice(0, 7)) ?? 0) + 1)
  const month = Array.from(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0]
  return month ? { month, source: 'rows' } : null
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

function serialToDate(value: number, date1904: boolean): string | null {
  if (!Number.isFinite(value) || value < 1 || value > 2_958_465) return null
  const parts = XLSX.SSF.parse_date_code(value, { date1904 })
  return parts ? dateFromParts(parts.y, parts.m, parts.d) : null
}

export function parsePackingDate(value: unknown, date1904 = false): string | null {
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) return null
    const vn = new Date(value.getTime() + 7 * 60 * 60 * 1000)
    return dateFromParts(vn.getUTCFullYear(), vn.getUTCMonth() + 1, vn.getUTCDate())
  }
  if (typeof value === 'number') return serialToDate(value, date1904)

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
 * Source dates are preserved; filename month only filters confirmation eligibility.
 */
export function parsePackingReport(buffer: Buffer, fileName: string): ParsePackingResult {
  const workbook = XLSX.read(buffer, { raw: false, cellDates: false })
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
  const end = XLSX.utils.decode_range(worksheet['!ref'] ?? 'A1').e
  const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, defval: null, range: { s: { r: 0, c: 0 }, e: end } })
  const headerIndex = rows.findIndex(row => row.some(value => String(value ?? '').trim().toUpperCase() === 'TIME') && row.some(value => String(value ?? '').trim().toUpperCase() === 'DAY') && row.some(value => String(value ?? '').trim().toUpperCase() === 'NIGHT'))
  if (headerIndex < 0) throw new Error('Không tìm thấy tiêu đề TIME / DAY / NIGHT của báo cáo Đóng gói.')
  const dateColumn = rows[headerIndex].findIndex(value => String(value ?? '').trim().toUpperCase() === 'TIME')
  const skippedRows = { total: 0, header: headerIndex + 1, blank: 0 }
  const datedRows: ParsedPackingOutput[] = []
  const date1904 = Boolean(workbook.Workbook?.WBProps?.date1904)
  const byDate = new Map<string, ParsedPackingOutput>()

  for (let rowIndex = headerIndex + 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex]
    if (!Array.isArray(row)) continue
    const values = row.slice(dateColumn, dateColumn + 7)
    const label = String(row[dateColumn] ?? '').trim().toUpperCase()
    if (/^TOTAL(?: ALL)?$/.test(label)) { skippedRows.total++; continue }
    if (values.some(value => String(value ?? '').trim().toUpperCase() === 'QUANTITY')) { skippedRows.header++; continue }
    if (values.every(isBlank)) { skippedRows.blank++; continue }

    if (hasUncachedFormula(worksheet, rowIndex, dateColumn)) {
      throw new Error(`Dòng ${rowIndex + 1}: ô ngày chứa công thức chưa có giá trị lưu.`)
    }
    const date = parsePackingDate(row[dateColumn], date1904)
    if (!date) throw new Error(`Dòng ${rowIndex + 1}: ngày không hợp lệ.`)

    const metricColumns: Array<[PackingMetricKey, number]> = [
      ['qtyDay', dateColumn + 1],
      ['totalMDay', dateColumn + 2],
      ['weightDay', dateColumn + 3],
      ['qtyNight', dateColumn + 4],
      ['totalMNight', dateColumn + 5],
      ['weightNight', dateColumn + 6],
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
      cellRef: `Row ${rowIndex + 1}, Col ${XLSX.utils.encode_col(dateColumn)} (date: ${date})`,
      isValid: true,
      validationErrors: [],
    }
    datedRows.push(output)

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

  const period = packingPeriod(fileName, datedRows.map(row => row.date))
  const outOfPeriodOutputs = datedRows.filter(row => row.date.slice(0, 7) !== period?.month)
  const outputs = Array.from(byDate.values()).filter(row => row.date.slice(0, 7) === period?.month && [row.qtyDay, row.totalMDay, row.weightDay, row.qtyNight, row.totalMNight, row.weightNight].some(value => value != null)).sort((a, b) => a.date.localeCompare(b.date))
  skippedRows.blank += datedRows.filter(row => row.date.slice(0, 7) === period?.month && [row.qtyDay, row.totalMDay, row.weightDay, row.qtyNight, row.totalMNight, row.weightNight].every(value => value == null)).length
  return {
    outputs,
    totalRowsParsed: datedRows.length,
    availableSheets,
    fileName,
    period,
    outOfPeriodOutputs,
    skippedRows,
  }
}
