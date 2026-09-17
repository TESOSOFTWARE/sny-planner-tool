import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'

export async function GET(req: NextRequest, { params }: { params: { group: string } }) {
  try {
    const group = params.group.toUpperCase()

    let headers: string[] = []
    let sheetName = 'Sheet1'

    if (group === 'HDPE') {
      sheetName = 'HDPE'
      headers = ['Tên NVL', 'FIRST STOCK', 'IN', 'HDPE BROKEN', 'XUẤT TAPE', 'REJECT', 'OUT USING', 'LAST STOCK']
    } else if (group === 'MB') {
      sheetName = 'MB'
      // ParseMaterialReport expects materialName before the first numeric column.
      headers = ['Tên NVL', 'FIRST STOCK', 'IN', 'OUT USING', 'LAST STOCK']
    } else if (group === 'KOREA') {
      sheetName = 'KOREA'
      headers = ['Tên NVL', 'FIRST STOCK', 'IN', 'OUT USING', 'LAST STOCK']
    } else {
      return NextResponse.json({ success: false, error: 'Invalid group' }, { status: 400 })
    }

    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet([headers])

    // Format columns a bit
    ws['!cols'] = headers.map(h => ({ wch: h.includes('Tên') ? 30 : 15 }))

    XLSX.utils.book_append_sheet(wb, ws, sheetName)
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="Template_NVL_${group}.xlsx"`,
      },
    })
  } catch (error) {
    console.error(`[GET /api/materials/template/${params.group}]`, error)
    return NextResponse.json(
      { success: false, error: 'Failed to generate template file.' },
      { status: 500 },
    )
  }
}
