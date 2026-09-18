// src/app/api/orders/template/route.ts
// GET /api/orders/template
// Generates and returns a downloadable .xlsx template for bulk order import
// matching parseOrderList.ts header specification.

import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'

export async function GET() {
  const titleRow = ['ORDER LIST', '', '', '', '', '', '', '', '', '', '', '', '', '']
  const headerRow = [
    'PI NUMBER ID',
    'PI NUMBER',
    'NO',
    'CUSTOMER',
    'DATE',
    'GSM',
    'WIDTH (M)',
    'LENGTH (M)',
    'COLOR',
    'UV',
    'FR',
    "QU'TY",
    'DESCRIPTION',
    'REMARK',
  ]
  const sampleRow1 = [
    'GBN26-110-1',
    'GBN26-110',
    1.0,
    'GRABINO',
    '2026-07-01',
    95,
    4.0,
    30000,
    'BLACK',
    0.02,
    0,
    200,
    'PE Debris Netting, UV 3 years',
    'Ghi chú mẫu 1',
  ]
  const sampleRow2 = [
    'GBN26-110-2',
    'GBN26-110',
    2.0,
    'GRABINO',
    '2026-07-01',
    95,
    4.0,
    30000,
    'GREEN',
    0.02,
    1,
    150,
    'PE Debris Netting',
    'Ghi chú mẫu 2',
  ]

  const wsData = [titleRow, headerRow, sampleRow1, sampleRow2]
  const ws = XLSX.utils.aoa_to_sheet(wsData)

  // Set column widths
  ws['!cols'] = [
    { wch: 18 },
    { wch: 15 },
    { wch: 6 },
    { wch: 22 },
    { wch: 12 },
    { wch: 8 },
    { wch: 12 },
    { wch: 14 },
    { wch: 12 },
    { wch: 8 },
    { wch: 6 },
    { wch: 10 },
    { wch: 30 },
    { wch: 25 },
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'ORDER_LIST')

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

  return new NextResponse(buf, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="order_import_template.xlsx"',
    },
  })
}
