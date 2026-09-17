// src/app/api/knitting/detail/template/route.ts
// GET /api/knitting/detail/template
// Generate and return a .xlsx template file for Knitting Detail daily report input.

import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'

export async function GET() {
  try {
    const wb = XLSX.utils.book_new()

    const titleRow1 = ['KNITTING DAILY DETAIL TEMPLATE']
    const titleRow2 = ['Ngày báo cáo:', '2026-07-20']
    const emptyRow: string[] = []

    const machineHeader = ['', '6.56', 'MACHINE 1', '', '', '', '', '', '', '', '', '', '', '', '', 96, 1382.4, 'A', 98.5]
    const colHeader     = ['', 'SIZE OF MACHINE (M)', 'NO.', 'width', 'color', 'weight', 'length(m)', 'tape/roll', 'm', 'average/roll', 'quantity', 'weight(kg)', 'total(kg)', 'total(m)', 'Remark', 'Qty of Netting Cm/per min', 'Qty of Netting Meter/per day', 'Operating grade', 'Total %']
    const sampleRow1    = ['', '', 'D', 4.0, 'BLACK', 165, 1000, 2, 2000, 500, 4, 330, 330, 1000, 'JPY26-274', '', '', '', '']
    const sampleRow2    = ['', '', 'N', 4.0, 'BLACK', 165, 1000, 2, 2000, 500, 4, 330, 660, 2000, '* Thay 2 dàn, đổi màu: 00h30\'-02h30\' (N)', '', '', '', '']
    const totalRow      = ['', '', 'TOTAL', '', '', '', '', '', '', '', 8, 660, 660, 2000, '', '', '', '', '']

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
      ['', '6.85', 'MACHINE 2', '', '', '', '', '', '', '', '', '', '', '', '', 108, 1555.2, 'A', 99.0],
      colHeader,
      ['', '', 'D', 4.0, 'WHITE', 150, 1000, 2, 2000, 500, 4, 300, 300, 1000, 'GBN26-110', '', '', '', ''],
    ]

    const ws = XLSX.utils.aoa_to_sheet(aoa)

    ws['!cols'] = [
      { wch: 4  },
      { wch: 18 },  // SIZE
      { wch: 6  },  // NO.
      { wch: 8  },  // width
      { wch: 16 },  // color
      { wch: 8  },  // weight
      { wch: 10 },  // length
      { wch: 10 },  // tape/roll
      { wch: 8  },  // m
      { wch: 12 },  // avg/roll
      { wch: 10 },  // quantity
      { wch: 12 },  // weight(kg)
      { wch: 12 },  // total(kg)
      { wch: 12 },  // total(m)
      { wch: 30 },  // Remark
      { wch: 18 },  // Cm/min
      { wch: 18 },  // Meter/day
      { wch: 14 },  // Grade
      { wch: 10 },  // Total %
    ]

    XLSX.utils.book_append_sheet(wb, ws, 'KNITTING')
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="Template_Knitting_Detail.xlsx"',
      },
    })
  } catch (err) {
    console.error('[GET /api/knitting/detail/template]', err)
    return NextResponse.json({ success: false, error: 'Không thể tạo file template.' }, { status: 500 })
  }
}
