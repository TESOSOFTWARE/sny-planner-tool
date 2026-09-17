// src/lib/excel/parseWarpingReport.ts
// Server-only utility — parses SNY's daily Warping report (.xlsx), sheet "WARPING".
//
// Supports multi-day files:
//   Each day block starts with a row containing "SNY VINA CO.,LTD."
//   followed by a date cell (Excel serial number or text date e.g. "2026-07-20").
//
// Column mapping (0-indexed):
//   Col 0: STT / NO ("D" / "N")
//   Col 1: MÁY DỆT (weavingMachineRef - string text, e.g. "40", "12")
//   Col 2: COLOR (string, e.g. "BLACK", "WHITE")
//   Col 3: DENIER (numeric / null)
//   Col 4: STRAND (numeric / null)
//   Col 5: BEAM (1st) (beamCount1 - numeric / null) [placeholder name]
//   Col 6: M/EA (mPerEa - numeric / null)
//   Col 7: WEIG (weigValue - numeric / null)
//   Col 8: BEAM (2nd) (beamCount2 - numeric / null) [placeholder name]
//   Col 9: QUANTITY (quantity - numeric / null)
//   Col 10: WEIGHT (weightKgs - numeric kg, 0 is valid)
//   Col 11: TOTAL (cumulative running total — CROSS-CHECK ONLY, DO NOT SAVE)
//   Col 12: REMARK / PI CODE (orderRef - string, e.g. "JPY26-274")

import * as XLSX from 'xlsx'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface WarpingRow {
  machineId:         string       // "WARP-01", "WARP-02", ... "WARP-06"
  reportDate:        Date         // UTC midnight — timezone-independent
  shift:             string       // "D" or "N"
  weavingMachineRef: string | null // "40", "12", etc.
  color:             string       // e.g. "BLACK", "WHITE"
  denier:            number | null
  strand:            number | null
  beamCount1:        number | null // placeholder
  mPerEa:            number | null
  weigValue:         number | null
  beamCount2:        number | null // placeholder
  quantity:          number | null
  weightKgs:         number       // 0 is valid
  orderRef:          string | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function serialToDate(val: unknown): Date | null {
  if (typeof val !== 'number' || !isFinite(val) || val <= 0) return null
  if (val < 35000 || val > 65000) return null

  const MS_PER_DAY = 86400000
  const EXCEL_EPOCH = Date.UTC(1899, 11, 30)
  return new Date(EXCEL_EPOCH + Math.floor(val) * MS_PER_DAY)
}

function parseDateString(s: string): Date | null {
  const cleaned = s.trim()
  if (!cleaned) return null

  let m = cleaned.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))

  m = cleaned.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/)
  if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]))

  m = cleaned.match(/^(\d{1,2})-\d{1,2}\/(\d{1,2})\/(\d{4})/)
  if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]))

  return null
}

function toNum(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return isNaN(n) || !isFinite(n) ? null : n
}

function toStr(v: unknown): string {
  return String(v ?? '').trim()
}

/**
 * Extract machine number from header like "MACHINE 1", "MACHINE  2".
 * Regex: /^MACHINE\s*(\d+)/i
 */
function extractMachineId(cell: string): string | null {
  const m = cell.trim().match(/^MACHINE\s*(\d+)/i)
  if (!m) return null
  return `WARP-${String(parseInt(m[1], 10)).padStart(2, '0')}`
}

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

export function parseWarpingReport(buffer: Buffer): WarpingRow[] {
  const workbook = XLSX.read(buffer, {
    type: 'buffer',
    cellDates: false,
    raw: true,
  })

  // Find sheet named "WARPING" (case-insensitive, trim whitespace)
  const sheetName = workbook.SheetNames.find(
    (n) => n.trim().toUpperCase() === 'WARPING'
  )
  if (!sheetName) {
    const available = workbook.SheetNames.join(', ')
    throw new Error(`Sheet "WARPING" không tìm thấy. Các sheet có sẵn: ${available}`)
  }

  const ws = workbook.Sheets[sheetName]
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    defval: null,
    raw: true,
  }) as unknown[][]

  const results: WarpingRow[] = []

  let currentDate: Date | null = null
  let currentMachineId: string | null = null
  let blockWeightSum = 0

  // Default column positions for WARPING sheet
  let colShift    = 0  // STT / NO ("D" / "N")
  let colWeaving  = 1  // MÁY DỆT
  let colColor    = 2  // COLOR
  let colDenier   = 3  // DENIER
  let colStrand   = 4  // STRAND
  let colBeam1    = 5  // BEAM 1
  let colMPerEa   = 6  // M/EA
  let colWeig     = 7  // WEIG
  let colBeam2    = 8  // BEAM 2
  let colQuantity = 9  // QUANTITY
  let colWeight   = 10 // WEIGHT
  let colTotal    = 11 // TOTAL (cumulative — DO NOT SAVE)
  let colRemark   = 12 // REMARK / PI CODE

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

    // Fallback date detection if currentDate not set
    if (!currentDate) {
      const firstDate = findDateInBlock(rows, 0, 5)
      if (firstDate) currentDate = firstDate
    }

    // ── 2. Machine block header detection ("MACHINE 1"..."MACHINE 6") ────────
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

    // ── 3. Column header detection (if row contains STT/COLOR/WEIGHT) ───────
    if (row.some(c => typeof c === 'string' && /^(STT|NO|COLOR|WEIGHT|DENIER|STRAND|MÁY DỆT)$/i.test(String(c).trim()))) {
      let beamCount = 0
      for (let c = 0; c < row.length; c++) {
        const h = toStr(row[c]).toUpperCase().trim()
        if (h === 'STT' || h === 'NO') colShift = c
        else if (h.includes('MÁY DỆT') || h.includes('MAY DET')) colWeaving = c
        else if (h === 'COLOR') colColor = c
        else if (h === 'DENIER') colDenier = c
        else if (h === 'STRAND') colStrand = c
        else if (h === 'BEAM') {
          beamCount++
          if (beamCount === 1) colBeam1 = c
          else colBeam2 = c
        }
        else if (h.includes('M/EA') || h.includes('MEA')) colMPerEa = c
        else if (h.includes('WEIG') && h !== 'WEIGHT') colWeig = c
        else if (h === 'QUANTITY' || h === 'QTY') colQuantity = c
        else if (h === 'WEIGHT') colWeight = c
        else if (h === 'TOTAL') colTotal = c
        else if (h.includes('REMARK') || h.includes('ORDER') || h.includes('PI')) colRemark = c
      }
      continue
    }

    if (!currentMachineId || !currentDate) continue

    // ── 4. Skip TOTAL / SUMMARY rows ──────────────────────────────────────────
    const shiftCell = toStr(row[colShift]).toUpperCase().trim()

    // Skip TOTAL / TOTAL DAY / TOTAL NIGHT / SCRAP / % rows
    const isSkipRow =
      shiftCell.includes('TOTAL') ||
      shiftCell.includes('TỔNG') ||
      shiftCell.includes('SCRAP') ||
      shiftCell.includes('%') ||
      shiftCell.includes('CỘNG')

    if (isSkipRow) {
      if (shiftCell === 'TOTAL' || shiftCell === 'TỔNG CỘNG') {
        const excelTotal = toNum(row[colTotal] ?? row[colWeight]) ?? 0
        if (excelTotal > 0 && Math.abs(excelTotal - blockWeightSum) > 0.01) {
          console.warn(
            `[parseWarpingReport] WARNING: ${currentMachineId} ngày ${currentDate.toISOString().slice(0, 10)} — ` +
            `TOTAL file = ${excelTotal}, sum WEIGHT = ${blockWeightSum.toFixed(2)}. Chênh lệch ${Math.abs(excelTotal - blockWeightSum).toFixed(2)} kg.`
          )
        }
      }
      continue
    }

    // ── 5. Data row ───────────────────────────────────────────────────────────
    const shift = shiftCell
    if (shift !== 'D' && shift !== 'N') continue

    const color = toStr(row[colColor])
    if (!color) continue // require color name

    const weavingMachineRef = toStr(row[colWeaving]) || null
    const denier            = toNum(row[colDenier])
    const strand            = toNum(row[colStrand])
    const beamCount1        = toNum(row[colBeam1])
    const mPerEa            = toNum(row[colMPerEa])
    const weigValue         = toNum(row[colWeig])
    const beamCount2        = toNum(row[colBeam2])
    const quantity          = toNum(row[colQuantity])
    const rawWeight         = toNum(row[colWeight])
    const weightKgs         = rawWeight != null ? Math.max(0, rawWeight) : 0
    const orderRef          = toStr(row[colRemark]) || null

    blockWeightSum += weightKgs

    results.push({
      machineId: currentMachineId,
      reportDate: currentDate,
      shift,
      weavingMachineRef,
      color,
      denier,
      strand,
      beamCount1,
      mPerEa,
      weigValue,
      beamCount2,
      quantity,
      weightKgs,
      orderRef,
    })
  }

  if (results.length === 0) {
    throw new Error('Không đọc được dòng dữ liệu nào trong sheet WARPING. Kiểm tra định dạng file.')
  }

  return results
}
