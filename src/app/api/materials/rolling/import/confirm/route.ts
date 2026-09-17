// src/app/api/materials/rolling/import/confirm/route.ts
// POST /api/materials/rolling/import/confirm — Saves parsed RollingDailyMetric records to DB.

import { NextRequest, NextResponse } from 'next/server'
import { parseRollingReport } from '@/lib/excel/parseRollingReport'
import { prisma } from '@/lib/db'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ success: false, error: 'Vui lòng đính kèm file Excel để xác nhận import.' }, { status: 400 })
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    const parseResult = parseRollingReport(buffer, file.name)

    // PI Number map lookup
    const dbOrders = await prisma.productionOrder.findMany({
      select: { id: true, piNumber: true },
    })
    const piMap = new Map<string, string>()
    for (const o of dbOrders) {
      piMap.set(o.piNumber.trim().toUpperCase(), o.id)
    }

    const rollingData = parseResult.metrics.map((m) => {
      const matchedOrderId = m.orderRef ? (piMap.get(m.orderRef.trim().toUpperCase()) ?? null) : null

      return {
        date: new Date(m.date),
        orderRef: m.orderRef,
        orderId: matchedOrderId,
        color: m.color,
        widthM: m.widthM,
        lengthM: m.lengthM,
        weightKgsOrder: m.weightKgsOrder,
        metricLabel: m.metricLabel,
        metricValue: m.metricValue,
        dataSource: file.name,
      }
    })

    // Batch insert
    let insertedCount = 0
    const batchSize = 500
    for (let i = 0; i < rollingData.length; i += batchSize) {
      const batch = rollingData.slice(i, i + batchSize)
      const res = await prisma.rollingDailyMetric.createMany({
        data: batch,
      })
      insertedCount += res.count
    }

    return NextResponse.json({
      success: true,
      recordsInserted: insertedCount,
      fileName: file.name,
    })
  } catch (error: any) {
    console.error('Error confirming rolling import:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Lỗi khi lưu dữ liệu Rolling vào cơ sở dữ liệu.' },
      { status: 500 }
    )
  }
}
