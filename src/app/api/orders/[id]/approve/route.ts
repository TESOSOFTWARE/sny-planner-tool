// src/app/api/orders/[id]/approve/route.ts
// POST /api/orders/[id]/approve
// Validates every sub-line in the PI as an approved order before changing any
// draft flag or placeholder assignment.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { calculateOrderWeight } from '@/lib/calculations/orderWeight'
import { approvedOrderStateSchema } from '@/lib/validations/order'
import type { ParsedOrder } from '@/types'

function dateOnly(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null
}

function numberOrNull(value: unknown): number | null {
  if (value == null) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function stateFor(line: Awaited<ReturnType<typeof prisma.productionOrder.findUniqueOrThrow>>): ParsedOrder {
  return {
    piNumber: line.piNumber,
    subLineIndex: line.subLineIndex,
    customer: line.customer,
    orderDate: line.orderDate.toISOString().slice(0, 10),
    widthM: line.widthM as number,
    lengthM: line.lengthM,
    gsm: line.gsm as number,
    productionGsm: line.productionGsm,
    color: line.color as string,
    orderType: line.orderType as ParsedOrder['orderType'],
    qty: line.qty,
    rollLength: numberOrNull(line.rollLength),
    pieceLength: numberOrNull(line.pieceLength),
    uvPct: numberOrNull(line.uvPct),
    frFlag: line.frFlag,
    frPct: numberOrNull(line.frPct),
    description: line.description,
    remark: line.remark,
    mbCode: line.mbCode,
    meshType: line.meshType,
    needleCount: line.needleCount,
    beamCount: line.beamCount,
    lineNote: line.lineNote,
    requiresPacking: line.requiresPacking,
    deliveryDate: dateOnly(line.deliveryDate),
    containerSize: line.containerSize,
    hasEyelet: line.hasEyelet,
    eyeletColor: line.eyeletColor,
    eyeletLines: line.eyeletLines,
    eyeletSpec: line.eyeletSpec,
  }
}

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const target = await tx.productionOrder.findUnique({ where: { id: params.id } })
      if (!target) return { notFound: true as const }
      if (!target.isDraft) return { alreadyApproved: true as const }

      const lines = await tx.productionOrder.findMany({
        where: { piNumber: target.piNumber },
        orderBy: { subLineIndex: 'asc' },
      })
      const missingFields = new Set<string>()
      const validated = lines.map((line, index) => {
        const parsed = approvedOrderStateSchema.safeParse(stateFor(line))
        if (!parsed.success) {
          const label = lines.length > 1 ? ` (Dòng ${index + 1})` : ''
          parsed.error.issues.forEach((issue) => missingFields.add(`${String(issue.path.join('.'))}${label}: ${issue.message}`))
          return null
        }
        return parsed.data
      })
      if (missingFields.size > 0) {
        return { invalid: Array.from(missingFields) }
      }

      const subLineIds = lines.map((line) => line.id)
      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index]
        const data = validated[index]
        if (!data) return { invalid: ['Dòng không hợp lệ'] }
        const calculation = calculateOrderWeight({
          orderType: data.orderType ?? 'meters',
          widthM: data.widthM ?? null,
          lengthM: data.lengthM ?? null,
          gsm: data.gsm ?? null,
          productionGsm: data.productionGsm ?? null,
          qty: data.qty ?? null,
          rollLength: data.rollLength ?? null,
          pieceLength: data.pieceLength ?? null,
        })
        await tx.productionOrder.update({
          where: { id: line.id },
          data: {
            isDraft: false,
            lengthM: calculation.totalMeters,
            qtySqm: calculation.qtySqm,
            totalWeightKgs: calculation.totalWeightKgs,
            requiredYarnKg: calculation.requiredYarnKg,
          },
        })
      }
      await tx.machineAssignment.updateMany({ where: { orderId: { in: subLineIds } }, data: { isPlaceholder: false } })
      return { count: lines.length, piNumber: target.piNumber }
    }, { timeout: 30_000, maxWait: 5_000 })

    if ('notFound' in result && result.notFound) return NextResponse.json({ success: false, error: 'Đơn hàng không tồn tại.' }, { status: 404 })
    if ('alreadyApproved' in result && result.alreadyApproved) return NextResponse.json({ success: true, message: 'Đơn hàng đã được duyệt trước đó.' })
    if (result.invalid) return NextResponse.json({ success: false, error: `Chưa thể duyệt đơn nháp do thiếu hoặc sai thông tin: ${result.invalid.join(', ')}`, missingFields: result.invalid }, { status: 422 })
    return NextResponse.json({ success: true, message: `Đã duyệt thành công ${result.count} dòng hàng của PI [${result.piNumber}].` })
  } catch (err) {
    console.error('[POST /api/orders/[id]/approve]', err)
    return NextResponse.json({ success: false, error: 'Lỗi server khi duyệt đơn nháp.' }, { status: 500 })
  }
}
