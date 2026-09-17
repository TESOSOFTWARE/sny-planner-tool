import { parseRollingReport } from '../src/lib/excel/parseRollingReport'
import { parsePackingReport } from '../src/lib/excel/parsePackingReport'
import fs from 'fs'

const file07 = 'C:\\Users\\ACER\\Downloads\\STATISTICAL REPORT 07-2026 (3).xlsx'
const file08 = 'C:\\Users\\ACER\\Downloads\\STATISTICAL REPORT 08-2026.xlsx'

function generateReport(filePath: string, fileName: string) {
  console.log(`\n================================================================================`)
  console.log(`PREVIEW DRY-RUN REPORT FOR FILE: ${fileName}`)
  console.log(`Path: ${filePath}`)
  console.log(`================================================================================`)

  const buf = fs.readFileSync(filePath)

  // 1. ROLLING
  const rollingRes = parseRollingReport(buf, fileName)
  console.log(`\n--- [1] SHEET ROLLING SUMMARY ---`)
  console.log(`Total Order Rows Read: ${rollingRes.totalOrderRows}`)
  console.log(`Total Primary Shift Metrics (>0): ${rollingRes.nonZeroCount}`)
  console.log(`Total Block Summary Metrics Skipped (QUANTITY/WEIGHT totals): ${rollingRes.summarySkipped}`)

  console.log(`\n--- FULL DATE BLOCK MAPPINGS (ROW 3 MERGED CELLS -> CONVERTED ISO DATE) ---`)
  console.table(
    rollingRes.dateBlockMappings.map((m, idx) => ({
      Block: idx + 1,
      OriginalLabel: m.dateLabelRaw,
      ColRange: `Cols ${m.startCol}..${m.endCol} (span ${m.spanCols})`,
      ConvertedDate: m.isoDate,
      HandlingNote: m.note ?? 'Chuẩn (1-1)',
    }))
  )

  // Ambiguous date labels
  const ambiguous = rollingRes.dateBlockMappings.filter((m) => m.note !== null)
  if (ambiguous.length > 0) {
    console.log(`\n⚠ AMBIGUOUS DATE LABELS DETECTED (${ambiguous.length}):`)
    ambiguous.forEach((a) => {
      console.log(`  - Nhãn gốc: "${a.dateLabelRaw}" (Cols ${a.startCol}..${a.endCol}) -> Gán ngày ISO: ${a.isoDate} | Diễn giải: ${a.note}`)
    })
  } else {
    console.log(`\n✅ Không có nhãn ngày mơ hồ trong file này.`)
  }

  // Pick 10 random sample records
  console.log(`\n--- 10 RANDOM SAMPLE PARSED METRICS WITH CELL REFERENCES ---`)
  const metrics = rollingRes.metrics
  const samples: typeof metrics = []
  if (metrics.length > 0) {
    const step = Math.max(1, Math.floor(metrics.length / 10))
    for (let i = 0; i < metrics.length && samples.length < 10; i += step) {
      samples.push(metrics[i])
    }
  }

  console.table(
    samples.map((s) => ({
      OrderRef: s.orderRef,
      Date: s.date,
      LabelInExcel: s.dateLabelRaw,
      MetricLabel: s.metricLabel,
      MetricValue: s.metricValue,
      CellRef: s.cellRef,
    }))
  )

  // 2. PACKING
  const packingRes = parsePackingReport(buf, fileName)
  console.log(`\n--- [2] SHEET SẢN LƯỢNG ĐÓNG GÓI SUMMARY ---`)
  console.log(`Total Days Parsed: ${packingRes.outputs.length}`)
  console.log(`Sample Packing Output (first 3 days):`)
  console.table(
    packingRes.outputs.slice(0, 3).map((p) => ({
      Date: p.date,
      DayQty: p.qtyDay,
      DayTotalM: p.totalMDay,
      DayWeight: p.weightDay,
      NightQty: p.qtyNight,
      NightTotalM: p.totalMNight,
      NightWeight: p.weightNight,
    }))
  )
}

console.log('Generating Preview Dry-Run Report for Rolling & Packing Import...')
generateReport(file07, 'STATISTICAL REPORT 07-2026 (3).xlsx')
generateReport(file08, 'STATISTICAL REPORT 08-2026.xlsx')
