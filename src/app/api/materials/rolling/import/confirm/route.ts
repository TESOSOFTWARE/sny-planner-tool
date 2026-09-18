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
    // A PI may contain several sub-lines.  Only auto-link a rolling row when
    // the PI resolves to exactly one order; never silently attach it to the
    // last row returned by the database.
    const piMap = new Map<string, string | null>()
    for (const o of dbOrders) {
      const key = o.piNumber.trim().toUpperCase()
      piMap.set(key, piMap.has(key) ? null : o.id)
    }

    let ambiguousOrderCount = 0
    const rollingData = parseResult.metrics.map((m) => {
      const matchedOrderId = m.orderRef ? (piMap.get(m.orderRef.trim().toUpperCase()) ?? null) : null
      if (m.orderRef && piMap.has(m.orderRef.trim().toUpperCase()) && matchedOrderId == null) ambiguousOrderCount++
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
      ambiguousOrderCount,
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
