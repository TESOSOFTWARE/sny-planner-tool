// src/lib/excel/parseMaterialReport.ts
// Server-only utility — parses SNY's daily HDPE material report (.xlsx)
// Returns ParsedMaterialRow[] for each material found (including those with lastStock=0).
//
// Excel structure (SNY daily HDPE report):
//   Section 1: HDPE (raw plastic) — material name in a single name column
//   Section 2: HDPE Recycled — same structure
//   Section 3: M/B (masterbatch colors) — name = CODE + COLOR + ITEM combined
//
//   Header row contains: "FISRT STOCK"/"FIRST STOCK", "IN", "HDPE BROKEN",
//                        "XUẤT TAPE"/"OUT TAPE", "REJECT", "OUT USEING"/"OUT USING"/"OUT", "LAST STOCK"
//   Numeric columns start after the name column(s).
//   TOTAL rows are skipped.

import * as XLSX from 'xlsx'

export interface ParsedMaterialRow {
  materialName: string
  firstStock: number
  inQty: number
  outUsing: number
  outBroken: number
  outTape: number
  outReject: number
  lastStock: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toNum(v: unknown): number {
  if (v == null || v === '') return 0
  const n = Number(v)
  return isNaN(n) ? 0 : Math.abs(n) // abs so negative OUT values become positive
}

function normalise(s: unknown): string {
  return String(s ?? '').trim().toUpperCase().replace(/\s+/g, ' ')
}

/** Find the index of the first column whose normalised header matches any of the keywords */
function findCol(header: unknown[], keywords: string[]): number {
  const kw = keywords.map((k) => k.toUpperCase())
  return header.findIndex((h) => kw.some((k) => normalise(h).includes(k)))
}

// ── Main parser ───────────────────────────────────────────────────────────────

export function parseMaterialReport(buffer: Buffer, sheetType: 'HDPE' | 'MB' | 'KOREA' = 'HDPE'): ParsedMaterialRow[] {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true })

  // Find the target sheet
  const targetName = workbook.SheetNames.find((n) => {
    const norm = n.trim().toUpperCase()
    if (sheetType === 'HDPE') return norm === 'HDPE'
    if (sheetType === 'MB') return norm === 'M/B' || norm === 'MB'
    if (sheetType === 'KOREA') return norm === 'KOREA'
    return false
  }) ?? workbook.SheetNames[0]

  if (!targetName) throw new Error('Excel file has no sheets.')

  const sheet = workbook.Sheets[targetName]

  // Convert to 2D array with raw values
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: true,
    defval: '',
  }) as unknown[][]

  // ── Find header row ────────────────────────────────────────────────────────
  // Look for a row that contains "FISRT STOCK" or "FIRST STOCK" or "LAST STOCK"
  let headerRowIdx = -1
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const norm = rows[i].map(normalise)
    if (
      norm.some((c) => c.includes('FISRT STOCK') || c.includes('FIRST STOCK') || c.includes('LAST STOCK'))
    ) {
      headerRowIdx = i
      break
    }
  }

  if (headerRowIdx === -1) {
    throw new Error(
      'Không tìm thấy header row. Hãy đảm bảo file có cột "FIRST STOCK" / "LAST STOCK".',
    )
  }

  const header = rows[headerRowIdx].map(normalise)

  // ── Locate numeric columns ─────────────────────────────────────────────────
  const colFirstStock = findCol(header, ['FISRT STOCK', 'FIRST STOCK'])
  const colIn         = findCol(header, ['IN'])
  const colBroken     = findCol(header, ['HDPE BROKEN', 'BROKEN'])
  const colTape       = findCol(header, ['OUT TAPE', 'XUẤT TAPE', 'TAPE'])
  const colReject     = findCol(header, ['REJECT'])
  const colOutUsing   = findCol(header, ['OUT USEING', 'OUT USING', 'OUT USAGE', 'OUT USE', 'OUT'])
  const colLastStock  = findCol(header, ['LAST STOCK'])

  if (colFirstStock === -1 || colLastStock === -1) {
    throw new Error('Không tìm thấy cột FIRST STOCK hoặc LAST STOCK trong file.')
  }

  // The name column is the last non-empty text column BEFORE colFirstStock.
  // We scan backward from colFirstStock to find the rightmost text column.
  const nameColCandidates: number[] = []
  for (let c = 0; c < colFirstStock; c++) {
    const val = normalise(rows[headerRowIdx + 1]?.[c] ?? '')
    if (val && !val.match(/^\d/)) nameColCandidates.push(c)
  }
  // We'll use dynamic detection per row — look for any non-numeric content
  // in columns before colFirstStock.

  // ── Parse data rows ────────────────────────────────────────────────────────
  const result: ParsedMaterialRow[] = []

  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const row = rows[i]

    // Skip empty rows
    if (!row || row.every((c) => c === '' || c == null)) continue

    // Extract numeric values first
    const lastStock = colLastStock >= 0 ? toNum(row[colLastStock]) : 0

    // Extract material name from non-numeric columns before colFirstStock
    // Try to join all text-looking cells in cols 0..colFirstStock-1
    const nameParts: string[] = []
    for (let c = 0; c < colFirstStock; c++) {
      const cell = String(row[c] ?? '').trim()
      if (cell && !cell.match(/^[\d.,\-]+$/) && cell.length < 80) {
        nameParts.push(cell)
      }
    }
    const materialName = nameParts.join(' ').trim()

    // Skip if no material name
    if (!materialName) continue

    // Skip TOTAL rows
    const upperName = materialName.toUpperCase()
    if (
      upperName.includes('TOTAL') ||
      upperName.includes('TỔNG') ||
      upperName.includes('CỘNG')
    )
      continue

    const firstStock = colFirstStock >= 0 ? toNum(row[colFirstStock]) : 0
    const inQty      = colIn         >= 0 ? toNum(row[colIn])         : 0
    const outBroken  = colBroken     >= 0 ? toNum(row[colBroken])     : 0
    const outTape    = colTape       >= 0 ? toNum(row[colTape])       : 0
    const outReject  = colReject     >= 0 ? toNum(row[colReject])     : 0
    const outUsing   = colOutUsing   >= 0 ? toNum(row[colOutUsing])   : 0


    result.push({
      materialName,
      firstStock,
      inQty,
      outUsing,
      outBroken,
      outTape,
      outReject,
      lastStock,
    })
  }

  return result
}
