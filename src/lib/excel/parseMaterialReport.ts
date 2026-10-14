// src/lib/excel/parseMaterialReport.ts
// Server-only parser for the selected material-report block in an .xlsx file.

import * as XLSX from 'xlsx'

export type MaterialGroupInput = 'HDPE' | 'MB' | 'KOREA'

export interface MaterialBlock {
  sheetName: string
  headerRow: number
  endRow: number
  reportDate?: string
  sourceDateLabel?: string
  reportPeriodEnd?: string
}

export interface ParsedMaterialRow {
  materialName: string
  group?: MaterialGroupInput
  subGroup?: 'NGUYEN_SINH' | 'TAI_CHE'
  lightFastness?: string
  color?: string
  colorName?: string
  brand?: string
  itemCode?: string
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
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false, cellNF: true, raw: true })
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
  const { workbook, sheetName, rows } = workbookRows(buffer, group)
  const headers = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => Array.isArray(row) && isHeaderRow(row))
  return headers.map(({ index }, position) => {
    const date = readDailyBlockDate(workbook.Sheets[sheetName], rows, index, !!workbook.Workbook?.WBProps?.date1904)
    return { sheetName, headerRow: index + 1, endRow: headers[position + 1]?.index ?? rows.length, ...(date ?? {}) }
  })
}

function findExactHeader(headers: string[], aliases: string[]): number {
  const accepted = new Set(aliases.map((alias) => normalizeCell(alias)))
  return headers.findIndex((header) => accepted.has(header))
}

// [MoM §3.2] The source M/B table has two COLOR columns: code, then name.
function mbMetadata(row: unknown[], headers: string[]) {
  const colors = headers.flatMap((header, index) => header === 'COLOR' ? [index] : [])
  const text = (col: number) => col >= 0 ? String(row[col] ?? '').trim() || undefined : undefined
  const fastness = findExactHeader(headers, ['LIGHT FASTNESS', 'ĐỘ BỀN MÀU'])
  return {
    color: text(findExactHeader(headers, ['COLOR CODE', 'MÃ MÀU']) >= 0 ? findExactHeader(headers, ['COLOR CODE', 'MÃ MÀU']) : colors[0] ?? -1),
    colorName: text(findExactHeader(headers, ['COLOR NAME', 'TÊN MÀU']) >= 0 ? findExactHeader(headers, ['COLOR NAME', 'TÊN MÀU']) : colors[1] ?? -1),
    brand: text(findExactHeader(headers, ['PRODUCTION', 'MANUFACTURER', 'HÃNG'])),
    itemCode: text(findExactHeader(headers, ['ITEM', 'ITEM CODE'])),
    lightFastness: text(fastness),
  }
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
  return /^(?:ACCUMULATED Q['’]?TY IN (?:HDPE|MB)|RAW MATERIAL STOCK LIST)/.test(normalized) || normalized === 'TOTAL' || normalized === 'TỔNG' || normalized === 'CỘNG' || normalized.includes('SUMMARY')
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
  const subGroupCol = findExactHeader(headers, ['SUBGROUP', 'PHÂN LOẠI NHỰA'])
  const lightFastnessCol = findExactHeader(headers, ['LIGHT FASTNESS', 'ĐỘ BỀN MÀU'])
  let rowGroup = group
  let mbHeaders: string[] = []
  let sourceSubGroup: ParsedMaterialRow['subGroup'] = group === 'HDPE' && block.reportDate && headers.includes('MAIN RAW MATERIAL') ? 'NGUYEN_SINH' : undefined
  const contextLabels = rows.slice(Math.max(0, headerIndex - 3), headerIndex + 1).flat().map(normalizeCell)
  if (contextLabels.some(label => /^HDPE\s*\(RECYCLED\)$/.test(label))) sourceSubGroup = 'TAI_CHE'
  else if (contextLabels.some(label => /^HDPE\s*\(VIRGIN\)$/.test(label))) sourceSubGroup = 'NGUYEN_SINH'

  for (let rowIndex = headerIndex + 1; rowIndex < dataEnd; rowIndex += 1) {
    const row = rows[rowIndex] ?? []
    if (row.length === 0 || row.every((cell) => cell == null || String(cell).trim() === '')) continue
    const labels = row.map(normalizeCell)
    if (labels.some(label => /^HDPE\s*\(RECYCLED\)$/.test(label))) { sourceSubGroup = 'TAI_CHE'; continue }
    if (labels.some(label => /^HDPE\s*\(VIRGIN\)$/.test(label))) { sourceSubGroup = 'NGUYEN_SINH'; continue }
    if (labels.includes('M/B')) { rowGroup = 'MB'; continue }
    if (labels.includes('COLOR') && labels.includes('LIGHT FASTNESS')) { mbHeaders = labels; continue }
    if (labels.some(label => isSectionLabel(label))) continue
    const lightHeaderCol = rowGroup === 'MB' ? (mbHeaders.indexOf('LIGHT FASTNESS') >= 0 ? mbHeaders.indexOf('LIGHT FASTNESS') : lightFastnessCol) : -1
    // Keep the legacy material-name identity, excluding the unlabelled numeric
    // cell. Its meaning is unknown; it is never imported as LIGHT FASTNESS.
    const unlabelledCol = lightHeaderCol >= 0 && lightHeaderCol + 1 < firstStockCol && !mbHeaders[lightHeaderCol + 1] && parseNumber(row[lightHeaderCol + 1]) != null ? lightHeaderCol + 1 : -1
    const nameParts = row.slice(0, Math.max(firstStockCol, 0))
      .filter((_, index) => index !== subGroupCol && index !== unlabelledCol && index !== lightHeaderCol)
      .map((cell) => String(cell ?? '').trim())
      .filter(Boolean)
    const materialName = nameParts.join(' ').trim()
    if (!materialName || isSectionLabel(materialName) || isHeaderRow(row)) continue

    const validationErrors: string[] = []
    const rawSubGroup = subGroupCol >= 0 ? normalizeCell(row[subGroupCol]) : ''
    const mappedSubGroup = rawSubGroup === 'NGUYEN_SINH' || rawSubGroup === 'NGUYÊN SINH' ? 'NGUYEN_SINH'
      : rawSubGroup === 'TAI_CHE' || rawSubGroup === 'TÁI CHẾ' ? 'TAI_CHE' : undefined
    if (rawSubGroup && !mappedSubGroup) validationErrors.push('Phân loại nhựa không hợp lệ')
    const subGroup = rowGroup === 'HDPE' ? mappedSubGroup ?? sourceSubGroup : undefined
    const lightFastness = rowGroup === 'MB' ? mbMetadata(row, mbHeaders.length ? mbHeaders : headers).lightFastness : undefined
    if (lightFastness && lightFastness.length > 100) validationErrors.push('Độ bền màu tối đa 100 ký tự')
    const firstStock = numericValue(row[firstStockCol], { required: true, allowNegative: false }, 'FIRST STOCK', validationErrors)
    const lastStock = numericValue(row[lastStockCol], { required: true, allowNegative: false }, 'LAST STOCK', validationErrors)
    const inQty = inCol >= 0 ? numericValue(row[inCol], { required: false, allowNegative: false }, 'IN', validationErrors) : 0
    const outUsing = outUsingCol >= 0 ? numericValue(row[outUsingCol], { required: false, allowNegative: true }, 'OUT USING', validationErrors) : 0
    const outBroken = brokenCol >= 0 ? numericValue(row[brokenCol], { required: false, allowNegative: true }, 'HDPE BROKEN', validationErrors) : 0
    const outTape = tapeCol >= 0 ? numericValue(row[tapeCol], { required: false, allowNegative: true }, 'OUT TAPE', validationErrors) : 0
    const outReject = rejectCol >= 0 ? numericValue(row[rejectCol], { required: false, allowNegative: true }, 'REJECT', validationErrors) : 0
    result.push({
      materialName,
      group: rowGroup,
      ...(subGroup ? { subGroup } : {}),
      ...(lightFastness ? { lightFastness } : {}),
      ...(rowGroup === 'MB' ? mbMetadata(row, mbHeaders.length ? mbHeaders : headers) : {}),
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
  result.forEach((row) => byName.set(materialReportKey(row.group ?? group, row.materialName), [...(byName.get(materialReportKey(row.group ?? group, row.materialName)) ?? []), row]))
  byName.forEach((rowsForName) => {
    if (rowsForName.length > 1) rowsForName.forEach((row) => {
      row.isValid = false
      row.validationErrors.push('Trùng tên vật tư trong cùng block; không tự gộp')
    })
  })
  return result
}


/** A daily source row; reportDate is UTC calendar date, never inferred from quantities. */
export interface ParsedMaterialReportDay extends ParsedMaterialRow {
  reportDate: string
  group: MaterialGroupInput
  subGroup?: 'NGUYEN_SINH' | 'TAI_CHE'
  color?: string
  brand?: string
  lightFastness?: string
  itemCode?: string
  missingFields?: string[]
  sheetName: string
  headerRow: number
  sourceDateLabel?: string
  reportPeriodEnd?: string
}

const MAX_HISTORY_ROWS = 15_000

function serialToDate(serial: number, date1904: boolean): string | null {
  if (!Number.isFinite(serial) || serial < 0 || serial > 100_000) return null
  const epoch = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30)
  return new Date(epoch + Math.floor(serial) * 86_400_000).toISOString().slice(0, 10)
}

/** Read dates only inside a labelled stock-report heading and from date-formatted cells.
 * A stock quantity that happens to resemble an Excel serial is not a date.
 */
function readDailyBlockDate(sheet: XLSX.WorkSheet, rows: unknown[][], headerIndex: number, date1904: boolean): { reportDate: string; sourceDateLabel?: string; reportPeriodEnd?: string } | null {
  const start = Math.max(0, headerIndex - 3)
  const labelled = rows.slice(start, headerIndex).some(row => row.some(cell => normalizeCell(cell) === 'RAW MATERIAL STOCK LIST'))
  if (!labelled) return null
  const dates = new Map<string, { reportDate: string; sourceDateLabel?: string; reportPeriodEnd?: string }>()
  for (let r = start; r < headerIndex; r += 1) {
    for (let c = 0; c < (rows[r]?.length ?? 0); c += 1) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })] as XLSX.CellObject | undefined
      if (!cell) continue
      if (typeof cell.v === 'string') {
        const match = /^(\d{1,2})(?:\+(\d{1,2}))?\/(\d{1,2})\/(\d{4})$/.exec(cell.v.trim())
        if (!match) continue
        const [first, last, month, year] = [Number(match[1]), Number(match[2] ?? match[1]), Number(match[3]), Number(match[4])]
        const date = new Date(Date.UTC(year, month - 1, first))
        const end = new Date(Date.UTC(year, month - 1, last))
        if (date.getUTCMonth() !== month - 1 || end.getUTCMonth() !== month - 1 || last < first || year < 1900 || year > 2100) continue
        const reportDate = date.toISOString().slice(0, 10)
        dates.set(reportDate, { reportDate, sourceDateLabel: cell.v.trim(), ...(match[2] ? { reportPeriodEnd: end.toISOString().slice(0, 10) } : {}) })
      } else if (typeof cell.v === 'number' && cell.z && XLSX.SSF.is_date(cell.z)) {
        const reportDate = serialToDate(cell.v, date1904)
        if (reportDate) dates.set(reportDate, { reportDate })
      }
    }
  }
  if (dates.size > 1) throw new Error(`Block dòng ${headerIndex + 1} có nhiều ngày báo cáo; không tự chọn.`)
  if (!dates.size) return null
  return dates.values().next().value ?? null
}

/** Parse SNY daily stock blocks, including M/B within HDPE. Monthly summaries have no
 * labelled daily date and are excluded. Formula cells use only workbook cached values.
 * The selected-block API above remains unchanged for existing manual imports.
 */
export function parseMaterialReportHistory(buffer: Buffer, group: MaterialGroupInput = 'HDPE'): ParsedMaterialReportDay[] {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false, cellNF: true, raw: true })
  const matching = workbook.SheetNames.filter(name => groupSheetMatches(name, group))
  if (matching.length !== 1) throw new Error(matching.length ? `Có nhiều sheet ${group}; không thể tự chọn.` : `Không tìm thấy sheet ${group} trong file Excel.`)
  const sheetName = matching[0]
  const sheet = workbook.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null }) as unknown[][]
  const headers = rows.flatMap((row, index) => isHeaderRow(row) ? [index] : [])
  const result: ParsedMaterialReportDay[] = []
  for (let blockIndex = 0; blockIndex < headers.length; blockIndex += 1) {
    const headerIndex = headers[blockIndex]
    const blockDate = readDailyBlockDate(sheet, rows, headerIndex, !!workbook.Workbook?.WBProps?.date1904)
    if (!blockDate) {
      if (rows.slice(Math.max(0, headerIndex - 3), headerIndex).some(row => row.some(cell => normalizeCell(cell) === 'RAW MATERIAL STOCK LIST'))) throw new Error(`Không tìm thấy ngày hợp lệ tại block dòng ${headerIndex + 1}; không tự bỏ dữ liệu.`)
      continue
    }
    const header = rows[headerIndex].map(normalizeCell)
    const ordinalCol = findExactHeader(header, ['NO.', 'NO'])
    const firstCol = findExactHeader(header, ['FIRST STOCK', 'FISRT STOCK'])
    const lastCol = findExactHeader(header, ['LAST STOCK'])
    const inCol = findExactHeader(header, ['IN'])
    const brokenCol = findExactHeader(header, ['HDPE BROKEN', 'BROKEN'])
    const tapeCol = findExactHeader(header, ['OUT TAPE', 'TAPE'])
    const rejectCol = findExactHeader(header, ['REJECT'])
    const usingCol = findExactHeader(header, ['OUT USING', 'OUT USEING', 'OUT'])
    let section: 'NGUYEN_SINH' | 'TAI_CHE' | 'MB' = 'NGUYEN_SINH'
    let mbHeader: string[] = []
    for (let r = headerIndex + 1; r < (headers[blockIndex + 1] ?? rows.length); r += 1) {
      const row = rows[r] ?? []
      const labels = row.map(normalizeCell)
      if (labels.some(label => /^HDPE\s*\(RECYCLED\)$/.test(label))) { section = 'TAI_CHE'; continue }
      if (labels.some(label => label === 'M/B')) { section = 'MB'; continue }
      if (labels.includes('LIGHT FASTNESS') && labels.includes('COLOR')) { mbHeader = labels; continue }
      // Source line numbers are structural, not part of the material identity.
      const ordinal = ordinalCol
      if (ordinal < 0 || typeof row[ordinal] !== 'number' || !Number.isInteger(row[ordinal]) || Number(row[ordinal]) <= 0) continue
      const nameParts = row.slice(ordinal + 1, section === 'MB' ? Math.min(firstCol, ordinal + 3) : firstCol)
        .filter(cell => cell != null && String(cell).trim()).map(cell => String(cell).trim())
      const materialName = nameParts.join(' ').trim()
      if (!materialName || labels.some(label => isSectionLabel(label))) continue
      const validationErrors: string[] = []
      const value = (col: number, label: string, required = false) => col < 0 ? 0 : numericValue(row[col], { required, allowNegative: !required && label !== 'IN' }, label, validationErrors)
      const movements: [string, number][] = [['inQty', inCol], ['outUsing', usingCol], ['outBroken', brokenCol], ['outTape', tapeCol], ['outReject', rejectCol]]
      const missingFields = movements.filter(([, col]) => col < 0 || row[col] == null || String(row[col]).trim() === '').map(([key]) => key)
      result.push({ materialName, ...blockDate, ...(missingFields.length ? { missingFields } : {}), group: section === 'MB' ? 'MB' : group,
        ...(group === 'HDPE' && section !== 'MB' ? { subGroup: section } : {}),
        ...(section === 'MB' ? mbMetadata(row, mbHeader.length ? mbHeader : header) : {}),
        firstStock: value(firstCol, 'FIRST STOCK', true), inQty: value(inCol, 'IN'),
        outUsing: value(usingCol, 'OUT USING'), outBroken: value(brokenCol, 'HDPE BROKEN'),
        outTape: value(tapeCol, 'OUT TAPE'), outReject: value(rejectCol, 'REJECT'), lastStock: value(lastCol, 'LAST STOCK', true),
        sourceRow: r + 1, sheetName, headerRow: headerIndex + 1, isValid: validationErrors.length === 0, validationErrors })
      if (result.length > MAX_HISTORY_ROWS) throw new Error(`Báo cáo vượt quá ${MAX_HISTORY_ROWS} dòng vật tư/ngày.`)
    }
  }
  if (!result.length) throw new Error('Không tìm thấy block ngày hợp lệ trong báo cáo; không dùng ngày nhập tay thay thế.')
  const duplicateKeys = new Map<string, ParsedMaterialReportDay[]>()
  result.forEach(row => {
    const key = JSON.stringify([row.reportDate, row.group, normalizeMaterialName(row.materialName)])
    duplicateKeys.set(key, [...(duplicateKeys.get(key) ?? []), row])
  })
  duplicateKeys.forEach(same => { if (same.length > 1) same.forEach(row => {
    row.isValid = false; row.validationErrors.push('Trùng vật tư trong cùng ngày; không tự gộp')
  }) })
  return result
}
