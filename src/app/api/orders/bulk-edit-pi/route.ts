// src/app/api/orders/bulk-edit-pi/route.ts
// PATCH /api/orders/bulk-edit-pi
// Bulk updates shared PO fields across all sub-lines of a piNumber.
// Atomic transaction: updates customer, orderDate, deliveryDate, containerSize, description, remark.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

interface BulkEditBody {
  piNumber: string
  data: {
    customer?: string
    customerId?: string | null
    orderDate?: string
    deliveryDate?: string | null
    containerSize?: string | null
    description?: string | null
    remark?: string | null
  }
}

export async function PATCH(req: NextRequest) {
  let body: BulkEditBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body.' }, { status: 400 })
  }

  const { piNumber, data } = body

  if (!piNumber || !piNumber.trim()) {
    return NextResponse.json({ success: false, error: 'PI Number là bắt buộc.' }, { status: 400 })
  }

  const trimmedPi = piNumber.trim()

  try {
    const existingOrders = await prisma.productionOrder.findMany({
      where: { piNumber: { equals: trimmedPi, mode: 'insensitive' } },
      select: { id: true },
    })

    if (existingOrders.length === 0) {
      return NextResponse.json({ success: false, error: `Không tìm thấy đơn hàng với PI Number [${trimmedPi}].` }, { status: 404 })
    }

    const updateData: Record<string, unknown> = {}

    if (data.customer !== undefined && data.customer.trim()) {
      updateData.customer = data.customer.trim()
    }

    if (data.customerId !== undefined) {
      updateData.customerId = data.customerId
    }

    if (data.orderDate !== undefined && data.orderDate.trim()) {
      updateData.orderDate = new Date(data.orderDate.trim())
    }

    if (data.deliveryDate !== undefined) {
      updateData.deliveryDate = data.deliveryDate && data.deliveryDate.trim() ? new Date(data.deliveryDate.trim()) : null
    }

    if (data.containerSize !== undefined) {
      updateData.containerSize = data.containerSize && data.containerSize.trim() ? data.containerSize.trim() : null
    }

    if (data.description !== undefined) {
      updateData.description = data.description && data.description.trim() ? data.description.trim() : null
    }

    if (data.remark !== undefined) {
      updateData.remark = data.remark && data.remark.trim() ? data.remark.trim() : null
    }

    const result = await prisma.$transaction(async (tx) => {
      const res = await tx.productionOrder.updateMany({
        where: { piNumber: { equals: trimmedPi, mode: 'insensitive' } },
        data: updateData,
      })
      return res.count
    })

    return NextResponse.json({
      success: true,
      count: result,
      message: `Đã cập nhật thành công ${result} dòng hàng thuộc PI [${trimmedPi}].`,
    })
  } catch (err) {
    console.error('[PATCH /api/orders/bulk-edit-pi]', err)
    const msg = err instanceof Error ? err.message : 'Lỗi máy chủ khi cập nhật.'
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
