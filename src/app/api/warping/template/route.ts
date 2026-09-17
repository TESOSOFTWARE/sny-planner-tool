// src/app/api/warping/template/route.ts
// GET /api/warping/template
// Generate and return a .xlsx template file for Warping daily report input.

import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'

export async function GET() {
  try {
    const wb = XLSX.utils.book_new()

    const titleRow1 = ['WARPING DAILY OUTPUT TEMPLATE']
    const titleRow2 = ['Ngày báo cáo:', '2026-07-20']
    const emptyRow: string[] = []

    const machineHeader = ['MACHINE 1']
    const colHeader     = ['STT', 'MÁY DỆT', 'COLOR', 'DENIER', 'STRAND', 'BEAM', 'M/EA', 'WEIG', 'BEAM', 'QUANTITY', 'WEIGHT', 'TOTAL', 'REMARK']
    const sampleRow1    = ['D', '40', 'BLACK', 150, 480, 2, 1000, 75, 2, 4, 300, 300, 'JPY26-274']
    const sampleRow2    = ['N', '12', 'WHITE', 200, 520, 2, 1000, 80, 2, 4, 320, 620, '']
    const totalRow      = ['TOTAL', '', '', '', '', '', '', '', '', '', 620, 620, '']

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
      ['MACHINE 2'],
      colHeader,
      ['D', '(máy dệt)', '(màu)', '(denier)', '(strand)', '(beam 1)', '(m/ea)', '(weig)', '(beam 2)', '(qty)', '(weight kg)', '(total)', '(mã PI)'],
    ]

    const ws = XLSX.utils.aoa_to_sheet(aoa)

    ws['!cols'] = [
      { wch: 6  },  // STT
      { wch: 10 },  // MÁY DỆT
      { wch: 16 },  // COLOR
      { wch: 10 },  // DENIER
      { wch: 10 },  // STRAND
      { wch: 10 },  // BEAM 1
      { wch: 10 },  // M/EA
      { wch: 10 },  // WEIG
      { wch: 10 },  // BEAM 2
      { wch: 12 },  // QUANTITY
      { wch: 12 },  // WEIGHT
      { wch: 12 },  // TOTAL
      { wch: 16 },  // REMARK
    ]

    XLSX.utils.book_append_sheet(wb, ws, 'WARPING')
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="Template_Warping.xlsx"',
      },
    })
  } catch (err) {
    console.error('[GET /api/warping/template]', err)
    return NextResponse.json({ success: false, error: 'Không thể tạo file template.' }, { status: 500 })
  }
}
