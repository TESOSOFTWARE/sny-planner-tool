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
    'COATING',
    'RAW FABRIC GSM',
    'COATING GSM',
    'FINISHED GSM',
    'QTY TOLERANCE (%)',
    'SPEC TOLERANCE (%)',
    'COLOR',
    'COLOR VERSION',
    'MB CODE',
    'ITEM CODE',
    'MESH TYPE',
    'NEEDLE COUNT',
    'UV',
    'FR %',
    'PACKING TYPE',
    'OUTER WRAPPING',
    'PAPER CORE',
    'PCS / BOX',
    'PCS / BALE',
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
  const titleRow = ['ORDER LIST - TEMPLATE (PI CONTAINER: 40HQ)', ...Array(headerRow.length - 1).fill('')]

  const sampleRow1 = [
    'ALTAJ26-4-1',                           // 0: PI NUMBER ID
    'ALTAJ26-4',                             // 1: PI NUMBER
    1,                                       // 2: NO
    'ALTAJ',                                 // 3: CUSTOMER
    '2026-09-03',                            // 4: ORDER DATE
    '2026-10-31',                            // 5: DELIVERY DATE
    'RESERVED',                              // 6: STATUS (DRAFT | RESERVED | APPROVED)
    'rolls',                                 // 7: ORDER TYPE
    50,                                      // 8: QTY
    2.0,                                     // 9: WIDTH (M)
    50,                                      // 10: LENGTH (M)
    240,                                     // 11: GSM
    255,                                     // 12: PRODUCTION GSM (Order Weight xưởng)
    'NO',                                    // 13: COATING
    null,                                    // 14: RAW FABRIC GSM
    null,                                    // 15: COATING GSM
    null,                                    // 16: FINISHED GSM
    5.0,                                     // 17: QTY TOLERANCE (%)
    3.0,                                     // 18: SPEC TOLERANCE (%)
    'DESERT SAND',                           // 19: COLOR
    'Version A',                             // 20: COLOR VERSION
    'MYD4501A',                              // 21: MB CODE
    'DS-430-A',                              // 22: ITEM CODE
    'Standard',                              // 23: MESH TYPE
    18,                                      // 22: NEEDLE COUNT
    0.04,                                    // 23: UV
    null,                                    // 24: FR % (trống hoặc 0 = không FR; ví dụ 6.5)
    'ROLL',                                  // 25: PACKING TYPE (ROLL | CARTON | BALE | HEMMED)
    'TARPAULIN',                             // 26: OUTER WRAPPING
    'YES',                                   // 27: PAPER CORE
    null,                                    // 29: PCS / BOX
    null,                                    // 30: PCS / BALE
    'NO',                                    // 31: ON PALLET
    'NONE',                                  // 32: PALLET TYPE
    null,                                    // 33: PALLET DIMENSIONS
    null,                                    // 34: ITEMS / PALLET
    'Printed polybag, plastic cap 50mm',    // 35: PACKING NOTE
    false,                                   // 36: EYELET
    null,                                    // 37: EYELET COLOR
    null,                                    // 38: EYELET LINES
    null,                                    // 39: EYELET SPEC
    'Cuộn quấn màng co',                     // 40: LINE NOTE
    'Hàng xuất Ả Rập',                       // 41: REMARK
    'PE Shade Net UV 3 years',               // 42: DESCRIPTION
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
    'NO',                                    // 13: COATING
    null,                                    // 14: RAW FABRIC GSM
    null,                                    // 15: COATING GSM
    null,                                    // 16: FINISHED GSM
    10.0,                                    // 17: QTY TOLERANCE (%)
    5.0,                                     // 18: SPEC TOLERANCE (%)
    'DARK GREEN',                            // 19: COLOR
    'STD',                                   // 20: COLOR VERSION
    '7079',                                  // 21: MB CODE
    'DG-180-STD',                            // 22: ITEM CODE
    'Standard',                              // 23: MESH TYPE
    24,                                      // 22: NEEDLE COUNT
    0.02,                                    // 23: UV
    6.5,                                     // 24: FR %
    'HEMMED',                                // 25: PACKING TYPE (May viền, đóng khuy)
    'POLYBAG',                               // 26: OUTER WRAPPING
    'NO',                                    // 27: PAPER CORE
    10,                                      // 29: PCS / BOX (Quy cách đóng thùng)
    null,                                    // 30: PCS / BALE
    'YES',                                   // 31: ON PALLET
    'WOOD_PALLET',                           // 32: PALLET TYPE
    '110x110 cm',                            // 33: PALLET DIMENSIONS (Cảnh báo mềm nếu thiếu)
    20,                                      // 34: ITEMS / PALLET
    'May viền đóng khuy, đóng thùng 5 lớp',  // 35: PACKING NOTE
    true,                                    // 36: EYELET
    'BLACK',                                 // 37: EYELET COLOR
    4,                                       // 38: EYELET LINES
    '50cm interval',                         // 39: EYELET SPEC
    'Tấm gia công may viền',                 // 40: LINE NOTE
    'Đơn xuất kho EU',                       // 41: REMARK
    'PE Shade Net export EU',                // 42: DESCRIPTION
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
    430,                                     // 11: GSM (Thành phẩm giao khách)
    340,                                     // 12: PRODUCTION GSM (Order weight xưởng)
    'YES',                                   // 13: COATING
    325,                                     // 14: RAW FABRIC GSM
    105,                                     // 15: COATING GSM
    430,                                     // 16: FINISHED GSM
    10.0,                                    // 17: QTY TOLERANCE (%)
    5.0,                                     // 18: SPEC TOLERANCE (%)
    'DESERT SAND',                           // 19: COLOR
    'Version A',                             // 20: COLOR VERSION
    'LS309315',                              // 21: MB CODE
    'DS-325-COAT',                           // 22: ITEM CODE
    'Standard',                              // 23: MESH TYPE
    18,                                      // 22: NEEDLE COUNT
    0.04,                                    // 23: UV
    null,                                    // 24: FR %
    'ROLL',                                  // 25: PACKING TYPE
    'POLYBAG',                               // 26: OUTER WRAPPING
    'YES',                                   // 27: PAPER CORE
    null,                                    // 29: PCS / BOX
    null,                                    // 30: PCS / BALE
    'NO',                                    // 31: ON PALLET
    'NONE',                                  // 32: PALLET TYPE
    null,                                    // 33: PALLET DIMENSIONS
    null,                                    // 34: ITEMS / PALLET
    'Dệt mộc 325gsm, tráng màng 105gsm',     // 35: PACKING NOTE
    false,                                   // 36: EYELET
    null,                                    // 37: EYELET COLOR
    null,                                    // 38: EYELET LINES
    null,                                    // 39: EYELET SPEC
    'Hàng tráng màng ngoài 430gsm',          // 40: LINE NOTE
    'Xuất khẩu chống thấm',                  // 41: REMARK
    'PE Shade Net waterproof 430gsm',        // 42: DESCRIPTION
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
    { wch: 12 }, // 13: COATING
    { wch: 16 }, // 14: RAW FABRIC GSM
    { wch: 14 }, // 15: COATING GSM
    { wch: 14 }, // 16: FINISHED GSM
    { wch: 20 }, // 17: QTY TOLERANCE (%)
    { wch: 20 }, // 18: SPEC TOLERANCE (%)
    { wch: 16 }, // 19: COLOR
    { wch: 16 }, // 20: COLOR VERSION
    { wch: 14 }, // 21: MB CODE
    { wch: 18 }, // 22: ITEM CODE
    { wch: 14 }, // 23: MESH TYPE
    { wch: 14 }, // 24: NEEDLE COUNT
    { wch: 8 },  // 25: UV
    { wch: 8 },  // 26: FR %
    { wch: 14 }, // 27: PACKING TYPE
    { wch: 16 }, // 28: OUTER WRAPPING
    { wch: 14 }, // 29: PAPER CORE
    { wch: 12 }, // 30: PCS / BOX
    { wch: 12 }, // 31: PCS / BALE
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
      'Content-Disposition': 'attachment; filename="order_import_template.xlsx"',
    },
  })
}
