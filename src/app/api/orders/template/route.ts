// src/app/api/orders/template/route.ts
// GET /api/orders/template
// Generates and returns a downloadable .xlsx template for bulk order import
// matching parseOrderList.ts header specification.

import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'

export async function GET() {
  const headerRow = [
    'PI NUMBER ID',
    'PI NUMBER',
    'NO',
    'CUSTOMER',
    'ORDER DATE',
    'DELIVERY DATE',
    'STATUS',
    'ORDER TYPE',
    'QTY',
    'WIDTH (M)',
    'LENGTH (M)',
    'GSM',
    'PRODUCTION GSM',
    'LAMINATED',
    'BASE GSM',
    'COATING GSM',
    'QTY TOLERANCE (%)',
    'SPEC TOLERANCE (%)',
    'COLOR',
    'COLOR VERSION',
    'MESH TYPE',
    'NEEDLE COUNT',
    'UV',
    'FR',
    'FR %',
    'PACKING TYPE',
    'OUTER WRAPPING',
    'PAPER CORE',
    'HALF FOLDED',
    'PCS / BOX',
    'PCS / BALE',
    'BOX DIMENSIONS',
    'ON PALLET',
    'PALLET TYPE',
    'PALLET DIMENSIONS',
    'ITEMS / PALLET',
    'PACKING NOTE',
    'EYELET',
    'EYELET COLOR',
    'EYELET LINES',
    'EYELET SPEC',
    'LINE NOTE',
    'REMARK',
    'DESCRIPTION',
  ]
  const titleRow = ['ORDER LIST - TEMPLATE V4.1 (PI CONTAINER: 40HQ)', ...Array(headerRow.length - 1).fill('')]

  const sampleRow1 = [
    'ALTAJ26-4-1',                           // 0: PI NUMBER ID
    'ALTAJ26-4',                             // 1: PI NUMBER
    1,                                       // 2: NO
    'ALTAJ',                                 // 3: CUSTOMER
    '2026-09-03',                            // 4: ORDER DATE
    '2026-10-31',                            // 5: DELIVERY DATE
    'APPROVED',                              // 6: STATUS
    'rolls',                                 // 7: ORDER TYPE
    50,                                      // 8: QTY
    2.0,                                     // 9: WIDTH (M)
    50,                                      // 10: LENGTH (M)
    240,                                     // 11: GSM
    255,                                     // 12: PRODUCTION GSM
    'NO',                                    // 13: LAMINATED
    null,                                    // 14: BASE GSM
    null,                                    // 15: COATING GSM
    5.0,                                     // 16: QTY TOLERANCE (%)
    3.0,                                     // 17: SPEC TOLERANCE (%)
    'DESERT SAND',                           // 18: COLOR
    'Version A',                             // 19: COLOR VERSION
    'Standard',                              // 20: MESH TYPE
    18,                                      // 21: NEEDLE COUNT
    0.04,                                    // 22: UV
    'NO',                                    // 23: FR
    null,                                    // 24: FR %
    'ROLL',                                  // 25: PACKING TYPE
    'TARPAULIN',                             // 26: OUTER WRAPPING
    'YES',                                   // 27: PAPER CORE
    'NO',                                    // 28: HALF FOLDED
    null,                                    // 29: PCS / BOX
    null,                                    // 30: PCS / BALE
    null,                                    // 31: BOX DIMENSIONS
    'NO',                                    // 32: ON PALLET
    'NONE',                                  // 33: PALLET TYPE
    null,                                    // 34: PALLET DIMENSIONS
    null,                                    // 35: ITEMS / PALLET
    'Printed polybag, plastic cap 50mm',    // 36: PACKING NOTE
    false,                                   // 37: EYELET
    null,                                    // 38: EYELET COLOR
    null,                                    // 39: EYELET LINES
    null,                                    // 40: EYELET SPEC
    'Cuộn quấn màng co',                     // 41: LINE NOTE
    'Hàng xuất Ả Rập',                       // 42: REMARK
    'PE Shade Net UV 3 years',               // 43: DESCRIPTION
  ]

  const sampleRow2 = [
    'ALTAJ26-4-2',                           // 0: PI NUMBER ID
    'ALTAJ26-4',                             // 1: PI NUMBER
    2,                                       // 2: NO
    'ALTAJ',                                 // 3: CUSTOMER
    '2026-09-03',                            // 4: ORDER DATE
    '2026-10-31',                            // 5: DELIVERY DATE
    'APPROVED',                              // 6: STATUS
    'pieces',                                // 7: ORDER TYPE
    200,                                     // 8: QTY
    3.0,                                     // 9: WIDTH (M)
    5.0,                                     // 10: LENGTH (M)
    180,                                     // 11: GSM
    180,                                     // 12: PRODUCTION GSM
    'NO',                                    // 13: LAMINATED
    null,                                    // 14: BASE GSM
    null,                                    // 15: COATING GSM
    10.0,                                    // 16: QTY TOLERANCE (%)
    5.0,                                     // 17: SPEC TOLERANCE (%)
    'DARK GREEN',                            // 18: COLOR
    'STD',                                   // 19: COLOR VERSION
    'Standard',                              // 20: MESH TYPE
    24,                                      // 21: NEEDLE COUNT
    0.02,                                    // 22: UV
    'YES',                                   // 23: FR
    6.5,                                     // 24: FR %
    'CARTON',                                // 25: PACKING TYPE
    'POLYBAG',                               // 26: OUTER WRAPPING
    'NO',                                    // 27: PAPER CORE
    'YES',                                   // 28: HALF FOLDED
    10,                                      // 29: PCS / BOX
    null,                                    // 30: PCS / BALE
    '60x40x30 cm',                           // 31: BOX DIMENSIONS
    'YES',                                   // 32: ON PALLET
    'WOOD_PALLET',                           // 33: PALLET TYPE
    '110x110 cm',                            // 34: PALLET DIMENSIONS
    20,                                      // 35: ITEMS / PALLET
    'Đóng thùng 5 lớp, pallet khử trùng',    // 36: PACKING NOTE
    true,                                    // 37: EYELET
    'BLACK',                                 // 38: EYELET COLOR
    4,                                       // 39: EYELET LINES
    '50cm interval',                         // 40: EYELET SPEC
    'Tấm gia công đóng thùng',               // 41: LINE NOTE
    'Đơn xuất kho EU',                       // 42: REMARK
    'PE Shade Net export EU',                // 43: DESCRIPTION
  ]

  const sampleRow3 = [
    'HP24-2-1',                              // 0: PI NUMBER ID
    'HP24-2',                                // 1: PI NUMBER
    1,                                       // 2: NO
    'HPBUILDING',                            // 3: CUSTOMER
    '2026-08-15',                            // 4: ORDER DATE
    '2026-11-20',                            // 5: DELIVERY DATE
    'APPROVED',                              // 6: STATUS
    'rolls',                                 // 7: ORDER TYPE
    35,                                      // 8: QTY
    3.0,                                     // 9: WIDTH (M)
    50,                                      // 10: LENGTH (M)
    430,                                     // 11: GSM
    340,                                     // 12: PRODUCTION GSM
    'YES',                                   // 13: LAMINATED
    325,                                     // 14: BASE GSM
    105,                                     // 15: COATING GSM
    10.0,                                    // 16: QTY TOLERANCE (%)
    5.0,                                     // 17: SPEC TOLERANCE (%)
    'DESERT SAND',                           // 18: COLOR
    'Version A',                             // 19: COLOR VERSION
    'Standard',                              // 20: MESH TYPE
    18,                                      // 21: NEEDLE COUNT
    0.04,                                    // 22: UV
    'NO',                                    // 23: FR
    null,                                    // 24: FR %
    'ROLL',                                  // 25: PACKING TYPE
    'POLYBAG',                               // 26: OUTER WRAPPING
    'YES',                                   // 27: PAPER CORE
    'NO',                                    // 28: HALF FOLDED
    null,                                    // 29: PCS / BOX
    null,                                    // 30: PCS / BALE
    null,                                    // 31: BOX DIMENSIONS
    'NO',                                    // 32: ON PALLET
    'NONE',                                  // 33: PALLET TYPE
    null,                                    // 34: PALLET DIMENSIONS
    null,                                    // 35: ITEMS / PALLET
    'Dệt mộc 325gsm, tráng màng 105gsm',     // 36: PACKING NOTE
    false,                                   // 37: EYELET
    null,                                    // 38: EYELET COLOR
    null,                                    // 39: EYELET LINES
    null,                                    // 40: EYELET SPEC
    'Hàng tráng màng ngoài 430gsm',          // 41: LINE NOTE
    'Xuất khẩu chống thấm',                  // 42: REMARK
    'PE Shade Net waterproof 430gsm',        // 43: DESCRIPTION
  ]

  const wsData = [titleRow, headerRow, sampleRow1, sampleRow2, sampleRow3]
  const ws = XLSX.utils.aoa_to_sheet(wsData)

  // Set column widths matching 44 columns
  ws['!cols'] = [
    { wch: 16 }, // 0: PI NUMBER ID
    { wch: 16 }, // 1: PI NUMBER
    { wch: 6 },  // 2: NO
    { wch: 18 }, // 3: CUSTOMER
    { wch: 12 }, // 4: ORDER DATE
    { wch: 14 }, // 5: DELIVERY DATE
    { wch: 12 }, // 6: STATUS
    { wch: 12 }, // 7: ORDER TYPE
    { wch: 10 }, // 8: QTY
    { wch: 12 }, // 9: WIDTH (M)
    { wch: 12 }, // 10: LENGTH (M)
    { wch: 8 },  // 11: GSM
    { wch: 16 }, // 12: PRODUCTION GSM
    { wch: 12 }, // 13: LAMINATED
    { wch: 12 }, // 14: BASE GSM
    { wch: 14 }, // 15: COATING GSM
    { wch: 20 }, // 16: QTY TOLERANCE (%)
    { wch: 20 }, // 17: SPEC TOLERANCE (%)
    { wch: 16 }, // 18: COLOR
    { wch: 16 }, // 19: COLOR VERSION
    { wch: 14 }, // 20: MESH TYPE
    { wch: 14 }, // 21: NEEDLE COUNT
    { wch: 8 },  // 22: UV
    { wch: 6 },  // 23: FR
    { wch: 8 },  // 24: FR %
    { wch: 14 }, // 25: PACKING TYPE
    { wch: 16 }, // 26: OUTER WRAPPING
    { wch: 14 }, // 27: PAPER CORE
    { wch: 14 }, // 28: HALF FOLDED
    { wch: 12 }, // 29: PCS / BOX
    { wch: 12 }, // 30: PCS / BALE
    { wch: 16 }, // 31: BOX DIMENSIONS
    { wch: 12 }, // 32: ON PALLET
    { wch: 16 }, // 33: PALLET TYPE
    { wch: 18 }, // 34: PALLET DIMENSIONS
    { wch: 16 }, // 35: ITEMS / PALLET
    { wch: 32 }, // 36: PACKING NOTE
    { wch: 10 }, // 37: EYELET
    { wch: 14 }, // 38: EYELET COLOR
    { wch: 14 }, // 39: EYELET LINES
    { wch: 16 }, // 40: EYELET SPEC
    { wch: 24 }, // 41: LINE NOTE
    { wch: 24 }, // 42: REMARK
    { wch: 30 }, // 43: DESCRIPTION
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'ORDER_LIST')

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

  return new NextResponse(buf, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="order_import_template_v4.xlsx"',
    },
  })
}
