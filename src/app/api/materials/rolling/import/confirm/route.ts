// src/app/api/materials/rolling/import/confirm/route.ts
// POST /api/materials/rolling/import/confirm — Saves parsed RollingDailyMetric records to DB with Scoped Replacement.

import { NextRequest, NextResponse } from 'next/server'
import { parseRollingReport } from '@/lib/excel/parseRollingReport'
import { prisma } from '@/lib/db'

// In-memory Mutex to prevent overlapping concurrent rolling imports
let isRollingImportInProgress = false

export async function POST(req: NextRequest) {
  if (isRollingImportInProgress) {
    return NextResponse.json(
      { success: false, error: 'Hệ thống đang xử lý một phiên import Rolling khác. Vui lòng đợi trong giây lát.' },
      { status: 409 }
    )
  }

  isRollingImportInProgress = true
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

    if (rollingData.length === 0) {
      return NextResponse.json({
        success: true,
        recordsInserted: 0,
        recordsDeleted: 0,
        datesScoped: 0,
        ambiguousOrderCount,
        fileName: file.name,
        message: 'File không có bản ghi sản lượng Rolling hợp lệ để nạp.',
      })
    }

    // Scoped Replacement: identify distinct dates strictly present in this payload
    const targetDates = Array.from(new Set(rollingData.map((m) => m.date.getTime()))).map((t) => new Date(t))

    // Execute deletion of exact scope and batch insertion atomically inside transaction
    const { deletedCount, insertedCount } = await prisma.$transaction(async (tx) => {
      const deleteRes = await tx.rollingDailyMetric.deleteMany({
        where: {
          date: { in: targetDates },
        },
      })

      let count = 0
      const batchSize = 500
      for (let i = 0; i < rollingData.length; i += batchSize) {
        const batch = rollingData.slice(i, i + batchSize)
        const res = await tx.rollingDailyMetric.createMany({
          data: batch,
        })
        count += res.count
      }

      return {
        deletedCount: deleteRes.count,
        insertedCount: count,
      }
    })

    return NextResponse.json({
      success: true,
      recordsInserted: insertedCount,
      recordsDeleted: deletedCount,
      datesScoped: targetDates.length,
      ambiguousOrderCount,
      fileName: file.name,
    })
  } catch (error: any) {
    console.error('Error confirming rolling import:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Lỗi khi lưu dữ liệu Rolling vào cơ sở dữ liệu.' },
      { status: 500 }
    )
  } finally {
    isRollingImportInProgress = false
  }
}
