// src/lib/excel/parseScheduleReport.ts
// Server-only — parses SNY Production Schedule Excel for Sprint F3 bulk import.
//
// Sheet structure (e.g. "20.7.2026"):
//   Col A (idx 0)  : machine width spec, e.g. "6.85\nm"
//   Cols C–AG (idx 2–32): day columns, day 1–31
//   Machine rows   : 1-indexed [7, 9, 11, …, 85] = M-001 … M-040 (2-row stride)
//   Merged cells   : multi-day assignment blocks
//   PI + description in each cell, e.g. "ALROBOOA26-4 SHADE NET MONO"
//
// Edge cases handled (per spec f3-schedule-bulk-import.md §2.2):
//   - Strip parenthetical refs: "ITM26-1 (RO-0616)" → "ITM26-1"
//   - SKIP_EXACT / SKIP_PREFIX: "SAMPLE", "SHADE NET MONO 9WALE", etc.
//   - MULTI_PI "+" cells: "KSSNY200 + KSSNY201" → ["KSSNY200", "KSSNY201"]
//   - Space-collapsed PI: "GBN 26-117" → "GBN26-117"
//   - Description keyword boundary: "SHADE", "NET", "WINDBREAK", etc.

import * as XLSX from 'xlsx'
import { parseScheduleTitlePeriod, type SchedulePeriod } from '@/lib/schedule/importPeriod'

// ── PI extraction constants ────────────────────────────────────────────────────

/** Tokens that signal start of product description (not part of PI Number) */
const DESCRIPTION_KEYWORDS = new Set([
  'SHADE', 'FENCE', 'BIRD', 'HAIL', 'WINDBREAK', 'GUARD', 'GRAIN',
  'DIAMOND', 'HEX', 'QUAD', 'KIWI', 'DEBRIS', 'SCAFFOLDING',
  'MONO', 'TAPE', 'BODY', 'EDGE', 'RECTANGULAR', 'INSECT', 'MESH', 'BEE', 'DIMAOND', 'SAHDE',
])

/** Raw strings that should be completely skipped (no draft order created) */
const SKIP_EXACT = new Set(['SAMPLE', 'SHADE NET MONO 9WALE'])

/** Raw string prefixes to skip */
const SKIP_PREFIX = ['SAMPLE ']

/**
 * 4 PI with multiple sub-lines in DB — ambiguous which sub-line to link.
 * Per Q1 decision: skip auto-assignment, list for manual assignment in report.
 */
const AMBIGUOUS_PI = new Set(['JPY26-274', 'BH26-4', 'GBN26-121', 'GBN26-122'])

/** 40 machine rows (1-indexed), stride = 2: M-001 → row 7, M-040 → row 85 */
const MACHINE_ROWS_1INDEXED = Array.from({ length: 40 }, (_, i) => 7 + i * 2)

/** Day columns: C = index 2 (day 1) … AG = index 32 (day 31) */
const DAY_COL_START = 2
const DAY_COL_END   = 32

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ParsedAssignment {
  machineId:   string   // "M-001" … "M-040"
  rawValue:    string   // original cell content (for debug/audit)
  piNumbers:   string[] // 1 for normal; N for MULTI_PI; 0 if invalid/skipped
  startDay:    number   // 1–31
  endDay:      number   // 1–31
  startDate:   string   // ISO 8601, Vietnam timezone (UTC+7)
  endDate:     string   // ISO 8601, Vietnam timezone (UTC+7)
  isAmbiguous: boolean  // any piNumber in AMBIGUOUS_PI set
  isInvalid:   boolean  // piNumbers is empty (SAMPLE, empty cell, etc.)
}

export interface MachineSpecParsed {
  machineId: string  // "M-001" … "M-040"
  widthM:    number  // e.g. 6.85
}

export interface ParseScheduleResult {
  assignments:     ParsedAssignment[]
  machineSpecs:    MachineSpecParsed[]
  availableSheets: string[]
  sheetName: string
  sheetTitle: string
  titlePeriod: SchedulePeriod | null
  year:            number
  month:           number  // 1-indexed (7 = July)
  daysInMonth:     number
  yellowDayDates:  string[] // Suggestions only; importing the schedule never saves holidays.
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function extractPiFromRaw(raw: string): string[] {
  const s = raw.trim().replace(/\s+/g, ' ')
  if (!s || s.toLowerCase() === 'off') return []
  if (SKIP_EXACT.has(s)) return []
  if (SKIP_PREFIX.some(p => s.startsWith(p))) return []

  // Strip parenthetical content — internal refs like "(RO-0616)" are not part of PI
  const stripped = s.replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim()

  // Find where description starts (first occurrence of a known description keyword)
  const words = stripped.split(' ')
  let descStartIdx = words.length
  for (let i = 1; i < words.length; i++) {
    const w = words[i].toUpperCase()
    if (DESCRIPTION_KEYWORDS.has(w) || /^\d+(WALE|MM)$/.test(w) || w === 'NET') {
      descStartIdx = i
      break
    }
  }
  const candidatePart = words.slice(0, descStartIdx).join(' ').trim()

  // MULTI_PI: cell contains multiple PIs joined with "+"
  // e.g. "KSSNY200 + KSSNY201 + KSSNY202" or "ALSHAMIL26-5+ ALSHAMIL26-4"
  if (candidatePart.includes('+')) {
    const parts = candidatePart
      .split('+')
      .map(p => p.trim().replace(/[-\s]+$/, '').trim())
      .filter(p => p.length > 0)
    return parts.map(normalizePiCode).filter(p => p.length > 0)
  }

  const normalized = normalizePiCode(candidatePart)
  return normalized ? [normalized] : []
}

/** Match actual known PI values, never infer a PI from its shape. */
export function matchSchedulePi(raw: string, knownPiNumbers: readonly string[]): { piNumbers: string[]; needsManual: boolean; kind: 'single' | 'multi' | 'unknown' | 'collision' } {
  const clean = raw.trim().replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim()
  if (!clean || clean.toLowerCase() === 'off' || SKIP_EXACT.has(clean) || SKIP_PREFIX.some(prefix => clean.startsWith(prefix))) {
    return { piNumbers: [], needsManual: false, kind: 'single' }
  }
  const normalize = (value: string) => value.replace(/\([^)]*\)/g, '').replace(/\s+/g, '').toUpperCase()
  const piNumbers: string[] = []
  let needsManual = false
  let collision = false
  for (const part of clean.split('+').map(value => value.trim()).filter(Boolean)) {
    const words = part.split(' ')
    let matched: string[] = []
    for (let count = words.length; count > 0; count--) {
      const prefix = normalize(words.slice(0, count).join(' '))
      matched = Array.from(new Set(knownPiNumbers.filter(pi => normalize(pi) === prefix)))
      if (matched.length > 0) break
    }
    if (matched.length === 1) piNumbers.push(matched[0])
    else { needsManual = true; collision ||= matched.length > 1; piNumbers.push(draftPiCode(part)) }
  }
  return { piNumbers: Array.from(new Set(piNumbers)), needsManual, kind: collision ? 'collision' : needsManual ? 'unknown' : (clean.includes('+') || knownPiNumbers.filter(pi => pi === piNumbers[0]).length > 1) ? 'multi' : 'single' }
}

export function draftPiCode(raw: string): string {
  const withoutSuffix = raw.replace(/\s+-[A-Za-z].*$/, '').replace(/-\s+[A-Za-z].*$/, '')
  return (extractPiFromRaw(withoutSuffix)[0] ?? '').replace(/[-+\s]+$/, '').trim()
}

function normalizePiCode(candidate: string): string {
  let p = candidate.trim().replace(/[-+,\s]+$/, '').trim()
  if (!p) return ''
  // "GBN 26-117" → "GBN26-117"
  p = p.replace(/^([A-Za-z]+)\s+(\d{2}-\d+)$/, '$1$2')
  // "GBN 26" → "GBN26"
  p = p.replace(/^([A-Za-z]+)\s+(\d{2})$/, '$1$2')
  // "KSSNY 201" → "KSSNY201"
  p = p.replace(/^([A-Za-z]+)\s+(\d+)$/, '$1$2')
  return p
}

function parseWidthM(raw: string): number | null {
  const clean = raw.replace(/[^\d.]/g, '')
  const n = parseFloat(clean)
  return isNaN(n) || n === 0 ? null : n
}

function dayToISO(year: number, month: number, day: number): string {
  // Use Vietnam timezone (UTC+7) so calendar dates are unambiguous
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00+07:00`
}

// ── Main parser ────────────────────────────────────────────────────────────────

/**
 * Parse production schedule Excel file.
 * @param buffer  Raw file bytes
 * @param sheetName  Sheet to parse, e.g. "20.7.2026". If not found, throws with list of available sheets.
 * @param knownPiNumbers Runtime catalogue: unknown or colliding normalized PI require manual linking.
 */
export function parseScheduleReport(
  buffer: Buffer,
  sheetName: string,
  knownPiNumbers?: readonly string[],
): ParseScheduleResult {
  const wb = XLSX.read(buffer, { raw: false, cellStyles: true })
  const availableSheets = wb.SheetNames

  // Resolve the requested sheet without guessing between normalized names.
  let resolvedSheetName = availableSheets.includes(sheetName) ? sheetName : undefined
  if (!resolvedSheetName) {
    const caseInsensitiveMatches = availableSheets.filter(
      name => name.toLowerCase() === sheetName.toLowerCase(),
    )
    if (caseInsensitiveMatches.length > 1) {
      throw new Error(
        `Tên sheet "${sheetName}" không duy nhất khi so khớp không phân biệt chữ hoa/thường. Các sheet khớp: ${caseInsensitiveMatches.join(', ')}`,
      )
    }
    resolvedSheetName = caseInsensitiveMatches[0]
  }
  if (!resolvedSheetName) {
    const normalizedMatches = availableSheets.filter(
      name => name.trim().toLowerCase() === sheetName.trim().toLowerCase(),
    )
    if (normalizedMatches.length > 1) {
      throw new Error(
        `Tên sheet "${sheetName}" khớp nhiều sheet sau khi bỏ khoảng trắng đầu/cuối. Vui lòng nhập đúng tên sheet. Các sheet khớp: ${normalizedMatches.join(', ')}`,
      )
    }
    resolvedSheetName = normalizedMatches[0]
  }
  const ws = resolvedSheetName ? wb.Sheets[resolvedSheetName] : undefined
  if (!ws || !resolvedSheetName) {
    throw new Error(
      `Sheet "${sheetName}" không tìm thấy. Các sheet trong file: ${availableSheets.join(', ')}`,
    )
  }

  // Detect period from the actual resolved sheet name, allowing Excel's
  // duplicate-sheet suffix and trailing whitespace (e.g. "2.1.2026 (2) ").
  const sheetMatch = resolvedSheetName.match(/^\s*(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+\(\d+\))?\s*$/)
  if (!sheetMatch) {
    throw new Error(
      `Không xác định được tháng/năm từ tên sheet "${resolvedSheetName}". Hãy chọn sheet có tên ngày theo dạng DD.MM.YYYY (có thể có hậu tố (N)).`,
    )
  }
  const day = parseInt(sheetMatch[1], 10)
  const month = parseInt(sheetMatch[2], 10)
  const year = parseInt(sheetMatch[3], 10)
  const daysInMonthVal = new Date(year, month, 0).getDate()
  if (month < 1 || month > 12 || day < 1 || day > daysInMonthVal) {
    throw new Error(
      `Ngày trong tên sheet "${resolvedSheetName}" không hợp lệ. Hãy dùng ngày theo dạng DD.MM.YYYY.`,
    )
  }

  // Build merge lookup: "row,col" → top-left cell of the merged region
  const merges: XLSX.Range[] = ((ws as Record<string, unknown>)['!merges'] as XLSX.Range[]) || []
  const mergeTopLeft = new Map<string, { r: number; c: number }>()
  for (const m of merges) {
    for (let r = m.s.r; r <= m.e.r; r++) {
      for (let c = m.s.c; c <= m.e.c; c++) {
        mergeTopLeft.set(`${r},${c}`, { r: m.s.r, c: m.s.c })
        // Store the full range keyed by top-left
        if (r === m.s.r && c === m.s.c) {
          mergeTopLeft.set(`ext:${m.s.r},${m.s.c}`, { r: m.e.r, c: m.e.c })
        }
      }
    }
  }

  const cellValue = (r: number, c: number): string => {
    const addr = XLSX.utils.encode_cell({ r, c })
    const cell = (ws as Record<string, XLSX.CellObject | undefined>)[addr]
    return cell ? String(cell.v ?? '').trim() : ''
  }

  const getMergeEnd = (r: number, c: number): { r: number; c: number } | null => {
    const topLeft = mergeTopLeft.get(`${r},${c}`)
    if (!topLeft) return null
    const endKey = `ext:${topLeft.r},${topLeft.c}`
    const end = mergeTopLeft.get(endKey)
    return end ?? null
  }

  // ── Parse ──────────────────────────────────────────────────────────────────
  const assignments: ParsedAssignment[] = []
  const machineSpecs: MachineSpecParsed[] = []

  for (let mi = 0; mi < MACHINE_ROWS_1INDEXED.length; mi++) {
    const rowIdx  = MACHINE_ROWS_1INDEXED[mi] - 1   // convert 1-indexed → 0-indexed
    const machineId = `M-${String(mi + 1).padStart(3, '0')}`

    // Machine width from col A (index 0)
    const widthRaw = cellValue(rowIdx, 0)
    if (widthRaw) {
      const widthM = parseWidthM(widthRaw)
      if (widthM !== null) machineSpecs.push({ machineId, widthM })
    }

    // Scan day columns — track which merge top-lefts we've already processed
    const processedMergeKeys = new Set<string>()
    const dayColEnd = Math.min(DAY_COL_END, DAY_COL_START + daysInMonthVal - 1)

    for (let c = DAY_COL_START; c <= dayColEnd; c++) {
      const topLeft = mergeTopLeft.get(`${rowIdx},${c}`)

      if (topLeft) {
        // This cell is part of a merged region
        if (topLeft.r !== rowIdx) continue  // merge spans from another row — skip
        const mergeKey = `${topLeft.r},${topLeft.c}`
        if (processedMergeKeys.has(mergeKey)) continue
        processedMergeKeys.add(mergeKey)

        const end = mergeTopLeft.get(`ext:${mergeKey}`)
        if (!end) continue

        const rawVal = cellValue(topLeft.r, topLeft.c)
        if (!rawVal) continue

        const startDay = topLeft.c - DAY_COL_START + 1
        const endDay   = end.c    - DAY_COL_START + 1
        const match = knownPiNumbers === undefined ? { piNumbers: extractPiFromRaw(rawVal), needsManual: false } : matchSchedulePi(rawVal, knownPiNumbers)
        const piNumbers = match.piNumbers

        assignments.push({
          machineId,
          rawValue: rawVal,
          piNumbers,
          startDay,
          endDay,
          startDate: dayToISO(year, month, startDay),
          endDate:   dayToISO(year, month, endDay),
          isAmbiguous: match.needsManual || (knownPiNumbers === undefined && piNumbers.some(p => AMBIGUOUS_PI.has(p))),
          isInvalid:   piNumbers.length === 0,
        })
      } else {
        // Single-cell (non-merged) assignment
        const rawVal = cellValue(rowIdx, c)
        if (!rawVal) continue

        const day = c - DAY_COL_START + 1
        const match = knownPiNumbers === undefined ? { piNumbers: extractPiFromRaw(rawVal), needsManual: false } : matchSchedulePi(rawVal, knownPiNumbers)
        const piNumbers = match.piNumbers

        assignments.push({
          machineId,
          rawValue: rawVal,
          piNumbers,
          startDay: day,
          endDay:   day,
          startDate: dayToISO(year, month, day),
          endDate:   dayToISO(year, month, day),
          isAmbiguous: match.needsManual || (knownPiNumbers === undefined && piNumbers.some(p => AMBIGUOUS_PI.has(p))),
          isInvalid:   piNumbers.length === 0,
        })
      }
    }
  }

  const sheetTitle = cellValue(3, 0) // A4 is the monthly title in the source schedule.
  const titlePeriod = parseScheduleTitlePeriod(sheetTitle)
  const yellowDayDates: string[] = []
  // The source workbook's numbered day header is row 6. Ignore product fills,
  // other header rows and non-yellow colors rather than guessing a holiday.
  for (let c = DAY_COL_START; c <= Math.min(DAY_COL_END, DAY_COL_START + daysInMonthVal - 1); c++) {
    const cell = ws[XLSX.utils.encode_cell({ r: 5, c })] as XLSX.CellObject | undefined
    const style = cell?.s as { patternType?: string; fgColor?: { rgb?: string } } | undefined
    const color = style?.fgColor?.rgb?.toUpperCase()
    if (Number(cell?.v) === c - DAY_COL_START + 1 && style?.patternType === 'solid'
      && (color === 'FFFF00' || color === 'FFFFFF00')) {
      yellowDayDates.push(dayToISO(year, month, c - DAY_COL_START + 1).slice(0, 10))
    }
  }
  return { assignments, machineSpecs, availableSheets, sheetName: resolvedSheetName, sheetTitle, titlePeriod, year, month, daysInMonth: daysInMonthVal, yellowDayDates }
}
