import { NextRequest, NextResponse } from 'next/server'
import { parsePackingReport } from '@/lib/excel/parsePackingReport'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ success: false, error: 'Chưa chọn file Excel' }, { status: 400 })
    }

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const parseResult = parsePackingReport(buffer, file.name)

    return NextResponse.json({
      success: true,
      outputs: parseResult.outputs,
      totalRowsParsed: parseResult.totalRowsParsed,
      fileName: parseResult.fileName,
      availableSheets: parseResult.availableSheets,
    })
  } catch (error: any) {
    console.error('Error previewing packing report:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Lỗi khi đọc file Báo cáo Đóng gói Excel' },
      { status: 500 }
    )
  }
}
