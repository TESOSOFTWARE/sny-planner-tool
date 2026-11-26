import { createHash } from 'node:crypto'
import * as XLSX from 'xlsx'

export type StagePlanProfile = 'extruder-machine' | 'fiber-demand-matrix' | 'warping-work-order' | 'pallet-dated'
export type ImportedStagePlanRow = {
  sourceKey: string
  sourceSheet: string
  sourceRow: number
  planDate: string | null
  machineLabel: string | null
  orderRef: string | null
  displayData: Record<string, unknown>
  warnings: string[]
}
export type StagePlanParseResult = {
  stage: 'extruder' | 'warping' | 'packing'
  profile: StagePlanProfile
  scopeKey: string
  fileName: string
  sourceSheets: string[]
  availableSheets: string[]
  skippedSheets?: string[]
  rows: ImportedStagePlanRow[]
  datedCount?: number
  undatedCount?: number
  warnings: string[]
  needsSheetSelection?: boolean
}

const text = (value: unknown) => value == null ? '' : String(value).trim()
const normalized = (value: unknown) => text(value).replace(/\s+/g, ' ').toUpperCase()
const jsonValue = (value: unknown): unknown => value instanceof Date ? value.toISOString() : typeof value === 'number' || typeof value === 'boolean' || value == null ? value : String(value)
const hash = (parts: unknown[]) => createHash('sha256').update(JSON.stringify(parts.map(value => String(value ?? '').trim()))).digest('hex')
const readWorkbook = (buffer: Buffer) => XLSX.read(buffer, { type: 'buffer', cellDates: false, cellNF: true })

function formatDate(year: number, month: number, day: number): string | null {
  if (year < 1900 || month < 1 || month > 12 || day < 1 || day > 31) return null
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) return null
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function serialDate(value: unknown, date1904 = false): string | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${String(value.getUTCDate()).padStart(2, '0')}`
  if (typeof value === 'number' && value >= 35_000 && value <= 65_000) {
    const parsed = XLSX.SSF.parse_date_code(value, { date1904 })
    if (parsed?.y && parsed.m && parsed.d) return formatDate(parsed.y, parsed.m, parsed.d)
  }
  if (typeof value !== 'string') return null
  const source = value.trim()
  let match = source.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/)
  if (match) return formatDate(Number(match[1]), Number(match[2]), Number(match[3]))
  match = source.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/)
  if (match) return formatDate(Number(match[3]), Number(match[2]), Number(match[1]))
  return null
}

function parseDayMonthName(value: unknown, year: number, sheetMonth: number, date1904 = false): string | null {
  const direct = serialDate(value, date1904)
  if (direct) return direct
  const match = text(value).match(/^(\d{1,2})[- ]([A-Za-z]{3})$/)
  if (!match) return null
  const month = ({ JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 } as Record<string, number>)[match[2].toUpperCase()]
  if (!month) return null
  let resolvedYear = year
  if (month - sheetMonth > 6) resolvedYear--
  else if (sheetMonth - month > 6) resolvedYear++
  return formatDate(resolvedYear, month, Number(match[1]))
}

function monthSheet(value: string): { year: number; month: number } | null {
  const match = value.trim().match(/^(0?\d|1[0-2])[./_-](20\d{2})$/)
  if (!match) return null
  const month = Number(match[1]), year = Number(match[2])
  return month >= 1 && month <= 12 ? { month, year } : null
}

function monthName(value: string): number | null {
  const match = value.trim().toUpperCase().match(/^(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)$/)
  if (!match) return null
  return ({ JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 } as Record<string, number>)[match[1]]
}

function fileYear(fileName: string): number | null {
  const match = fileName.match(/(?:^|[^\d])(20\d{2})(?:[^\d]|$)/)
  return match ? Number(match[1]) : null
}

function sheetRows(sheet: XLSX.WorkSheet) {
  const range = XLSX.utils.decode_range(sheet['!ref'] ?? 'A1')
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true }) as unknown[][]
  const at = (row: number, col: number) => rows[row - range.s.r]?.[col - range.s.c] ?? null
  return { range, rows, at }
}

function mergedValue(sheet: XLSX.WorkSheet, row: number, column: number): unknown {
  if (row < 0 || column < 0) return null
  for (const merge of (sheet['!merges'] as XLSX.Range[] | undefined) ?? []) {
    if (merge.s.r <= row && row <= merge.e.r && merge.s.c <= column && column <= merge.e.c) return sheet[XLSX.utils.encode_cell(merge.s)]?.v ?? null
  }
  return sheet[XLSX.utils.encode_cell({ r: row, c: column })]?.v ?? null
}

function resultRow(profile: StagePlanProfile, sheet: string, sourceRow: number, coordinate: string, values: Omit<ImportedStagePlanRow, 'sourceKey' | 'sourceSheet' | 'sourceRow'>): ImportedStagePlanRow {
  return { sourceKey: hash([profile, sheet, coordinate]), sourceSheet: sheet, sourceRow, ...values }
}

function parseExtruderMachine(workbook: XLSX.WorkBook, fileName: string, selectedSheet?: string): StagePlanParseResult {
  const date1904 = Boolean(workbook.Workbook?.WBProps?.date1904)
  const availableSheets = workbook.SheetNames.filter(name => monthSheet(name) !== null)
  if (!selectedSheet) return { stage: 'extruder', profile: 'extruder-machine', scopeKey: '', fileName, sourceSheets: [], availableSheets, rows: [], warnings: [], needsSheetSelection: true }
  const period = monthSheet(selectedSheet), sheet = workbook.Sheets[selectedSheet]
  if (!period || !sheet) throw new Error('Chọn đúng sheet tháng trong file EXTRUDER.')
  const { range, rows, at } = sheetRows(sheet)
  let dateHeaderRow = -1
  let dateColumns: Array<{ column: number; date: string }> = []
  for (let row = range.s.r; row <= Math.min(range.e.r, range.s.r + 14); row++) {
    const found: Array<{ column: number; date: string }> = []
    for (let column = range.s.c + 13; column <= range.e.c; column++) {
      const date = parseDayMonthName(at(row, column), period.year, period.month, date1904)
      if (date) found.push({ column, date })
    }
    if (found.length > dateColumns.length) { dateHeaderRow = row; dateColumns = found }
  }
  if (dateHeaderRow < 0 || !dateColumns.length) throw new Error(`Không tìm thấy cột ngày trong sheet ${selectedSheet}.`)

  const rowsOut: ImportedStagePlanRow[] = []
  let machineLabel: string | null = null
  for (let row = dateHeaderRow + 1; row <= range.e.r; row++) {
    const sourceCells = rows[row - range.s.r] ?? []
    const machine = sourceCells.map(text).find(value => /^NO\s*\d+$/i.test(value))
    if (machine) machineLabel = machine.toUpperCase().replace(/\s+/g, ' ')
    const orderRef = text(at(row, 3))
    if (!machineLabel || !orderRef) continue
    const product = {
      orderRef, color: jsonValue(at(row, 4)), mb: jsonValue(at(row, 5)), gauge: jsonValue(at(row, 6)), denier: jsonValue(at(row, 7)),
      uv: jsonValue(at(row, 8)), frPe01: jsonValue(at(row, 9)), irEmal104: jsonValue(at(row, 10)), resinMf: jsonValue(at(row, 11)),
      resinUv4: jsonValue(at(row, 12)), recycled: jsonValue(at(row, 13)),
    }
    for (const { column, date } of dateColumns) {
      const sourceValue = at(row, column)
      if (sourceValue == null || String(sourceValue).trim() === '') continue
      const sourceCell = XLSX.utils.encode_cell({ r: row, c: column })
      rowsOut.push(resultRow('extruder-machine', selectedSheet, row + 1, sourceCell, {
        planDate: date, machineLabel, orderRef,
        displayData: { ...product, sourceValue: jsonValue(sourceValue), sourceCell }, warnings: [],
      }))
    }
  }
  return { stage: 'extruder', profile: 'extruder-machine', scopeKey: `${period.year}-${String(period.month).padStart(2, '0')}`, fileName, sourceSheets: [selectedSheet], availableSheets, rows: rowsOut, warnings: [] }
}

function parseFiberMatrix(workbook: XLSX.WorkBook, fileName: string, selectedSheet?: string, selectedYear?: number): StagePlanParseResult {
  const date1904 = Boolean(workbook.Workbook?.WBProps?.date1904)
  const availableSheets = workbook.SheetNames.filter(name => monthName(name) !== null)
  if (!selectedSheet) return { stage: 'extruder', profile: 'fiber-demand-matrix', scopeKey: '', fileName, sourceSheets: [], availableSheets, rows: [], warnings: [], needsSheetSelection: true }
  const month = monthName(selectedSheet), year = selectedYear ?? fileYear(fileName), sheet = workbook.Sheets[selectedSheet]
  if (!month || !year || !sheet) throw new Error('Chọn đúng sheet tháng và năm trong file Chỉ kéo sợi.')
  const { range, rows, at } = sheetRows(sheet)
  const rowsOut: ImportedStagePlanRow[] = []
  for (let row = range.s.r + 2; row <= range.e.r; row++) {
    const date = serialDate(at(row, range.s.c), date1904)
    if (!date) continue
    const products: Array<{ column: string; yarnGroup: string; specification: string; value: unknown }> = []
    let activeGroup = ''
    for (let column = range.s.c + 1; column <= range.e.c; column++) {
      const group = text(mergedValue(sheet, range.s.r, column))
      if (group) activeGroup = group
      const specification = text(at(range.s.r + 1, column))
      const value = at(row, column)
      if (normalized(activeGroup) === 'TOTAL') continue
      if (value == null || String(value).trim() === '') continue
      products.push({ column: XLSX.utils.encode_col(column), yarnGroup: activeGroup, specification, value: jsonValue(value) })
    }
    if (!products.length) continue
    const expectedMonth = `${year}-${String(month).padStart(2, '0')}`
    rowsOut.push(resultRow('fiber-demand-matrix', selectedSheet, row + 1, `${date}:row-${row + 1}`, {
      planDate: date, machineLabel: null, orderRef: null,
      displayData: { date, products, valueUnit: null },
      warnings: date.slice(0, 7) !== expectedMonth ? ['Ngày ngoài tháng của sheet; giữ nguyên ngày nguồn.'] : [],
    }))
  }
  return { stage: 'extruder', profile: 'fiber-demand-matrix', scopeKey: `${year}-${String(month).padStart(2, '0')}`, fileName, sourceSheets: [selectedSheet], availableSheets, rows: rowsOut, warnings: [] }
}

function parseWarpingOrders(workbook: XLSX.WorkBook, fileName: string): StagePlanParseResult {
  const date1904 = Boolean(workbook.Workbook?.WBProps?.date1904)
  const rowsOut: ImportedStagePlanRow[] = [], sourceSheets: string[] = []
  for (const sourceSheet of workbook.SheetNames) {
    const sheet = workbook.Sheets[sourceSheet]
    if (!sheet?.['!ref']) continue
    const { range, rows, at } = sheetRows(sheet)
    const titleIndex = rows.findIndex(row => row.some(value => /WARPING\s+WORK\s+ORDER/i.test(text(value))))
    if (titleIndex < 0) continue
    const headerIndex = rows.findIndex((row, index) => index > titleIndex && row.some(value => normalized(value).includes('DENIOR')) && row.some(value => normalized(value).includes('STRAND')) && row.some(value => normalized(value).includes('WEAVING NO')))
    if (headerIndex < 0) continue
    const headerRow = range.s.r + headerIndex
    const headers = rows[headerIndex] ?? []
    const col = (needle: string) => headers.findIndex(value => normalized(value).includes(needle)) + range.s.c
    const cols = { denier: col('DENIOR'), strand: col('STRAND'), color: col('COLOUR'), weaving: col('WEAVING NO'), amount: col('AMOUNT'), beam: col('BIM'), weight: col('WEIGHT (KG)'), counting: col('COUNTING'), remark: col('REMARK'), netWeight: col('SỐ KG CÂN'), beamWeight: col('SỐ KG BEAM'), winding: col('SỐ MÁY CUỐN') }
    sourceSheets.push(sourceSheet)
    const orderRef = text(at(range.s.r, range.s.c + 2)) || sourceSheet
    const product = text(at(range.s.r + 1, range.s.c + 2))
    for (let row = headerRow + 1; row <= range.e.r; row++) {
      const denier = at(row, cols.denier), strand = at(row, cols.strand), color = at(row, cols.color)
      if (!Number.isFinite(Number(denier)) || !Number.isFinite(Number(strand)) || !text(color)) continue
      const fields = {
        rowNo: jsonValue(at(row, range.s.c)), denier: jsonValue(denier), strand: jsonValue(strand), color: jsonValue(color),
        weavingMachineRef: jsonValue(at(row, cols.weaving)), amount: jsonValue(at(row, cols.amount)), beamCount: jsonValue(at(row, cols.beam)),
        weightKgs: jsonValue(at(row, cols.weight)), counting: jsonValue(at(row, cols.counting)), remark: jsonValue(at(row, cols.remark)),
        netWeightKgs: jsonValue(at(row, cols.netWeight)), beamWeightKgs: jsonValue(at(row, cols.beamWeight)), windingMachine: jsonValue(at(row, cols.winding)),
      }
      rowsOut.push(resultRow('warping-work-order', sourceSheet, row + 1, `${sourceSheet}:${row + 1}`, {
        planDate: null, machineLabel: null, orderRef,
        displayData: { orderRef, product, sourceDateNote: serialDate(at(range.s.r + 7, range.s.c + 11), date1904) ?? jsonValue(at(range.s.r + 7, range.s.c + 11)), fields },
        warnings: ['Chưa có ngày/ca mắc sợi được xác nhận; giữ trong danh sách chưa xếp lịch.'],
      }))
    }
  }
  if (!sourceSheets.length) throw new Error('Không tìm thấy sheet WARPING WORK ORDER trong workbook.')
  const skippedSheets = workbook.SheetNames.filter(name => !sourceSheets.includes(name))
  return { stage: 'warping', profile: 'warping-work-order', scopeKey: 'all', fileName, sourceSheets, availableSheets: sourceSheets, skippedSheets, rows: rowsOut, warnings: ['Các phiếu chưa có ngày sản xuất sẽ không được đặt vào lưới lịch.', ...(skippedSheets.length ? [`Bỏ qua ${skippedSheets.length} sheet không có WARPING WORK ORDER.`] : [])] }
}

function sheetDate(value: string): string | null {
  const match = value.trim().match(/^(\d{1,2})[./-](\d{1,2})[./-](20\d{2})(?:\s*\(\d+\))?$/)
  return match ? formatDate(Number(match[3]), Number(match[2]), Number(match[1])) : null
}

function internalPalletDate(sheet: XLSX.WorkSheet, range: XLSX.Range, date1904 = false): string | null {
  for (let row = range.s.r; row <= Math.min(range.e.r, range.s.r + 5); row++) for (let column = range.s.c; column <= Math.min(range.e.c, range.s.c + 12); column++) {
    const cell = sheet[XLSX.utils.encode_cell({ r: row, c: column })]
    const format = typeof cell?.z === 'string' && /[dmy]/i.test(cell.z)
    const date = format ? serialDate(cell?.v, date1904) : typeof cell?.w === 'string' ? serialDate(cell.w, date1904) : typeof cell?.v === 'string' ? serialDate(cell.v, date1904) : null
    if (date) return date
  }
  return null
}

function parsePalletPlans(workbook: XLSX.WorkBook, fileName: string, selectedPeriod?: string): StagePlanParseResult {
  const date1904 = Boolean(workbook.Workbook?.WBProps?.date1904)
  const rowsOut: ImportedStagePlanRow[] = [], sourceSheets: string[] = [], warnings: string[] = []
  const availableSheets: string[] = []
  for (const sourceSheet of workbook.SheetNames) {
    const sheet = workbook.Sheets[sourceSheet]
    if (!sheet?.['!ref']) continue
    const { range, rows, at } = sheetRows(sheet)
    const headerIndex = rows.findIndex(row => row.some(value => normalized(value).includes('ĐƠN HÀNG')) && row.some(value => normalized(value).includes('MÀU')) && row.some(value => normalized(value).includes('KHỔ RỘNG')))
    if (headerIndex < 0) continue
    availableSheets.push(sourceSheet)
    if (!selectedPeriod) continue
    const tabDate = sheetDate(sourceSheet), internalDate = internalPalletDate(sheet, range, date1904)
    const sourcePeriod = (tabDate ?? internalDate)?.slice(0, 7) ?? 'undated'
    if (sourcePeriod !== selectedPeriod) continue
    const headerRow = range.s.r + headerIndex, headers = rows[headerIndex] ?? []
    const col = (needle: string) => headers.findIndex(value => normalized(value).includes(needle)) + range.s.c
    const cols = { order: col('ĐƠN HÀNG'), color: col('MÀU'), width: col('KHỔ RỘNG'), length: col('CHIỀU DÀI'), weight: col('TRỌNG LƯỢNG'), quantity: col('SỐ LƯỢNG ĐƠN'), pallets: col('SỐ LƯỢNG PALLET'), rollsPerPallet: col('SỐ CUỘN/PALLET'), palletSize: col('KÍCH THƯỚC PALLET'), orderNo: col('SỐ ĐƠN HÀNG') }
    const conflict = Boolean(tabDate && internalDate && tabDate !== internalDate)
    const planDate = conflict ? null : internalDate ?? tabDate
    sourceSheets.push(sourceSheet)
    if (conflict) warnings.push(`${sourceSheet}: ngày tab ${tabDate} khác ngày trong sheet ${internalDate}; không xếp tự động.`)
    for (let row = headerRow + 1; row <= range.e.r; row++) {
      const order = text(mergedValue(sheet, row, cols.order))
      const color = mergedValue(sheet, row, cols.color), width = mergedValue(sheet, row, cols.width), length = mergedValue(sheet, row, cols.length), weight = mergedValue(sheet, row, cols.weight)
      if (![color, width, length, weight].some(value => value != null && String(value).trim() !== '')) continue
      const orderRef = order || null
      const payload = { orderRef, color: jsonValue(color), width: jsonValue(width), length: jsonValue(length), weight: jsonValue(weight), quantity: jsonValue(mergedValue(sheet, row, cols.quantity)), pallets: jsonValue(mergedValue(sheet, row, cols.pallets)), rollsPerPallet: jsonValue(mergedValue(sheet, row, cols.rollsPerPallet)), palletSize: jsonValue(mergedValue(sheet, row, cols.palletSize)), orderNo: jsonValue(mergedValue(sheet, row, cols.orderNo)), sheetDate: tabDate, internalDate }
      rowsOut.push(resultRow('pallet-dated', sourceSheet, row + 1, `${sourceSheet}:${row + 1}`, {
        planDate, machineLabel: null, orderRef, displayData: payload,
        warnings: conflict ? [`Ngày tab ${tabDate} và ngày trong sheet ${internalDate} không khớp.`] : planDate ? [] : ['Không tìm thấy ngày kế hoạch; để ở danh sách chưa xếp lịch.'],
      }))
    }
  }
  if (!availableSheets.length) throw new Error('Không tìm thấy bảng kế hoạch pallet có tiêu đề Đơn hàng/Màu/Khổ rộng.')
  if (!selectedPeriod) return { stage: 'packing', profile: 'pallet-dated', scopeKey: '', fileName, sourceSheets: [], availableSheets, rows: [], warnings: [], needsSheetSelection: true }
  if (!sourceSheets.length) throw new Error(`Không tìm thấy sheet kế hoạch pallet cho kỳ ${selectedPeriod}.`)
  const skippedSheets = availableSheets.filter(name => !sourceSheets.includes(name))
  if (skippedSheets.length) warnings.push(`Bỏ qua ${skippedSheets.length} sheet kế hoạch ngoài kỳ ${selectedPeriod}.`)
  return { stage: 'packing', profile: 'pallet-dated', scopeKey: selectedPeriod, fileName, sourceSheets, availableSheets, skippedSheets, rows: rowsOut, warnings }
}

export function parseStagePlanWorkbook(buffer: Buffer, fileName: string, profile: StagePlanProfile, selectedSheet?: string, selectedYear?: number, selectedPeriod?: string): StagePlanParseResult {
  const source = readWorkbook(buffer)
  if (profile === 'extruder-machine') return parseExtruderMachine(source, fileName, selectedSheet)
  if (profile === 'fiber-demand-matrix') return parseFiberMatrix(source, fileName, selectedSheet, selectedYear)
  if (profile === 'warping-work-order') return parseWarpingOrders(source, fileName)
  return parsePalletPlans(source, fileName, selectedPeriod)
}
