import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { ParsedPackingOutput } from '@/lib/excel/parsePackingReport'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { outputs, fileName } = body as { outputs: ParsedPackingOutput[]; fileName: string }

    if (!Array.isArray(outputs) || outputs.length === 0) {
      return NextResponse.json({ success: false, error: 'Không có dữ liệu Đóng gói hợp lệ để lưu' }, { status: 400 })
    }

    let insertedCount = 0

    await prisma.$transaction(async (tx) => {
      // Delete existing records from same file source to avoid duplicates on re-import
      if (fileName) {
        await tx.packingDailyOutput.deleteMany({
          where: { dataSource: fileName },
        })
      }

      for (const item of outputs) {
        const itemDate = new Date(item.date)

        await tx.packingDailyOutput.create({
          data: {
            date: itemDate,
            qtyDay: item.qtyDay ?? null,
            totalMDay: item.totalMDay != null ? item.totalMDay : null,
            weightDay: item.weightDay != null ? item.weightDay : null,
            qtyNight: item.qtyNight ?? null,
            totalMNight: item.totalMNight != null ? item.totalMNight : null,
            weightNight: item.weightNight != null ? item.weightNight : null,
            dataSource: fileName || 'Import Excel',
          },
        })
        insertedCount++
      }
    })

    return NextResponse.json({
      success: true,
      insertedCount,
      fileName,
    })
  } catch (error: any) {
    console.error('Error confirming packing import:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Lỗi khi lưu dữ liệu Đóng gói vào cơ sở dữ liệu' },
      { status: 500 }
    )
  }
}
