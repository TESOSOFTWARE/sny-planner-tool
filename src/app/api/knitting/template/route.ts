import { NextResponse } from 'next/server'
import * as xlsx from 'xlsx'

export async function GET() {
  try {
    const wb = xlsx.utils.book_new()
    const wsData: any[][] = []

    const excelEpoch = Date.UTC(1899, 11, 30)
    // Excel date today
    const excelDateToday = Math.floor((Date.now() - excelEpoch) / 86400000)

    // Add instructional header
    wsData.push(['HƯỚNG DẪN NHẬP DỮ LIỆU DỆT'])
    wsData.push(['- Hệ thống chỉ đọc dữ liệu ở dòng có chữ "TOTAL" (cột C).'])
    wsData.push(['- Cột I (LENGTH(M)) ở dòng TOTAL là TỔNG SỐ MÉT DỆT TRONG NGÀY của máy đó.'])
    wsData.push(['- Ngày tháng được xác định tự động ở dòng "MACHINE 1" cột O.'])
    wsData.push([])

    // Machine 1 to 40
    for (let i = 1; i <= 40; i++) {
      const headerRow = []
      headerRow[2] = `MACHINE ${i}` // index 2 = Col C
      if (i === 1) {
        headerRow[14] = excelDateToday // index 14 = Col O
      }
      wsData.push(headerRow)

      // Column headers
      wsData.push([
        'MC NO.', 'SHIFT', 'LOT NO.', 'ROLL NO.', 'DATE', '', '', '', 'LENGTH(M)', 'DEFECT(M)', 'WEIGHT(KG)'
      ])

      // Data row (placeholder for user to see)
      wsData.push([
        i, 'A', 'Mã lô...', 1, '...', '', '', '', 0, 0, 0
      ])

      // Total row (This is what the parser reads)
      const totalRow = []
      totalRow[0] = i             // index 0 = Col A
      totalRow[2] = 'TOTAL'       // index 2 = Col C
      totalRow[8] = 0             // index 8 = Col I (LENGTH)
      wsData.push(totalRow)
      
      wsData.push([]) // Empty row separator
    }

    const ws = xlsx.utils.aoa_to_sheet(wsData)
    
    // Set column widths for better UX
    ws['!cols'] = [
      { wch: 10 }, // A (MC NO.)
      { wch: 10 }, // B (SHIFT)
      { wch: 20 }, // C (LOT NO. / MACHINE X / TOTAL)
      { wch: 10 }, // D (ROLL NO.)
      { wch: 15 }, // E (DATE)
      { wch: 5 },  // F
      { wch: 5 },  // G
      { wch: 5 },  // H
      { wch: 15 }, // I (LENGTH(M))
      { wch: 15 }, // J (DEFECT)
      { wch: 15 }, // K (WEIGHT)
      { wch: 5 },  // L
      { wch: 5 },  // M
      { wch: 5 },  // N
      { wch: 15 }, // O (Date serial on MACHINE 1)
    ]

    xlsx.utils.book_append_sheet(wb, ws, 'KNITTING')

    const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' })
    return new NextResponse(buf, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="Template_Knitting_Report.xlsx"',
      },
    })
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Failed to generate template' }, { status: 500 })
  }
}
