// src/lib/excel/parseExtruderReport.ts
// Server-only utility — parses SNY's daily Extruder report (.xlsx), sheet "EXTRUDER".
//
// Supports multi-day files:
//   Each day block starts with a row containing "SNY VINA CO.,LTD."
//   followed by a date cell (Excel serial number or text date e.g. "2026-07-20").
//
// Column mapping (0-indexed):
//   Col 0: NO ("D" / "N" / "TOTAL")
//   Col 1: COLOR (string, e.g. "BLACK B045 UV 2%")
//   Col 2: DENIER (numeric / null)
//   Col 3: WEIGHT (numeric kg, 0 is valid)
//   Col 4: TOTAL (cumulative running total — CROSS-CHECK ONLY, DO NOT SAVE)
//   Col 5: BEAM NOTE (e.g. "11 BEAM ( 158 SỢI)")
//   Col 6: ORDER REF / PI CODE (e.g. "JPY26-274")

import * as XLSX from 'xlsx'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ExtruderRow {
  machineId:  string       // "EXT-01", "EXT-02", ...
  reportDate: Date         // UTC midnight — timezone-independent
  shift:      string       // "D" or "N"
  color:      string       // e.g. "BLACK B045 UV 2%"
  denier:     number | null
  weightKgs:  number       // 0 is valid
  beamNote:   string | null
  orderRef:   string | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Convert an Excel serial number to a UTC-midnight Date.
 * Verified timezone-safe (same as parseKnittingReport.ts).
 */
function serialToDate(val: unknown): Date | null {
  if (typeof val !== 'number' || !isFinite(val) || val <= 0) return null
  // Excel serial numbers for dates usually range between 40000 (year 2009) and 60000 (year 2064).
  // If number is outside this reasonable date range, it's probably a regular quantity/denier.
  if (val < 35000 || val > 65000) return null

  const MS_PER_DAY = 86400000
  const EXCEL_EPOCH = Date.UTC(1899, 11, 30) // 1899-12-30 00:00:00 UTC
  return new Date(EXCEL_EPOCH + Math.floor(val) * MS_PER_DAY)
}

/**
 * Parse a date string in multiple formats → UTC midnight Date.
 * Supports: "2026-07-20", "20/07/2026", "20-07-2026", "20-21/7/2026" (takes first date).
 */
function parseDateString(s: string): Date | null {
  const cleaned = s.trim()
  if (!cleaned) return null

  // Dạng YYYY-MM-DD
  let m = cleaned.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))

  // Dạng DD/MM/YYYY hoặc DD-MM-YYYY
  m = cleaned.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/)
  if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]))

  // Dạng DD-DD/M/YYYY (range "20-21/7/2026") → lấy ngày đầu
  m = cleaned.match(/^(\d{1,2})-\d{1,2}\/(\d{1,2})\/(\d{4})/)
  if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]))

  return null
}

function toNum(v: unknown): number {
  if (v == null || v === '') return 0
  const n = Number(v)
  return isNaN(n) || !isFinite(n) ? 0 : n
}

function toStr(v: unknown): string {
  return String(v ?? '').trim()
}

/**
 * Extract machine number from header like "1st EXTRUDER MACHINE", "2nd EXTRUDER MACHINE".
 * Regex: ^(\d+)(st|nd|rd|th)\s+EXTRUDER\s+MACHINE (case-insensitive)
 */
function extractMachineId(cell: string): string | null {
  const m = cell.trim().match(/^(\d+)\s*(?:st|nd|rd|th)\s+EXTRUDER\s+MACHINE/i)
  if (!m) return null
  return `EXT-${String(parseInt(m[1], 10)).padStart(2, '0')}`
}

/**
 * Scan rows from startIdx to find the report date for a day block.
 */
function findDateInBlock(rows: unknown[][], startIdx: number, maxScan = 5): Date | null {
  for (let i = startIdx; i < Math.min(rows.length, startIdx + maxScan); i++) {
    const row = rows[i]
    if (!row) continue
    for (const cell of row) {
      const fromSerial = serialToDate(cell)
      if (fromSerial) return fromSerial

      if (typeof cell === 'string') {
        const fromStr = parseDateString(cell)
        if (fromStr) return fromStr
      }
    }
  }
  return null
}

// ── Main parser ───────────────────────────────────────────────────────────────

export function parseExtruderReport(buffer: Buffer): ExtruderRow[] {
  const workbook = XLSX.read(buffer, {
    type: 'buffer',
    cellDates: false,
    raw: true,
  })

  // Find sheet named "EXTRUDER" (case-insensitive, trim whitespace)
  const sheetName = workbook.SheetNames.find(
    (n) => n.trim().toUpperCase() === 'EXTRUDER'
  )
  if (!sheetName) {
    const available = workbook.SheetNames.join(', ')
    throw new Error(`Sheet "EXTRUDER" không tìm thấy. Các sheet có sẵn: ${available}`)
  }

  const ws = workbook.Sheets[sheetName]
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    defval: null,
    raw: true,
  }) as unknown[][]

  const results: ExtruderRow[] = []

  let currentDate: Date | null = null
  let currentMachineId: string | null = null
  let blockWeightSum = 0

  // Standard column positions (verified from real SNY Excel sheet)
  let colNo     = 0  // NO ("D" / "N" / "TOTAL")
  let colColor  = 1  // COLOR
  let colDenier = 2  // DENIER
  let colWeight = 3  // WEIGHT
  let colTotal  = 4  // TOTAL (cumulative — DO NOT SAVE)
  let colBeam   = 5  // BEAM NOTE (e.g. "11 BEAM ( 158 SỢI)")
  let colOrder  = 6  // ORDER REF / PI CODE (e.g. "JPY26-274")

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r]
    if (!row || row.every(c => c === null || c === '')) continue

    const rowStr = row.map(c => toStr(c)).join(' ').toUpperCase()

    // ── 1. Day block header detection ("SNY VINA CO.,LTD.") ─────────────────
    if (rowStr.includes('SNY VINA CO.,LTD') || rowStr.includes('SNY VINA CO., LTD')) {
      const newDate = findDateInBlock(rows, r, 5)
      if (newDate) {
        currentDate = newDate
      }
      currentMachineId = null // reset machine when starting new day block
      continue
    }

    // Fallback: If date not found yet, scan row 0-5
    if (!currentDate) {
      const firstDate = findDateInBlock(rows, 0, 5)
      if (firstDate) currentDate = firstDate
    }

    // ── 2. Machine block header detection ("1st EXTRUDER MACHINE", etc.) ─────
    let foundMachineId: string | null = null
    for (const cell of row) {
      if (typeof cell === 'string') {
        foundMachineId = extractMachineId(cell)
        if (foundMachineId) break
      }
    }

    if (foundMachineId) {
      currentMachineId = foundMachineId
      blockWeightSum = 0
      continue
    }

    // ── 3. Detect column positions from header row (if present) ──────────────
    if (row.some(c => typeof c === 'string' && /^(NO|COLOR|WEIGHT|DENIER)$/i.test(String(c).trim()))) {
      for (let c = 0; c < row.length; c++) {
        const h = toStr(row[c]).toUpperCase().trim()
        if (h === 'NO') colNo = c
        else if (h === 'COLOR') colColor = c
        else if (h === 'DENIER') colDenier = c
        else if (h === 'WEIGHT') colWeight = c
        else if (h === 'TOTAL') colTotal = c
        else if (h.includes('BEAM') || h.includes('NOTE')) colBeam = c
        else if (h.includes('ORDER') || h.includes('REMARK') || h.includes('REF') || h.includes('PI')) colOrder = c
      }
      // Ensure colBeam and colOrder are strictly after colTotal (col 4)
      if (colBeam <= colTotal) colBeam = colTotal + 1 // col 5
      if (colOrder <= colBeam) colOrder = colBeam + 1  // col 6
      continue
    }

    if (!currentMachineId || !currentDate) continue

    // ── 4. TOTAL row detection ────────────────────────────────────────────────
    const noCell = toStr(row[colNo]).toUpperCase().trim()
    const isTotalRow = noCell === 'TOTAL' || noCell === 'TỔNG' || noCell === 'CỘNG'

    if (isTotalRow) {
      const excelTotal = toNum(row[colTotal] ?? row[colWeight])
      if (excelTotal > 0 && Math.abs(excelTotal - blockWeightSum) > 0.01) {
        console.warn(
          `[parseExtruderReport] WARNING: ${currentMachineId} ngày ${currentDate.toISOString().slice(0, 10)} — ` +
          `TOTAL file = ${excelTotal}, sum WEIGHT = ${blockWeightSum.toFixed(2)}. Chênh lệch ${Math.abs(excelTotal - blockWeightSum).toFixed(2)} kg.`
        )
      }
      continue // Skip TOTAL row
    }

    // ── 5. Data row ───────────────────────────────────────────────────────────
    const shift = noCell
    if (shift !== 'D' && shift !== 'N') continue

    const color = toStr(row[colColor])
    if (!color) continue

    const denier = row[colDenier] != null && row[colDenier] !== '' && !isNaN(Number(row[colDenier]))
      ? Number(row[colDenier])
      : null

    const weightKgs = Math.max(0, toNum(row[colWeight])) // 0 is valid

    // Col 5 is BEAM NOTE (e.g. "11 BEAM ( 158 SỢI)")
    // Col 6 is ORDER REF / PI CODE (e.g. "JPY26-274")
    const rawBeam = toStr(row[colBeam])
    const rawOrder = toStr(row[colOrder])

    const beamNote = rawBeam || null
    const orderRef = rawOrder || null

    blockWeightSum += weightKgs

    results.push({
      machineId:  currentMachineId,
      reportDate: currentDate,
      shift,
      color,
      denier,
      weightKgs,
      beamNote,
      orderRef,
    })
  }

  if (results.length === 0) {
    throw new Error('Không đọc được dòng dữ liệu nào trong sheet EXTRUDER. Kiểm tra định dạng file.')
  }

  return results
}
