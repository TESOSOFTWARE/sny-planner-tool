// src/app/api/materials/rolling/records/route.ts
// GET /api/materials/rolling/records — Fetch RollingDailyMetric records with pagination & filters using pure Prisma ORM.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const date       = searchParams.get('date')?.trim()       // YYYY-MM-DD
    const orderRef   = searchParams.get('orderRef')?.trim()   // PI number substring
    const page       = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const limit      = Math.min(500, Math.max(1, parseInt(searchParams.get('limit') || '100', 10)))
    const skip       = (page - 1) * limit

    const where: any = {}

    if (date) {
      const startOfDay = new Date(`${date}T00:00:00.000Z`)
      const endOfDay   = new Date(`${date}T23:59:59.999Z`)
      where.date = {
        gte: startOfDay,
        lte: endOfDay,
      }
    }

    if (orderRef) {
      where.orderRef = {
        contains: orderRef,
        mode: 'insensitive',
      }
    }

    // 1. Fetch paginated records & count using standard Prisma ORM
    const [records, total, distinctOrders, allMatchingForStats] = await Promise.all([
      prisma.rollingDailyMetric.findMany({
        where,
        orderBy: [{ date: 'desc' }, { orderRef: 'asc' }],
        skip,
        take: limit,
        select: {
          id: true,
          date: true,
          orderRef: true,
          orderId: true,
          color: true,
          widthM: true,
          lengthM: true,
          weightKgsOrder: true,
          metricLabel: true,
          metricValue: true,
          dataSource: true,
          createdAt: true,
        },
      }),

      prisma.rollingDailyMetric.count({ where }),

      prisma.rollingDailyMetric.groupBy({
        by: ['orderRef'],
        where: {
          ...where,
          orderRef: { not: null },
        },
      }),

      // Fetch metricLabel & metricValue for all matching records to compute sumMeters and sumWeightKg
      prisma.rollingDailyMetric.findMany({
        where,
        select: {
          metricLabel: true,
          metricValue: true,
        },
      }),
    ])

    // 2. Fetch list of unique available orderRefs for dropdown filter
    const availableOrdersGroup = await prisma.rollingDailyMetric.groupBy({
      by: ['orderRef'],
      where: { orderRef: { not: null } },
      _count: { orderRef: true },
      orderBy: { orderRef: 'asc' },
    })

    const availableOrders = availableOrdersGroup
      .map((g) => g.orderRef)
      .filter((ref): ref is string => Boolean(ref))

    // 3. Compute sums split by meter vs weight safely using pure Prisma objects
    let sumMeters = 0
    let sumWeightKg = 0

    for (const item of allMatchingForStats) {
      const val = item.metricValue ? Number(item.metricValue) : 0
      if (val <= 0) continue

      const label = (item.metricLabel || '').toUpperCase()
      if (label.includes('TOTAL (M)') || label.includes('METER')) {
        sumMeters += val
      } else if (label.includes('WEIGHT')) {
        sumWeightKg += val
      }
    }

    // 4. Serialize Decimal & Date fields to JSON-serializable types
    const serializedRecords = records.map((r) => ({
      ...r,
      date: r.date.toISOString().slice(0, 10),
      weightKgsOrder: r.weightKgsOrder ? r.weightKgsOrder.toString() : null,
      metricValue: r.metricValue ? r.metricValue.toString() : '0',
      createdAt: r.createdAt.toISOString(),
    }))

    return NextResponse.json({
      success: true,
      records: serializedRecords,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      uniqueOrdersCount: distinctOrders.length,
      sumMeters: Math.round(sumMeters * 100) / 100,
      sumWeightKg: Math.round(sumWeightKg * 100) / 100,
      availableOrders,
    })
  } catch (error: any) {
    console.error('Error fetching rolling records:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Lỗi hệ thống khi tải dữ liệu Rolling.' },
      { status: 500 }
    )
  }
}
