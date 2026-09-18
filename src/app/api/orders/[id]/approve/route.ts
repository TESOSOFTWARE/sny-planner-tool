// src/app/api/orders/[id]/approve/route.ts
// POST /api/orders/[id]/approve
// Validates a draft order and all sub-lines under the same PI against multiLineOrderSchema.
// If missing required fields, blocks approval and returns list of missing field names.
// If valid, recalculates weights and sets isDraft = false.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { calculateOrderWeight } from '@/lib/calculations/orderWeight'

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params

  try {
    const targetOrder = await prisma.productionOrder.findUnique({
      where: { id },
    })

    if (!targetOrder) {
      return NextResponse.json({ success: false, error: 'Đơn hàng không tồn tại.' }, { status: 404 })
    }

    if (!targetOrder.isDraft) {
      return NextResponse.json({ success: true, message: 'Đơn hàng đã được duyệt trước đó.' })
    }

    // Fetch all sub-lines of the same PI Number to validate and approve together
    const piSubLines = await prisma.productionOrder.findMany({
      where: { piNumber: targetOrder.piNumber },
      orderBy: { subLineIndex: 'asc' },
    })

    const missingFieldsSet = new Set<string>()

    // Check required fields per sub-line
    piSubLines.forEach((line, i) => {
      const idxLabel = piSubLines.length > 1 ? ` (Dòng ${i + 1})` : ''

      if (!line.color) missingFieldsSet.add(`Màu sắc${idxLabel}`)
      if (line.widthM == null || line.widthM <= 0) missingFieldsSet.add(`Khổ (m)${idxLabel}`)
      if (line.gsm == null || line.gsm <= 0) missingFieldsSet.add(`GSM${idxLabel}`)

      if (line.orderType === 'meters') {
        if (line.lengthM == null || line.lengthM <= 0) missingFieldsSet.add(`Chiều dài (m)${idxLabel}`)
      } else if (line.orderType === 'rolls') {
        if (line.qty == null || line.qty <= 0) missingFieldsSet.add(`Số cuộn${idxLabel}`)
        if (line.rollLength == null || Number(line.rollLength) <= 0) missingFieldsSet.add(`Mét/cuộn${idxLabel}`)
      } else if (line.orderType === 'pieces') {
        if (line.qty == null || line.qty <= 0) missingFieldsSet.add(`Số tấm${idxLabel}`)
        if (line.pieceLength == null || Number(line.pieceLength) <= 0) missingFieldsSet.add(`Chiều dài tấm (m)${idxLabel}`)
      }
    })

    if (missingFieldsSet.size > 0) {
      const missingFields = Array.from(missingFieldsSet)
      return NextResponse.json(
        {
          success: false,
          error: `Chưa thể duyệt đơn nháp do thiếu thông tin: ${missingFields.join(', ')}`,
          missingFields,
        },
        { status: 422 }
      )
    }

    const subLineIds = piSubLines.map((l) => l.id)

    // All validation passed! Recalculate weights, update isDraft = false for all sub-lines,
    // AND convert all linked MachineAssignments from isPlaceholder = true -> false
    await prisma.$transaction([
      ...piSubLines.map((line) => {
        const orderType = line.orderType ?? 'meters'
        const w = line.widthM!
        const g = line.gsm!

        let effectiveLengthM = line.lengthM ?? 0
        if (orderType === 'rolls' && line.qty && line.rollLength) {
          effectiveLengthM = line.qty * Number(line.rollLength)
        } else if (orderType === 'pieces' && line.qty && line.pieceLength) {
          effectiveLengthM = line.qty * Number(line.pieceLength)
        }

        const { qtySqm, totalWeightKgs, requiredYarnKg } = calculateOrderWeight({
          orderType,
          widthM: w,
          lengthM: effectiveLengthM,
          gsm: g,
          productionGsm: line.productionGsm ?? null,
          qty: line.qty ?? null,
          rollLength: line.rollLength ? Number(line.rollLength) : null,
          pieceLength: line.pieceLength ? Number(line.pieceLength) : null,
        })

        return prisma.productionOrder.update({
          where: { id: line.id },
          data: {
            isDraft: false,
            lengthM: effectiveLengthM,
            qtySqm,
            totalWeightKgs,
            requiredYarnKg,
          },
        })
      }),
      prisma.machineAssignment.updateMany({
        where: { orderId: { in: subLineIds } },
        data: { isPlaceholder: false },
      }),
    ])

    return NextResponse.json({
      success: true,
      message: `Đã duyệt thành công ${piSubLines.length} dòng hàng của PI [${targetOrder.piNumber}].`,
    })
  } catch (err) {
    console.error('[POST /api/orders/[id]/approve]', err)
    return NextResponse.json({ success: false, error: 'Lỗi server khi duyệt đơn nháp.' }, { status: 500 })
  }
}
