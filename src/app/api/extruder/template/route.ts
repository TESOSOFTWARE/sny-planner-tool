// src/app/api/extruder/template/route.ts
// GET /api/extruder/template
// Generate and return a .xlsx template file for Extruder daily report input.

import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'

export async function GET() {
  try {
    const wb = XLSX.utils.book_new()

    // ── Title rows ──────────────────────────────────────────────────────────
    const titleRow1 = ['EXTRUDER DAILY OUTPUT TEMPLATE']
    const titleRow2 = ['Ngày báo cáo:', '2026-07-20']  // user fills this in
    const emptyRow: string[] = []

    // ── Machine block example ───────────────────────────────────────────────
    const machineHeader = ['1st EXTRUDER MACHINE']
    const colHeader     = ['NO', 'COLOR', 'DENIER', 'WEIGHT', 'TOTAL', 'BEAM NOTE', 'ORDER REF']
    const sampleRow1    = ['D', 'BLACK B045 UV 2%', 200, 500, 500, '11 BEAM ( 158 SỢI)', 'JPY26-274']
    const sampleRow2    = ['N', 'WHITE UV 4%',      150, 300, 800, '8 BEAM ( 120 SỢI)',  '']
    const totalRow      = ['TOTAL', '', '', 800, 800, '', '']

    const aoa = [
      titleRow1,
      titleRow2,
      emptyRow,
      machineHeader,
      colHeader,
      sampleRow1,
      sampleRow2,
      totalRow,
      emptyRow,
      ['2nd EXTRUDER MACHINE'],
      colHeader,
      ['D', '(màu)', '(denier)', '(weight kg)', '(total)', '(beam note)', '(mã PI)'],
    ]

    const ws = XLSX.utils.aoa_to_sheet(aoa)

    // Column widths
    ws['!cols'] = [
      { wch: 8  },  // NO
      { wch: 22 },  // COLOR
      { wch: 10 },  // DENIER
      { wch: 12 },  // WEIGHT
      { wch: 12 },  // TOTAL
      { wch: 22 },  // BEAM NOTE
      { wch: 16 },  // ORDER REF
    ]

    XLSX.utils.book_append_sheet(wb, ws, 'EXTRUDER')
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="Template_Extruder.xlsx"',
      },
    })
  } catch (err) {
    console.error('[GET /api/extruder/template]', err)
    return NextResponse.json({ success: false, error: 'Không thể tạo file template.' }, { status: 500 })
  }
}
