// src/app/api/orders/pi/[piNumber]/approve/route.ts
// POST /api/orders/pi/[piNumber]/approve
// Validates every sub-line in the PI as an approved order before atomically
// transitioning all lines from RESERVED (compat: RESERVE) / DRAFT / PLACEHOLDER to APPROVED.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { calculateOrderWeight } from '@/lib/calculations/orderWeight'
import { approvedOrderStateSchema } from '@/lib/validations/order'
import { buildRecipeSnapshot, matchRecipe, normalizeColorName } from '@/lib/orders/recipeSnapshot'
import type { ParsedOrder } from '@/types'

function dateOnly(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null
}

function numberOrNull(value: unknown): number | null {
  if (value == null) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function stateFor(line: Awaited<ReturnType<typeof prisma.productionOrder.findFirstOrThrow>>): ParsedOrder {
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
    isLaminated: line.isLaminated,
    rawFabricGsm: numberOrNull(line.rawFabricGsm),
    coatingGsm: numberOrNull(line.coatingGsm),
    finishedGsm: numberOrNull(line.finishedGsm),
    colorVersion: line.colorVersion,
    primaryPackingType: line.primaryPackingType as ParsedOrder['primaryPackingType'],
    subPackingType: line.subPackingType as ParsedOrder['subPackingType'],
    hasPaperCore: line.hasPaperCore,
    isHalfFolded: line.isHalfFolded,
    piecesPerCarton: line.piecesPerCarton,
    piecesPerBale: line.piecesPerBale,
    boxDimensions: line.boxDimensions,
    onPallet: line.onPallet,
    secondaryPackingType: line.secondaryPackingType as ParsedOrder['secondaryPackingType'],
    palletDimensions: line.palletDimensions,
    itemsPerPallet: line.itemsPerPallet,
    packingNote: line.packingNote,
    outerWrapping: line.outerWrapping as ParsedOrder['outerWrapping'],
    toleranceQtyPct: numberOrNull(line.toleranceQtyPct),
    toleranceSpecPct: numberOrNull(line.toleranceSpecPct),
  }
}

export async function POST(
  _req: NextRequest,
  { params }: { params: { piNumber: string } },
) {
  const piNumber = decodeURIComponent(params.piNumber)

  try {
    const result = await prisma.$transaction(async (tx) => {
      const lines = await tx.productionOrder.findMany({
        where: { piNumber },
        orderBy: { subLineIndex: 'asc' },
      })
      if (!lines || lines.length === 0) return { notFound: true as const }

      const allAlreadyApproved = lines.every(
        (l) => l.lifecycleStatus === 'APPROVED' && !l.isDraft && !l.isPlaceholder
      )
      if (allAlreadyApproved) return { alreadyApproved: true as const }

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
      const piColors = Array.from(new Set(lines.map((l) => normalizeColorName(l.color)).filter(Boolean)))
      const recipes = piColors.length > 0
        ? await tx.productColorRecipe.findMany({ where: { colorName: { in: piColors, mode: 'insensitive' } } })
        : []
      const approvedAt = new Date().toISOString()

      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index]
        const data = validated[index]
        if (!data) return { invalid: ['Dòng không hợp lệ'] }

        const recipe = matchRecipe(line.color, line.colorVersion, recipes)
        const calculation = calculateOrderWeight({
          orderType: data.orderType ?? 'meters',
          widthM: data.widthM ?? null,
          lengthM: data.lengthM ?? null,
          gsm: data.gsm ?? null,
          productionGsm: data.productionGsm ?? null,
          qty: data.qty ?? null,
          rollLength: data.rollLength ?? null,
          pieceLength: data.pieceLength ?? null,
          isLaminated: data.isLaminated ?? false,
          rawFabricGsm: data.rawFabricGsm ?? null,
          coatingGsm: data.coatingGsm ?? null,
          finishedGsm: data.finishedGsm ?? null,
        })

        await tx.productionOrder.update({
          where: { id: line.id },
          data: {
            isDraft: false,
            lifecycleStatus: 'APPROVED',
            isPlaceholder: false,
            lengthM: calculation.totalMeters,
            qtySqm: calculation.qtySqm,
            totalWeightKgs: calculation.totalWeightKgs,
            requiredYarnKg: calculation.requiredYarnKg,
            ...(recipe ? { colorRecipeSnapshot: buildRecipeSnapshot(recipe, approvedAt) } : {}),
          },
        })
      }

      await tx.machineAssignment.updateMany({
        where: { orderId: { in: subLineIds } },
        data: { isPlaceholder: false },
      })

      return { count: lines.length, piNumber }
    }, { timeout: 30_000, maxWait: 5_000 })

    if ('notFound' in result && result.notFound) {
      return NextResponse.json({ success: false, error: `Không tìm thấy đơn hàng với mã PI "${piNumber}".` }, { status: 404 })
    }
    if ('alreadyApproved' in result && result.alreadyApproved) {
      return NextResponse.json({ success: true, message: `Toàn bộ các dòng hàng của PI [${piNumber}] đã được duyệt trước đó.` })
    }
    if (result.invalid) {
      return NextResponse.json({
        success: false,
        error: `Chưa thể duyệt đơn do thiếu hoặc sai thông tin: ${result.invalid.join(', ')}`,
        missingFields: result.invalid,
      }, { status: 422 })
    }

    return NextResponse.json({
      success: true,
      message: `Đã duyệt thành công ${result.count} dòng hàng của PI [${result.piNumber}]. Trạng thái: APPROVED.`,
    })
  } catch (err) {
    console.error(`[POST /api/orders/pi/${piNumber}/approve]`, err)
    return NextResponse.json({ success: false, error: 'Lỗi server khi duyệt PI.' }, { status: 500 })
  }
}
