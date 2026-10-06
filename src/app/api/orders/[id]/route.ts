// src/app/api/orders/[id]/route.ts
// GET, PATCH, DELETE for a single ProductionOrder by cuid id.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import type { ParsedOrder } from '@/types'
import {
  approvedOrderStateSchema,
  draftOrderStateSchema,
  updateOrderSchema,
  resolveLifecycle,
  clearHemmedFields,
} from '@/lib/validations/order'
import { calculateOrderWeight } from '@/lib/calculations/orderWeight'

type RouteContext = { params: { id: string } }

function getId(ctx: RouteContext): string { return ctx.params.id }

function isoDate(value: Date | null | undefined): string | null {
  return value ? value.toISOString().slice(0, 10) : null
}

function numberOrNull(value: unknown): number | null {
  if (value == null) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function orderState(order: Awaited<ReturnType<typeof prisma.productionOrder.findUniqueOrThrow>>, overrides: Record<string, unknown> = {}): ParsedOrder {
  // H2 (01/10): HEMMED không lưu field dư — clear ngay ở state merge để
  // validated.* và updateData bên dưới kế thừa, kể cả khi đổi CARTON/BALE → HEMMED.
  return clearHemmedFields({
    piNumber: String(overrides.piNumber ?? order.piNumber),
    subLineIndex: Number(overrides.subLineIndex ?? order.subLineIndex),
    customer: String(overrides.customer ?? order.customer),
    orderDate: String(overrides.orderDate ?? isoDate(order.orderDate)),
    widthM: (overrides.widthM !== undefined ? overrides.widthM : order.widthM) as number,
    lengthM: (overrides.lengthM !== undefined ? overrides.lengthM : order.lengthM) as number | null,
    gsm: (overrides.gsm !== undefined ? overrides.gsm : order.gsm) as number,
    color: (overrides.color !== undefined ? overrides.color : order.color) as string,
    productionGsm: (overrides.productionGsm !== undefined ? overrides.productionGsm : order.productionGsm) as number | null,
    orderType: String(overrides.orderType ?? order.orderType) as ParsedOrder['orderType'],
    qty: (overrides.qty !== undefined ? overrides.qty : order.qty) as number | null,
    rollLength: numberOrNull(overrides.rollLength !== undefined ? overrides.rollLength : order.rollLength),
    pieceLength: numberOrNull(overrides.pieceLength !== undefined ? overrides.pieceLength : order.pieceLength),
    uvPct: numberOrNull(overrides.uvPct !== undefined ? overrides.uvPct : order.uvPct),
    frFlag: (overrides.frFlag !== undefined ? overrides.frFlag : order.frFlag) === true,
    frPct: numberOrNull(overrides.frPct !== undefined ? overrides.frPct : order.frPct),
    description: (overrides.description !== undefined ? overrides.description : order.description) as string | null,
    remark: (overrides.remark !== undefined ? overrides.remark : order.remark) as string | null,
    mbCode: (overrides.mbCode !== undefined ? overrides.mbCode : order.mbCode) as string | null,
    itemCode: (overrides.itemCode !== undefined ? overrides.itemCode : order.itemCode) as string | null,
    meshType: (overrides.meshType !== undefined ? overrides.meshType : order.meshType) as string | null,
    needleCount: (overrides.needleCount !== undefined ? overrides.needleCount : order.needleCount) as number | null,
    beamCount: (overrides.beamCount !== undefined ? overrides.beamCount : order.beamCount) as number | null,
    lineNote: (overrides.lineNote !== undefined ? overrides.lineNote : order.lineNote) as string | null,
    requiresPacking: (overrides.requiresPacking !== undefined ? overrides.requiresPacking : order.requiresPacking) === true,
    deliveryDate: overrides.deliveryDate !== undefined
      ? (overrides.deliveryDate ? String(overrides.deliveryDate) : null)
      : isoDate(order.deliveryDate),
    containerSize: (overrides.containerSize !== undefined ? overrides.containerSize : order.containerSize) as string | null,
    hasEyelet: (overrides.hasEyelet !== undefined ? overrides.hasEyelet : order.hasEyelet) === true,
    eyeletColor: (overrides.eyeletColor !== undefined ? overrides.eyeletColor : order.eyeletColor) as string | null,
    eyeletLines: (overrides.eyeletLines !== undefined ? overrides.eyeletLines : order.eyeletLines) as number | null,
    eyeletSpec: (overrides.eyeletSpec !== undefined ? overrides.eyeletSpec : order.eyeletSpec) as string | null,
    // V4.1 (mục 5): field vắng mặt = giữ giá trị cũ, không reset về default.
    colorVersion: (overrides.colorVersion !== undefined ? overrides.colorVersion : order.colorVersion) as string | null,
    primaryPackingType: String(overrides.primaryPackingType ?? order.primaryPackingType) as ParsedOrder['primaryPackingType'],
    subPackingType: (overrides.subPackingType !== undefined ? overrides.subPackingType : order.subPackingType) as ParsedOrder['subPackingType'],
    hasPaperCore: (overrides.hasPaperCore !== undefined ? overrides.hasPaperCore : order.hasPaperCore) === true,
    isHalfFolded: (overrides.isHalfFolded !== undefined ? overrides.isHalfFolded : order.isHalfFolded) === true,
    outerWrapping: (overrides.outerWrapping !== undefined ? overrides.outerWrapping : order.outerWrapping) as ParsedOrder['outerWrapping'],
    piecesPerCarton: numberOrNull(overrides.piecesPerCarton !== undefined ? overrides.piecesPerCarton : order.piecesPerCarton),
    piecesPerBale: numberOrNull(overrides.piecesPerBale !== undefined ? overrides.piecesPerBale : order.piecesPerBale),
    boxDimensions: (overrides.boxDimensions !== undefined ? overrides.boxDimensions : order.boxDimensions) as string | null,
    onPallet: (overrides.onPallet !== undefined ? overrides.onPallet : order.onPallet) === true,
    secondaryPackingType: String(overrides.secondaryPackingType ?? order.secondaryPackingType) as ParsedOrder['secondaryPackingType'],
    palletDimensions: (overrides.palletDimensions !== undefined ? overrides.palletDimensions : order.palletDimensions) as string | null,
    itemsPerPallet: numberOrNull(overrides.itemsPerPallet !== undefined ? overrides.itemsPerPallet : order.itemsPerPallet),
    packingNote: (overrides.packingNote !== undefined ? overrides.packingNote : order.packingNote) as string | null,
    isLaminated: (overrides.isLaminated !== undefined ? overrides.isLaminated : order.isLaminated) === true,
    rawFabricGsm: numberOrNull(overrides.rawFabricGsm !== undefined ? overrides.rawFabricGsm : order.rawFabricGsm),
    coatingGsm: numberOrNull(overrides.coatingGsm !== undefined ? overrides.coatingGsm : order.coatingGsm),
    finishedGsm: numberOrNull(overrides.finishedGsm !== undefined ? overrides.finishedGsm : order.finishedGsm),
    toleranceQtyPct: (overrides.toleranceQtyPct !== undefined ? overrides.toleranceQtyPct : order.toleranceQtyPct) as number | null,
    toleranceSpecPct: (overrides.toleranceSpecPct !== undefined ? overrides.toleranceSpecPct : order.toleranceSpecPct) as number | null,
    // P0-3: lifecycle — vắng mặt = giữ giá trị cũ (partial update)
    lifecycleStatus: ((overrides.lifecycleStatus !== undefined ? overrides.lifecycleStatus : order.lifecycleStatus) || undefined) as ParsedOrder['lifecycleStatus'],
    isPlaceholder: (overrides.isPlaceholder !== undefined ? overrides.isPlaceholder : order.isPlaceholder) === true,
  })
}

function isStaleTimestamp(expected: string | undefined, actual: Date): boolean {
  return expected != null && new Date(expected).getTime() !== actual.getTime()
}

export async function GET(_req: NextRequest, context: RouteContext) {
  const id = getId(context)
  try {
    const order = await prisma.productionOrder.findUnique({
      where: { id },
      include: { assignments: { select: { startDate: true, endDate: true } } },
    })
    if (!order) return NextResponse.json({ success: false, error: 'Order not found.' }, { status: 404 })
    return NextResponse.json({ success: true, order })
  } catch (err) {
    console.error(`[GET /api/orders/${id}] Error:`, err)
    return NextResponse.json({ success: false, error: 'Server error fetching order.' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  const id = getId(context)
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON in request body.' }, { status: 400 })
  }
  const parsed = updateOrderSchema.safeParse(body)
  if (!parsed.success) {
    const messages = parsed.error.issues.map((issue) => `${String(issue.path.join('.'))}: ${issue.message}`).join('; ')
    return NextResponse.json({ success: false, error: `Validation failed — ${messages}` }, { status: 422 })
  }
  const data = parsed.data

  try {
    const result = await prisma.$transaction(async (tx) => {
      const current = await tx.productionOrder.findUnique({ where: { id } })
      if (!current) return { notFound: true as const }
      if (isStaleTimestamp(data.expectedUpdatedAt, current.updatedAt)) return { stale: true as const }

      const overrides: Record<string, unknown> = {}
      for (const field of [
        'piNumber', 'subLineIndex', 'customer', 'orderDate', 'widthM', 'lengthM', 'gsm',
        'productionGsm', 'color', 'qty', 'uvPct', 'frFlag', 'frPct', 'description', 'remark',
        'lineNote', 'requiresPacking', 'deliveryDate', 'containerSize', 'meshType', 'needleCount',
        'beamCount', 'mbCode', 'itemCode', 'orderType', 'rollLength', 'pieceLength', 'hasEyelet',
        'eyeletColor', 'eyeletLines', 'eyeletSpec',
        // V4.1 (mục 5) — OrderDetail đơn lẻ gửi đủ, field thiếu = giữ cũ (merge ở orderState)
        'colorVersion', 'primaryPackingType', 'subPackingType', 'hasPaperCore', 'isHalfFolded',
        'outerWrapping', 'piecesPerCarton', 'piecesPerBale', 'boxDimensions', 'onPallet',
        'secondaryPackingType', 'palletDimensions', 'itemsPerPallet', 'packingNote',
        'isLaminated', 'rawFabricGsm', 'coatingGsm', 'finishedGsm',
        'toleranceQtyPct', 'toleranceSpecPct',
        // P0-3: lifecycle phải được ghi khi sửa đơn lẻ
        'lifecycleStatus', 'isPlaceholder',
      ]) {
        if (field in data) overrides[field] = (data as Record<string, unknown>)[field]
      }
      if ('orderDate' in overrides && overrides.orderDate) overrides.orderDate = String(overrides.orderDate)

      const state = orderState(current, overrides)
      const targetLifecycle = (state.lifecycleStatus as string) || (current.isDraft ? 'DRAFT' : 'APPROVED')
      const finalResult = targetLifecycle === 'DRAFT'
        ? draftOrderStateSchema.safeParse(state)
        : approvedOrderStateSchema.safeParse(state)
      if (!finalResult.success) {
        const messages = finalResult.error.issues.map((issue) => `${String(issue.path.join('.'))}: ${issue.message}`).join('; ')
        return { invalid: messages }
      }

      const validated = finalResult.data
      const calculation = calculateOrderWeight({
        orderType: validated.orderType ?? 'meters',
        widthM: validated.widthM ?? null,
        lengthM: validated.lengthM ?? null,
        gsm: validated.gsm ?? null,
        productionGsm: validated.productionGsm ?? null,
        qty: validated.qty ?? null,
        rollLength: validated.rollLength ?? null,
        pieceLength: validated.pieceLength ?? null,
        // V4.1 (mục 5): đơn tráng màng phải tính theo GSM thành phẩm/mộc,
        // nếu không cân sẽ bị tính lại sai mỗi lần sửa đơn lẻ.
        isLaminated: validated.isLaminated ?? false,
        rawFabricGsm: validated.rawFabricGsm ?? null,
        coatingGsm: validated.coatingGsm ?? null,
        finishedGsm: validated.finishedGsm ?? null,
      })
      const updateData: Record<string, unknown> = {
        piNumber: validated.piNumber,
        subLineIndex: validated.subLineIndex,
        customer: validated.customer,
        orderDate: new Date(`${validated.orderDate}T00:00:00.000Z`),
        widthM: validated.widthM ?? null,
        lengthM: calculation.totalMeters,
        gsm: validated.gsm ?? null,
        productionGsm: validated.productionGsm ?? null,
        color: validated.color ?? null,
        qty: validated.qty ?? null,
        uvPct: validated.uvPct ?? null,
        frFlag: Boolean((validated.frPct != null && validated.frPct > 0) || validated.frFlag),
        frPct: validated.frPct ?? null,
        description: validated.description ?? null,
        remark: validated.remark ?? null,
        lineNote: validated.lineNote ?? null,
        requiresPacking: validated.requiresPacking ?? false,
        deliveryDate: validated.deliveryDate ? new Date(`${validated.deliveryDate}T00:00:00.000Z`) : null,
        containerSize: validated.containerSize ?? null,
        meshType: validated.meshType ?? null,
        needleCount: validated.needleCount ?? null,
        beamCount: validated.beamCount ?? null,
        mbCode: validated.mbCode ?? null,
        itemCode: validated.itemCode ?? null,
        orderType: validated.orderType ?? 'meters',
        rollLength: validated.rollLength ?? null,
        pieceLength: validated.pieceLength ?? null,
        hasEyelet: validated.hasEyelet ?? false,
        eyeletColor: validated.eyeletColor ?? null,
        eyeletLines: validated.eyeletLines ?? null,
        eyeletSpec: validated.eyeletSpec ?? null,
        // V4.1 (mục 5): persist các field OrderDetail gửi lên; merge ở
        // orderState() đã giữ giá trị cũ cho field vắng mặt nên ?? ở đây
        // chỉ là lưới an toàn, không reset dữ liệu đã lưu.
        colorVersion: validated.colorVersion ?? null,
        primaryPackingType: validated.primaryPackingType ?? 'ROLL',
        subPackingType: validated.subPackingType ?? null,
        hasPaperCore: validated.hasPaperCore ?? false,
        isHalfFolded: validated.isHalfFolded ?? false,
        outerWrapping: validated.outerWrapping ?? 'POLYBAG',
        piecesPerCarton: validated.piecesPerCarton ?? null,
        piecesPerBale: validated.piecesPerBale ?? null,
        boxDimensions: validated.boxDimensions ?? null,
        onPallet: validated.onPallet ?? false,
        secondaryPackingType: validated.secondaryPackingType ?? 'NONE',
        palletDimensions: validated.palletDimensions ?? null,
        itemsPerPallet: validated.itemsPerPallet ?? null,
        packingNote: validated.packingNote ?? null,
        isLaminated: validated.isLaminated ?? false,
        rawFabricGsm: validated.rawFabricGsm ?? null,
        coatingGsm: validated.coatingGsm ?? null,
        finishedGsm: validated.finishedGsm ?? null,
        toleranceQtyPct: validated.toleranceQtyPct ?? null,
        toleranceSpecPct: validated.toleranceSpecPct ?? null,
        // P0-3: ghi lifecycle khi sửa đơn lẻ
        isDraft: (validated.lifecycleStatus ?? current.lifecycleStatus ?? 'APPROVED') === 'DRAFT',
        lifecycleStatus: validated.lifecycleStatus ?? current.lifecycleStatus ?? 'APPROVED',
        isPlaceholder: validated.isPlaceholder ?? current.isPlaceholder ?? false,
        qtySqm: calculation.qtySqm,
        totalWeightKgs: calculation.totalWeightKgs,
        requiredYarnKg: calculation.requiredYarnKg,
      }
      const updatedCount = await tx.productionOrder.updateMany({ where: { id, updatedAt: current.updatedAt }, data: updateData })
      if (updatedCount.count !== 1) return { stale: true as const }
      const order = await tx.productionOrder.findUnique({ where: { id } })
      return { order }
    }, { timeout: 30_000, maxWait: 5_000 })

    if ('notFound' in result && result.notFound) return NextResponse.json({ success: false, error: 'Order not found.' }, { status: 404 })
    if ('stale' in result && result.stale) return NextResponse.json({ success: false, error: 'Đơn hàng đã được thay đổi. Vui lòng tải lại trước khi lưu.', code: 'STALE_PREVIEW' }, { status: 409 })
    if ('invalid' in result) return NextResponse.json({ success: false, error: `Không thể lưu đơn hàng: ${result.invalid}` }, { status: 422 })
    return NextResponse.json({ success: true, order: result.order })
  } catch (err: unknown) {
    if (err !== null && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'P2025') {
      return NextResponse.json({ success: false, error: 'Order not found.' }, { status: 404 })
    }
    if (err !== null && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'P2002') {
      return NextResponse.json({ success: false, error: 'That PI Number and sub-line combination already exists on another order.' }, { status: 409 })
    }
    console.error(`[PATCH /api/orders/${id}] Unexpected error:`, err)
    return NextResponse.json({ success: false, error: 'An unexpected server error occurred.' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, context: RouteContext) {
  const id = getId(context)
  try {
    await prisma.productionOrder.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    if (err !== null && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'P2025') {
      return NextResponse.json({ success: false, error: 'Order not found.' }, { status: 404 })
    }
    console.error(`[DELETE /api/orders/${id}] Unexpected error:`, err)
    return NextResponse.json({ success: false, error: 'An unexpected server error occurred.' }, { status: 500 })
  }
}
