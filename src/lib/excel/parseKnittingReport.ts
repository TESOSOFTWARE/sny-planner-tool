// src/lib/excel/parseKnittingReport.ts
// Parses SNY's daily Statistical Report (.xlsx) — KNITTING sheet.
//
// Column mapping (0-indexed, verified with Python openpyxl on real SNY file):
//
//   MACHINE header row:
//     row[2]  = 'MACHINE 1', 'MACHINE 2', ... (string)
//     row[14] = Excel serial number for the report date (e.g. 46199 = 28/4/2026)
//     → currentDate is reset ONLY on 'MACHINE 1' header (start of new day block)
//
//   TOTAL row (one per machine):
//     row[0]  = machine number (integer, 1–40)
//     row[2]  = 'TOTAL' (string)
//     row[8]  = daily meters for this machine on currentDate (already daily, not cumulative)
//
// Multi-day files: 1 file may contain N day blocks (MACHINE 1→40 per day).
// Expected output for a 2-day file: 80 records (40 machines × 2 days).
//
// DATE HANDLING — why serial number, not JS Date:
//   SheetJS with cellDates:true converts Excel serial → UTC-midnight JS Date.
//   On a UTC+7 machine, val.getDate() gives the right local day, but this
//   breaks on UTC servers. To be timezone-independent: read the raw serial
//   number (cellDates:false + raw:true) and compute the date ourselves using
//   the Excel epoch (1899-12-30). Result is always the correct UTC midnight.
//   Verified: serial 46199 → 2026-04-28T00:00:00Z ✓

import * as XLSX from 'xlsx'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface KnittingDayData {
  reportDate:  Date   // UTC midnight — timezone-independent, derived from serial
  machineId:   string // 'M-001' to 'M-040'
  dailyMeters: number // col I (index 8) — already daily output, not cumulative
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Convert an Excel serial number to a UTC-midnight Date.
 * Uses Excel epoch 1899-12-30 (SheetJS convention — accounts for Excel's
 * erroneous 1900 leap year). No JS timezone involved.
 *
 * Example: 46199 → 2026-04-28T00:00:00.000Z
 */
function serialToDate(val: unknown): Date | null {
  if (typeof val !== 'number' || !isFinite(val) || val <= 0) return null
  const MS_PER_DAY = 86400000
  const EXCEL_EPOCH = Date.UTC(1899, 11, 30) // 1899-12-30 00:00:00 UTC
  return new Date(EXCEL_EPOCH + Math.floor(val) * MS_PER_DAY)
}

/**
 * Safely extract daily meters from a cell value.
 * Returns 0 for: null, undefined, string ('#REF!', errors), Infinity, NaN.
 */
function toMeters(val: unknown): number {
  if (val === null || val === undefined) return 0
  if (typeof val === 'number') return isFinite(val) ? Math.max(0, val) : 0
  if (typeof val === 'string') return 0 // '#REF!' and other Excel error strings
  return 0
}

// ── Main parser ───────────────────────────────────────────────────────────────

/**
 * Parse SNY KNITTING sheet from an .xlsx buffer.
 * Returns one KnittingDayData record per machine per date found in the file.
 * For a 2-day file with 40 machines → 80 records.
 */
export function parseKnittingReport(buffer: Buffer): KnittingDayData[] {
  // cellDates: false — keep date cells as raw Excel serial numbers (not JS Date).
  // This avoids all JS timezone issues. We convert manually with serialToDate().
  const workbook = XLSX.read(buffer, {
    type: 'buffer',
    cellDates: false,
  })

  // Exact sheet name match (confirmed Q1)
  const sheetName = workbook.SheetNames.find(
    (n) => n.trim().toUpperCase() === 'KNITTING'
  )
  if (!sheetName) {
    const available = workbook.SheetNames.join(', ')
    throw new Error(`Sheet "KNITTING" not found. Available sheets: ${available}`)
  }

  const ws = workbook.Sheets[sheetName]
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    defval: null,  // null for empty cells (distinguishable from 0)
    raw: true,     // return raw cell values: numbers as numbers, strings as strings
  }) as unknown[][]

  const results: KnittingDayData[] = []
  let currentDate: Date | null = null

  for (const row of rows) {
    if (!row || row.length === 0) continue

    // ── MACHINE header row detection ────────────────────────────────────────
    // col C (index 2) = 'MACHINE 1', 'MACHINE 2', etc.
    const col2 = typeof row[2] === 'string' ? row[2].trim() : null

    if (col2 && col2.toUpperCase().includes('MACHINE')) {
      // Reset currentDate ONLY on 'MACHINE 1' — marks start of a new day block.
      // MACHINE 2→40 header rows are skipped (no date reset, no TOTAL record).
      if (col2.toUpperCase() === 'MACHINE 1') {
        // row[14] = Excel serial number for this day's date.
        // serialToDate() converts to UTC midnight without any JS timezone math.
        const d = serialToDate(row[14])
        if (d) currentDate = d
      }
      continue // never treat a MACHINE header row as a TOTAL row
    }

    if (!currentDate) continue

    // ── TOTAL row detection ─────────────────────────────────────────────────
    // col A (index 0) = machine number (integer, e.g. 1, 12, 40)
    // col C (index 2) = 'TOTAL'
    const machineNum = typeof row[0] === 'number' ? row[0] : NaN

    if (
      Number.isInteger(machineNum) &&
      machineNum >= 1 &&
      machineNum <= 40 &&
      col2 === 'TOTAL'
    ) {
      const machineId   = `M-${String(machineNum).padStart(3, '0')}`
      const dailyMeters = toMeters(row[8]) // col I (index 8) = daily output

      results.push({ reportDate: currentDate, machineId, dailyMeters })
    }
  }

  return results
}
