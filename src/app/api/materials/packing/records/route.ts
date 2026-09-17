import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const page = parseInt(searchParams.get('page') || '1', 10)
    const limit = parseInt(searchParams.get('limit') || '100', 10)

    const where: any = {}

    if (startDate || endDate) {
      where.date = {}
      if (startDate) where.date.gte = new Date(startDate)
      if (endDate) where.date.lte = new Date(`${endDate}T23:59:59.999Z`)
    }

    const skip = (page - 1) * limit

    const [records, total, distinctDays, allMatchingForStats] = await Promise.all([
      prisma.packingDailyOutput.findMany({
        where,
        orderBy: [{ date: 'desc' }],
        skip,
        take: limit,
      }),

      prisma.packingDailyOutput.count({ where }),

      prisma.packingDailyOutput.groupBy({
        by: ['date'],
        where,
      }),

      prisma.packingDailyOutput.findMany({
        where,
        select: {
          totalMDay: true,
          weightDay: true,
          totalMNight: true,
          weightNight: true,
        },
      }),
    ])

    let sumTotalMeters = 0
    let sumTotalWeightKg = 0

    for (const item of allMatchingForStats) {
      const mDay = item.totalMDay ? Number(item.totalMDay) : 0
      const mNight = item.totalMNight ? Number(item.totalMNight) : 0
      const wDay = item.weightDay ? Number(item.weightDay) : 0
      const wNight = item.weightNight ? Number(item.weightNight) : 0

      sumTotalMeters += mDay + mNight
      sumTotalWeightKg += wDay + wNight
    }

    const serializedRecords = records.map((r) => ({
      id: r.id,
      date: r.date.toISOString().slice(0, 10),
      qtyDay: r.qtyDay,
      totalMDay: r.totalMDay ? r.totalMDay.toString() : null,
      weightDay: r.weightDay ? r.weightDay.toString() : null,
      qtyNight: r.qtyNight,
      totalMNight: r.totalMNight ? r.totalMNight.toString() : null,
      weightNight: r.weightNight ? r.weightNight.toString() : null,
      dataSource: r.dataSource,
      createdAt: r.createdAt.toISOString(),
    }))

    return NextResponse.json({
      success: true,
      records: serializedRecords,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
      stats: {
        totalRecords: total,
        uniqueDaysCount: distinctDays.length,
        sumTotalMeters: Math.round(sumTotalMeters * 100) / 100,
        sumTotalWeightKg: Math.round(sumTotalWeightKg * 100) / 100,
      },
    })
  } catch (error: any) {
    console.error('Error fetching packing daily outputs:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Lỗi hệ thống khi tải báo cáo Đóng gói' },
      { status: 500 }
    )
  }
}
