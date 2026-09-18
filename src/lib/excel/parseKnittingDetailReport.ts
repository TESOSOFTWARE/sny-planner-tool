// src/lib/excel/parseKnittingDetailReport.ts
// Server-only utility — parses SNY's daily KNITTING sheet (.xlsx) for 40 weaving machines (M-001..M-040).
//
// Column mapping (0-indexed):
//   Col 1: SIZE OF MACHINE (M) (machineSizeM)
//   Col 2: NO. / shift ("D" / "N")
//   Col 3: width
//   Col 4: color
//   Col 5: weight (weightSpec / gsm)
//   Col 6: length(m)
//   Col 7: tape/roll
//   Col 8: m
//   Col 9: average/roll
//   Col 10: quantity
//   Col 11: weight(kg) (weightKgs - LƯU DB)
//   Col 12: total(kg) (CROSS-CHECK ONLY — DO NOT SAVE)
//   Col 13: total(m) (CROSS-CHECK ONLY — DO NOT SAVE)
//   Col 14: Remark (PI code / data row remark)
//   Col 15: Qty of Netting Cm/per min (cmPerMin)
//   Col 16: Qty of Netting Meter/per day (meterPerDay)
//   Col 17: Operating grade
//   Col 18: Total %
//   Col 19: Machine Note (e.g. "* Thay 2 dàn, đổi màu: 00h30'-02h30' (N)")
//
// MACHINE 1 Edge Case:
//   For MACHINE 1: header row (Row r) only has "MACHINE 1" and date cell.
//   machineSizeM (6.85), cmPerMin (102), meterPerDay (734.4) are located on Row r+2 (first data row).
//
// MACHINE 2..40 Standard Case:
//   machineSizeM is in col 1 of the header row "MACHINE X".
//   cmPerMin (col 15), meterPerDay (col 16) are in the same header row.
//   machineNote (col 19) is in the header row starting with '*'.

import * as XLSX from 'xlsx'

export interface KnittingDetailRow {
  machineId:      string       // "M-001".."M-040"
  reportDate:     Date         // UTC midnight
  shift:          string       // "D" or "N"

  width:          number | null
  color:          string       // color name
  weightSpec:     number | null
  lengthM:        number | null
  tapeRoll:       number | null
  mValue:         number | null
  avgPerRoll:     number | null
  quantity:       number | null
  weightKgs:      number

  orderRef:       string | null // PI code
  machineNote:    string | null // operational note (starts with '*')

  // Machine level stats
  machineSizeM:   number | null
  cmPerMin:       number | null
  meterPerDay:    number | null
  operatingGrade: string | null
  totalPct:       number | null
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
 * Extract machine number from header like "MACHINE 1", "MACHINE 40".
 * Returns "M-001".."M-040" or null.
 */
function extractMachineId(cell: string): { machineId: string; machineNum: number } | null {
  const m = cell.trim().match(/^MACHINE\s*(\d+)/i)
  if (!m) return null
  const num = parseInt(m[1], 10)
  if (isNaN(num) || num < 1 || num > 40) return null
  return {
    machineId: `M-${String(num).padStart(3, '0')}`,
    machineNum: num,
  }
}

function findDateInBlock(rows: unknown[][], startIdx: number, maxScan = 6): Date | null {
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

/**
 * Helper for Machine 1 edge case: scan rows r+1..r+3 to find size, cmPerMin, meterPerDay
 */
function extractMachine1Stats(rows: unknown[][], startIdx: number) {
  for (let i = startIdx + 1; i < Math.min(rows.length, startIdx + 4); i++) {
    const row = rows[i]
    if (!row) continue
    const size = toNum(row[1])
    const cm   = toNum(row[15])
    const mday = toNum(row[16])
    if (size != null && size > 0) {
      return {
        machineSizeM:   size,
        cmPerMin:       cm,
        meterPerDay:    mday,
        operatingGrade: toStr(row[17]) || null,
        totalPct:       toNum(row[18]),
      }
    }
  }
  return {
    machineSizeM:   null,
    cmPerMin:       null,
    meterPerDay:    null,
    operatingGrade: null,
    totalPct:       null,
  }
}

// ── Main Parser ───────────────────────────────────────────────────────────────

export function parseKnittingDetailReport(buffer: Buffer): KnittingDetailRow[] {
  const workbook = XLSX.read(buffer, {
    type: 'buffer',
    cellDates: false,
    raw: true,
  })

  const sheetName = workbook.SheetNames.find(
    (n) => n.trim().toUpperCase() === 'KNITTING'
  )
  if (!sheetName) {
    const available = workbook.SheetNames.join(', ')
    throw new Error(`Sheet "KNITTING" không tìm thấy. Các sheet có sẵn: ${available}`)
  }

  const ws = workbook.Sheets[sheetName]
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    defval: null,
    raw: true,
  }) as unknown[][]

  const results: KnittingDetailRow[] = []

  let currentDate: Date | null = null
  let currentMachineId: string | null = null
  let blockWeightSum = 0

  // Machine level stats
  let currentMachineSizeM: number | null = null
  let currentCmPerMin:     number | null = null
  let currentMeterPerDay:  number | null = null
  let currentGrade:        string | null = null
  let currentTotalPct:     number | null = null
  let currentMachineNote:  string | null = null

  // Default column indices for data rows
  let colShift    = 2  // NO. / shift ("D" / "N")
  let colWidth    = 3  // width
  let colColor    = 4  // color
  let colWeight   = 5  // weight spec (gsm)
  let colLength   = 6  // length(m)
  let colTape     = 7  // tape/roll
  let colM        = 8  // m
  let colAvg      = 9  // average/roll
  let colQty      = 10 // quantity
  let colWeightKg = 11 // weight(kg)
  let colTotalKg  = 12 // total(kg) - SKIP
  let colTotalM   = 13 // total(m) - SKIP
  let colRemark   = 14 // Remark

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r]
    if (!row || row.every(c => c === null || c === '')) continue

    const rowStr = row.map(c => toStr(c)).join(' ').toUpperCase()

    // ── 1. Day block header detection ─────────────────────────────────────────
    if (rowStr.includes('SNY VINA CO.,LTD') || rowStr.includes('SNY VINA CO., LTD')) {
      const newDate = findDateInBlock(rows, r, 6)
      if (newDate) currentDate = newDate
      continue
    }

    // ── 2. Machine block header detection ("MACHINE 1".."MACHINE 40") ─────────
    let foundMachine: { machineId: string; machineNum: number } | null = null
    for (const cell of row) {
      if (typeof cell === 'string') {
        foundMachine = extractMachineId(cell)
        if (foundMachine) break
      }
    }

    if (foundMachine) {
      currentMachineId = foundMachine.machineId
      blockWeightSum = 0
      currentMachineNote = null

      // Scan header row cells for machine-level note (e.g. in col 19 starting with '*')
      for (let c = 0; c < row.length; c++) {
        const cellVal = toStr(row[c])
        if (cellVal.startsWith('*') || /thay\s*dàn|đổi\s*màu|sửa\s*máy|bảo\s*trì/i.test(cellVal)) {
          currentMachineNote = cellVal
          break
        }
      }

      // Read Machine-level stats
      if (foundMachine.machineNum === 1) {
        // Reset currentDate on MACHINE 1 — marks start of a day block!
        const blockDate = serialToDate(row[14]) || findDateInBlock(rows, r, 3)
        if (blockDate) currentDate = blockDate

        // MACHINE 1 Edge Case: stats are on row r+2 (first data row)
        const m1Stats = extractMachine1Stats(rows, r)
        currentMachineSizeM = m1Stats.machineSizeM
        currentCmPerMin     = m1Stats.cmPerMin
        currentMeterPerDay  = m1Stats.meterPerDay
        currentGrade        = m1Stats.operatingGrade
        currentTotalPct     = m1Stats.totalPct
      } else {
        // MACHINE 2..40 Standard Case: stats are on the same header row (r)
        currentMachineSizeM = toNum(row[1])
        currentCmPerMin     = toNum(row[15])
        currentMeterPerDay  = toNum(row[16])
        currentGrade        = toStr(row[17]) || null
        currentTotalPct     = toNum(row[18])
      }

      continue
    }

    // ── 3. Detect column headers if present ──────────────────────────────────
    if (row.some(c => typeof c === 'string' && /^(NO\.|WIDTH|COLOR|WEIGHT|LENGTH|QUANTITY)$/i.test(String(c).trim()))) {
      for (let c = 0; c < row.length; c++) {
        const h = toStr(row[c]).toUpperCase().trim()
        if (h === 'NO.' || h === 'NO') colShift = c
        else if (h === 'WIDTH') colWidth = c
        else if (h === 'COLOR') colColor = c
        else if (h === 'WEIGHT' && c <= 5) colWeight = c
        else if (h.includes('LENGTH')) colLength = c
        else if (h.includes('TAPE')) colTape = c
        else if (h === 'M' && c <= 9) colM = c
        else if (h.includes('AVERAGE')) colAvg = c
        else if (h === 'QUANTITY' || h === 'QTY') colQty = c
        else if (h.includes('WEIGHT(KG)') || (h === 'WEIGHT' && c > 5)) colWeightKg = c
        else if (h.includes('TOTAL(KG)')) colTotalKg = c
        else if (h.includes('TOTAL(M)')) colTotalM = c
        else if (h.includes('REMARK') || h.includes('ORDER') || h.includes('PI')) colRemark = c
      }
      continue
    }

    if (!currentMachineId || !currentDate) continue

    // ── 4. Skip TOTAL / SUMMARY rows ──────────────────────────────────────────
    const shiftCell = toStr(row[colShift]).toUpperCase().trim()

    const isSkipRow =
      shiftCell.includes('TOTAL') ||
      shiftCell.includes('TỔNG') ||
      shiftCell.includes('SCRAP') ||
      shiftCell.includes('%') ||
      shiftCell.includes('CỘNG')

    if (isSkipRow) {
      if (shiftCell === 'TOTAL' || shiftCell === 'TỔNG CỘNG') {
        const excelTotal = toNum(row[colTotalKg] ?? row[colWeightKg]) ?? 0
        if (excelTotal > 0 && Math.abs(excelTotal - blockWeightSum) > 0.01) {
          console.warn(
            `[parseKnittingDetailReport] WARNING: ${currentMachineId} ngày ${currentDate.toISOString().slice(0, 10)} — ` +
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
    const rawWeightKg = toNum(row[colWeightKg])
    const weightKgs = rawWeightKg != null ? Math.max(0, rawWeightKg) : 0

    // FILTERING RULE: Save row if color is non-empty OR weightKgs > 0.
    // Skip row ONLY if BOTH color is empty AND weightKgs <= 0 (empty template row).
    if (!color && weightKgs <= 0) continue

    const width      = toNum(row[colWidth])
    const weightSpec = toNum(row[colWeight])
    const lengthM    = toNum(row[colLength])
    const tapeRoll   = toNum(row[colTape])
    const mValue     = toNum(row[colM])
    const avgPerRoll = toNum(row[colAvg])
    const quantity   = toNum(row[colQty])

    const remarkText = toStr(row[colRemark])

    // Heuristic for Remark column:
    // If data row Remark starts with '*' or contains operational terms -> use data row machineNote
    // Else -> orderRef (PI code), and machineNote inherits from currentMachineNote (from header row)
    let orderRef: string | null = null
    let machineNote: string | null = currentMachineNote // inherits from machine header if available!

    if (remarkText) {
      if (remarkText.startsWith('*') || /thay\s*dàn|đổi\s*màu|sửa\s*máy|bảo\s*trì/i.test(remarkText)) {
        machineNote = remarkText
      } else {
        orderRef = remarkText
      }
    }

    blockWeightSum += weightKgs

    results.push({
      machineId:      currentMachineId,
      reportDate:     currentDate,
      shift,
      width,
      color,
      weightSpec,
      lengthM,
      tapeRoll,
      mValue,
      avgPerRoll,
      quantity,
      weightKgs,
      orderRef,
      machineNote,
      machineSizeM:   currentMachineSizeM,
      cmPerMin:       currentCmPerMin,
      meterPerDay:    currentMeterPerDay,
      operatingGrade: currentGrade,
      totalPct:       currentTotalPct,
    })
  }

  if (results.length === 0) {
    throw new Error('Không đọc được dòng dữ liệu nào trong sheet KNITTING. Kiểm tra định dạng file.')
  }

  return results
}
