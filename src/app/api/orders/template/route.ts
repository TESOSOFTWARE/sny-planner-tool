// src/app/api/orders/template/route.ts
// GET /api/orders/template
// Generates and returns a downloadable .xlsx template for bulk order import
// matching parseOrderList.ts header specification.

import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'

export async function GET() {
  const titleRow = ['ORDER LIST', ...Array(30).fill('')]
  const headerRow = [
    'PI NUMBER ID',
    'PI NUMBER',
    'NO',
    'CUSTOMER',
    'DATE',
    'DELIVERY DATE',
    'GSM',
    'PRODUCTION GSM',
    'WIDTH (M)',
    'LENGTH (M)',
    'ORDER TYPE',
    'ROLL LENGTH (M)',
    'PIECE LENGTH (M)',
    'COLOR',
    'UV',
    'FR',
    'FR %',
    "QU'TY",
    'DESCRIPTION',
    'REMARK',
    'MB CODE',
    'MESH TYPE',
    'NEEDLE COUNT',
    'BEAM COUNT',
    'REQUIRES PACKING',
    'LINE NOTE',
    'HAS EYELET',
    'EYELET COLOR',
    'EYELET LINES',
    'EYELET SPEC',
    'CONTAINER SIZE',
  ]
  const sampleRow1 = [
    'GBN26-110-1',
    'GBN26-110',
    1.0,
    'GRABINO',
    '2026-07-01',
    '2026-07-20',
    95,
    95,
    4.0,
    30000,
    'meters',
    null,
    null,
    'BLACK',
    0.02,
    0,
    null,
    null,
    'PE Debris Netting, UV 3 years',
    'Ghi chú mẫu 1',
    'MYD4501A',
    'HD',
    24,
    2,
    true,
    'Dòng mẫu theo tổng mét',
    false,
    null,
    null,
    null,
    '40HQ x 1',
  ]
  const sampleRow2 = [
    'GBN26-110-2',
    'GBN26-110',
    2.0,
    'GRABINO',
    '2026-07-01',
    '2026-07-20',
    95,
    98,
    4.0,
    null,
    'rolls',
    200,
    null,
    'GREEN',
    0.02,
    1,
    3,
    150,
    'PE Debris Netting',
    'Ghi chú mẫu 2',
    '7079',
    'HDPE',
    24,
    2,
    false,
    null,
    true,
    'BLACK',
    4,
    '5cm interval',
    '40HQ x 1',
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
    { wch: 14 },
    { wch: 8 },
    { wch: 16 },
    { wch: 12 },
    { wch: 14 },
    { wch: 14 },
    { wch: 16 },
    { wch: 16 },
    { wch: 12 },
    { wch: 8 },
    { wch: 6 },
    { wch: 8 },
    { wch: 10 },
    { wch: 30 },
    { wch: 25 },
    { wch: 16 },
    { wch: 16 },
    { wch: 14 },
    { wch: 14 },
    { wch: 18 },
    { wch: 28 },
    { wch: 14 },
    { wch: 16 },
    { wch: 14 },
    { wch: 24 },
    { wch: 18 },
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
