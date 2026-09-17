// src/lib/excel/parseRollingReport.ts
// Server-only utility — parses SNY's Statistical Report Excel file, sheet "ROLLING".
// Long-format parsing of 6 primary shift/size metric labels per order item per date.

import * as XLSX from 'xlsx'

export interface ParsedRollingMetric {
  date:           string   // ISO date string (YYYY-MM-DD)
  dateLabelRaw:   string   // Raw label from Excel row 3, e.g. "3st", "04+05th"
  orderRef:       string | null
  orderId:        string | null
  color:          string | null
  widthM:         number | null
  lengthM:        number | null
  weightKgsOrder: number | null
  metricLabel:    string   // e.g. "QUANTITY SMALL", "WEIGHT NIGHT"
  metricValue:    number   // strictly > 0
  dataSource:     string
  cellRef:        string   // e.g. "Col H (row 6, col 7)" for verification audit trail
}

export interface DateBlockMapping {
  dateLabelRaw: string
  startCol:     number
  endCol:       number
  spanCols:     number
  isoDate:      string
  note:         string | null
}

export interface ParseRollingResult {
  metrics:          ParsedRollingMetric[]
  dateBlockMappings: DateBlockMapping[]
  totalOrderRows:   number
  nonZeroCount:     number
  summarySkipped:   number
  availableSheets:  string[]
  fileName:         string
}

/**
 * Parses date label from Row 3 to YYYY-MM-DD ISO string.
 * Handles single date ("3st", "05th") and ambiguous joint labels ("04+05th", "27+28th").
 */
export function parseDateLabelToISO(label: string, defaultMonth: number, defaultYear: number): { isoDate: string; note: string | null } {
  const clean = label.replace(/[^\d+]/g, '').trim()
  if (!clean) {
    return {
      isoDate: `${defaultYear}-${String(defaultMonth).padStart(2, '0')}-01`,
      note: 'Dùng ngày 01 mặc định do nhãn không chứa chữ số',
    }
  }

  if (clean.includes('+')) {
    const firstDay = parseInt(clean.split('+')[0], 10)
    const validDay = !isNaN(firstDay) && firstDay >= 1 && firstDay <= 31 ? firstDay : 1
    const mm = String(defaultMonth).padStart(2, '0')
    const dd = String(validDay).padStart(2, '0')
    return {
      isoDate: `${defaultYear}-${mm}-${dd}`,
      note: `Nhãn gộp "${label}" -> Lấy ngày đầu tiên (${validDay})`,
    }
  }

  const day = parseInt(clean, 10)
  const validDay = !isNaN(day) && day >= 1 && day <= 31 ? day : 1
  const mm = String(defaultMonth).padStart(2, '0')
  const dd = String(validDay).padStart(2, '0')
  return {
    isoDate: `${defaultYear}-${mm}-${dd}`,
    note: null,
  }
}

/**
 * Main parser for ROLLING sheet.
 */
export function parseRollingReport(buffer: Buffer, fileName: string): ParseRollingResult {
  const wb = XLSX.read(buffer, { raw: false, cellDates: true })
  const availableSheets = wb.SheetNames

  const sheetName = availableSheets.find((s) => s.toUpperCase().includes('ROLLING'))
  if (!sheetName) {
    throw new Error(`Sheet "ROLLING" không tìm thấy. Các sheet trong file: ${availableSheets.join(', ')}`)
  }

  const ws = wb.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null })

  // Detect month and year from fileName (e.g. "07-2026" or "08-2026")
  let month = 7, year = 2026
  const monthMatch = fileName.match(/(\d{2})[-_](\d{4})/)
  if (monthMatch) {
    month = parseInt(monthMatch[1], 10)
    year  = parseInt(monthMatch[2], 10)
  }

  const rowDate = (rows[3] as unknown[]) || []
  const rowMetric = (rows[4] as unknown[]) || []

  // Extract merged date blocks in Row 3 (starting at col 6)
  const merges: XLSX.Range[] = (ws['!merges'] as XLSX.Range[]) || []
  const dateBlockMappings: DateBlockMapping[] = []

  for (const m of merges) {
    if (m.s.r <= 3 && m.e.r >= 3 && m.s.c >= 6) {
      const val = rowDate[m.s.c]
      if (val != null) {
        const rawLabel = String(val).trim()
        if (rawLabel !== '' && rawLabel.toUpperCase() !== 'TOTAL') {
          const { isoDate, note } = parseDateLabelToISO(rawLabel, month, year)
          dateBlockMappings.push({
            dateLabelRaw: rawLabel,
            startCol: m.s.c,
            endCol: m.e.c,
            spanCols: m.e.c - m.s.c + 1,
            isoDate,
            note,
          })
        }
      }
    }
  }

  dateBlockMappings.sort((a, b) => a.startCol - b.startCol)

  const metrics: ParsedRollingMetric[] = []
  let totalOrderRows = 0
  let nonZeroCount = 0
  let summarySkipped = 0

  let consecutiveBlankRows = 0

  for (let r = 5; r < rows.length; r++) {
    const row = rows[r]
    if (!Array.isArray(row)) {
      consecutiveBlankRows++
      if (consecutiveBlankRows >= 3) break
      continue
    }

    const col0 = row[0] != null ? String(row[0]).trim().toUpperCase() : ''
    const col1 = row[1] != null ? String(row[1]).trim() : ''

    // Check footer keywords in Col A (STT) or Col B (ORDER)
    const isFooterKeyword =
      col0.includes('TOTAL') ||
      col0.includes('SCRAP') ||
      col0.includes('%') ||
      col0.includes('CỘNG') ||
      col0.includes('KẾT QUẢ') ||
      col0.includes('TỶ LỆ') ||
      col1.toUpperCase().includes('TOTAL') ||
      col1.toUpperCase().includes('SCRAP') ||
      col1.includes('%') ||
      col1.toUpperCase().includes('CỘNG')

    if (isFooterKeyword) {
      // Encountered footer summary rows at bottom of sheet — stop reading order rows
      break
    }

    // Must have a valid non-empty orderRef in Col B (ORDER).
    // Do NOT fall back to Col A (STT) which may contain numbers 1..16 or footer text.
    if (!col1) {
      consecutiveBlankRows++
      if (consecutiveBlankRows >= 3) {
        // 3 consecutive blank orderRef rows -> reached end of table
        break
      }
      continue
    }

    consecutiveBlankRows = 0
    totalOrderRows++

    const orderRef = col1.toUpperCase().replace(/\s+/g, ' ')
    const color = row[2] != null ? String(row[2]).trim().toUpperCase() : null
    const widthM = row[3] != null ? Number(row[3]) : null
    const lengthM = row[4] != null ? Number(row[4]) : null
    const weightKgsOrder = row[5] != null ? Number(row[5]) : null

    for (const block of dateBlockMappings) {
      // Each block spans columns from block.startCol to block.endCol
      // Offset 0..5 = 6 Primary Shift Metrics (QUANTITY/TOTAL(M)/WEIGHT x DAY-NIGHT/SMALL-BIG)
      // Offset 6..7 = 2 Summary Columns (QUANTITY & WEIGHT total) -> EXPLICITLY SKIPPED
      for (let c = block.startCol; c <= block.endCol; c++) {
        const val = row[c]
        const offset = c - block.startCol

        if (offset < 6) {
          // Primary shift metric
          const numVal = Number(val)
          if (!isNaN(numVal) && numVal > 0) {
            const rawHeader = String(rowMetric[c] ?? '').replace(/\r?\n/g, ' ').trim()
            nonZeroCount++
            const colName = XLSX.utils.encode_col(c)

            metrics.push({
              date: block.isoDate,
              dateLabelRaw: block.dateLabelRaw,
              orderRef,
              orderId: null, // to be populated during import matching
              color: color || null,
              widthM: isNaN(Number(widthM)) ? null : widthM,
              lengthM: isNaN(Number(lengthM)) ? null : lengthM,
              weightKgsOrder: isNaN(Number(weightKgsOrder)) ? null : weightKgsOrder,
              metricLabel: rawHeader,
              metricValue: numVal,
              dataSource: fileName,
              cellRef: `Row ${r + 1}, Col ${colName} (idx ${c})`,
            })
          }
        } else {
          // Summary column (offset 6 or 7 of 8-col block)
          const numVal = Number(val)
          if (!isNaN(numVal) && numVal > 0) {
            summarySkipped++
          }
        }
      }
    }
  }

  return {
    metrics,
    dateBlockMappings,
    totalOrderRows,
    nonZeroCount,
    summarySkipped,
    availableSheets,
    fileName,
  }
}
