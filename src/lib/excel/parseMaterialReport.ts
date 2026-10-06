// src/lib/excel/parseMaterialReport.ts
// Server-only parser for the selected material-report block in an .xlsx file.

import * as XLSX from 'xlsx'

export type MaterialGroupInput = 'HDPE' | 'MB' | 'KOREA'

export interface MaterialBlock {
  sheetName: string
  headerRow: number
  endRow: number
}

export interface ParsedMaterialRow {
  materialName: string
  firstStock: number
  inQty: number
  outUsing: number
  outBroken: number
  outTape: number
  outReject: number
  lastStock: number
  sourceRow: number
  isValid: boolean
  validationErrors: string[]
}

const MAX_MATERIAL_ROWS = 500
const MAX_DECIMAL = 99_999_999.99

export function normalizeMaterialName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toUpperCase()
}

export function materialReportKey(group: MaterialGroupInput, name: string): string {
  return JSON.stringify([group, normalizeMaterialName(name)])
}

function normalizeCell(value: unknown): string {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toUpperCase()
}

function groupSheetMatches(sheetName: string, group: MaterialGroupInput): boolean {
  const normalized = normalizeCell(sheetName)
  if (group === 'HDPE') return normalized === 'HDPE'
  if (group === 'MB') return normalized === 'MB' || normalized === 'M/B'
  return normalized === 'KOREA'
}

function workbookRows(buffer: Buffer, group: MaterialGroupInput): { workbook: XLSX.WorkBook; sheetName: string; rows: unknown[][] } {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true, raw: true })
  const matchingSheets = workbook.SheetNames.filter((name) => groupSheetMatches(name, group))
  if (matchingSheets.length === 0) throw new Error(`Không tìm thấy sheet ${group} trong file Excel.`)
  if (matchingSheets.length > 1) throw new Error(`Có nhiều sheet ${group} trong file Excel; không thể tự chọn.`)
  const sheetName = matchingSheets[0]
  const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
    header: 1,
    raw: true,
    defval: null,
  }) as unknown[][]
  return { workbook, sheetName, rows }
}

function isHeaderRow(row: unknown[]): boolean {
  const cells = row.map(normalizeCell)
  return cells.some((cell) => cell === 'FIRST STOCK' || cell === 'FISRT STOCK') && cells.some((cell) => cell === 'LAST STOCK')
}

export function inspectMaterialBlocks(buffer: Buffer, group: MaterialGroupInput): MaterialBlock[] {
  const { sheetName, rows } = workbookRows(buffer, group)
  const headers = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => Array.isArray(row) && isHeaderRow(row))
  return headers.map(({ index }, position) => ({
    sheetName,
    headerRow: index + 1,
    endRow: (headers[position + 1]?.index ?? rows.length) as number,
  }))
}

function findExactHeader(headers: string[], aliases: string[]): number {
  const accepted = new Set(aliases.map((alias) => normalizeCell(alias)))
  return headers.findIndex((header) => accepted.has(header))
}

function parseNumber(value: unknown): number | null {
  if (value == null || value === '') return null
  if (typeof value === 'object') return null
  const number = typeof value === 'number' ? value : Number(String(value).trim())
  return Number.isFinite(number) ? number : null
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function numericValue(
  value: unknown,
  options: { required: boolean; allowNegative: boolean },
  label: string,
  errors: string[],
): number {
  const parsed = parseNumber(value)
  if (parsed == null) {
    if (options.required || (value != null && String(value).trim() !== '')) errors.push(`${label} phải là số`)
    return 0
  }
  if (!options.allowNegative && parsed < 0) errors.push(`${label} không được âm`)
  const absolute = options.allowNegative ? Math.abs(parsed) : parsed
  if (absolute > MAX_DECIMAL) errors.push(`${label} vượt giới hạn ${MAX_DECIMAL}`)
  return round2(absolute)
}

function isSectionLabel(name: string): boolean {
  const normalized = normalizeMaterialName(name)
  return normalized === 'TOTAL' || normalized === 'TỔNG' || normalized === 'CỘNG' || normalized.includes('SUMMARY')
}

export function parseMaterialReport(
  buffer: Buffer,
  group: MaterialGroupInput = 'HDPE',
  headerRow?: number,
): ParsedMaterialRow[] {
  const { sheetName, rows } = workbookRows(buffer, group)
  const blocks = inspectMaterialBlocks(buffer, group)
  if (blocks.length === 0) throw new Error('Không tìm thấy header FIRST STOCK/LAST STOCK trong file.')
  const block = headerRow == null
    ? blocks.length === 1 ? blocks[0] : (() => { throw new Error('BLOCK_REQUIRED') })()
    : blocks.find((candidate) => candidate.headerRow === headerRow)
  if (!block) throw new Error('Header block không tồn tại trong file.')

  const headerIndex = block.headerRow - 1
  const headers = rows[headerIndex].map(normalizeCell)
  const firstStockCol = findExactHeader(headers, ['FIRST STOCK', 'FISRT STOCK'])
  const lastStockCol = findExactHeader(headers, ['LAST STOCK'])
  if (firstStockCol < 0 || lastStockCol < 0) throw new Error('Không tìm thấy cột FIRST STOCK hoặc LAST STOCK.')
  const inCol = findExactHeader(headers, ['IN'])
  const brokenCol = findExactHeader(headers, ['HDPE BROKEN', 'BROKEN'])
  const tapeCol = findExactHeader(headers, ['OUT TAPE', 'XUẤT TAPE', 'TAPE'])
  const rejectCol = findExactHeader(headers, ['REJECT'])
  const outUsingCol = findExactHeader(headers, ['OUT USING', 'OUT USEING', 'OUT USAGE', 'OUT USE', 'OUT'])
  const dataEnd = Math.min(block.endRow, rows.length)
  const result: ParsedMaterialRow[] = []

  for (let rowIndex = headerIndex + 1; rowIndex < dataEnd; rowIndex += 1) {
    const row = rows[rowIndex] ?? []
    if (row.length === 0 || row.every((cell) => cell == null || String(cell).trim() === '')) continue
    const nameParts = row.slice(0, Math.max(firstStockCol, 0))
      .map((cell) => String(cell ?? '').trim())
      .filter(Boolean)
    const materialName = nameParts.join(' ').trim()
    if (!materialName || isSectionLabel(materialName) || isHeaderRow(row)) continue

    const validationErrors: string[] = []
    const firstStock = numericValue(row[firstStockCol], { required: true, allowNegative: false }, 'FIRST STOCK', validationErrors)
    const lastStock = numericValue(row[lastStockCol], { required: true, allowNegative: false }, 'LAST STOCK', validationErrors)
    const inQty = inCol >= 0 ? numericValue(row[inCol], { required: false, allowNegative: false }, 'IN', validationErrors) : 0
    const outUsing = outUsingCol >= 0 ? numericValue(row[outUsingCol], { required: false, allowNegative: true }, 'OUT USING', validationErrors) : 0
    const outBroken = brokenCol >= 0 ? numericValue(row[brokenCol], { required: false, allowNegative: true }, 'HDPE BROKEN', validationErrors) : 0
    const outTape = tapeCol >= 0 ? numericValue(row[tapeCol], { required: false, allowNegative: true }, 'OUT TAPE', validationErrors) : 0
    const outReject = rejectCol >= 0 ? numericValue(row[rejectCol], { required: false, allowNegative: true }, 'REJECT', validationErrors) : 0
    result.push({
      materialName,
      firstStock,
      inQty,
      outUsing,
      outBroken,
      outTape,
      outReject,
      lastStock,
      sourceRow: rowIndex + 1,
      isValid: validationErrors.length === 0,
      validationErrors,
    })
  }

  if (result.length > MAX_MATERIAL_ROWS) throw new Error(`Báo cáo vượt quá ${MAX_MATERIAL_ROWS} dòng vật tư.`)
  const byName = new Map<string, ParsedMaterialRow[]>()
  result.forEach((row) => byName.set(normalizeMaterialName(row.materialName), [...(byName.get(normalizeMaterialName(row.materialName)) ?? []), row]))
  byName.forEach((rowsForName) => {
    if (rowsForName.length > 1) rowsForName.forEach((row) => {
      row.isValid = false
      row.validationErrors.push('Trùng tên vật tư trong cùng block; không tự gộp')
    })
  })
  return result
}
