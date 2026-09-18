// src/app/api/orders/[id]/route.ts
// GET, PATCH, DELETE for a single ProductionOrder by cuid id.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { updateOrderSchema } from '@/lib/validations/order'
import { calculateOrderWeight } from '@/lib/calculations/orderWeight'

type RouteContext = { params: { id: string } }

// ── Helper: extract & validate id ─────────────────────────────────────────

function getId(ctx: RouteContext): string {
  return ctx.params.id
}

// ── GET /api/orders/[id] ───────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  context: RouteContext,
) {
  const id = getId(context)

  try {
    const order = await prisma.productionOrder.findUnique({ 
      where: { id },
      include: { assignments: { select: { startDate: true, endDate: true } } },
    })

    if (!order) {
      return NextResponse.json(
        { success: false, error: 'Order not found.' },
        { status: 404 },
      )
    }

    return NextResponse.json({ success: true, order })
  } catch (err) {
    console.error(`[GET /api/orders/${id}] Error:`, err)
    return NextResponse.json(
      { success: false, error: 'Server error fetching order.' },
      { status: 500 },
    )
  }
}

// ── PATCH /api/orders/[id] ─────────────────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  context: RouteContext,
) {
  const id = getId(context)

  // 1. Parse body
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON in request body.' },
      { status: 400 },
    )
  }

  // 2. Server-side Zod validation
  const parsed = updateOrderSchema.safeParse(body)
  if (!parsed.success) {
    const messages = parsed.error.issues
      .map((e) => `${String(e.path.join('.'))}: ${e.message}`)
      .join('; ')
    return NextResponse.json(
      { success: false, error: `Validation failed — ${messages}` },
      { status: 422 },
    )
  }

  const data = parsed.data

  // 3. Build the update payload explicitly so null values are preserved
  //    (clearing optional fields) and dates are converted correctly.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateData: Record<string, any> = {}

  if (data.piNumber !== undefined)     updateData.piNumber = data.piNumber
  if (data.subLineIndex !== undefined) updateData.subLineIndex = data.subLineIndex
  if (data.customer !== undefined)     updateData.customer = data.customer
  if (data.orderDate !== undefined)    updateData.orderDate = new Date(data.orderDate)
  if (data.widthM !== undefined)       updateData.widthM = data.widthM
  if (data.lengthM !== undefined)      updateData.lengthM = data.lengthM
  if (data.gsm !== undefined)          updateData.gsm = data.gsm
  if ('productionGsm' in data)         updateData.productionGsm = data.productionGsm
  if (data.color !== undefined)        updateData.color = data.color
  // Optional nullable fields — undefined = not sent (skip), null = clear value
  if ('qty' in data)         updateData.qty = data.qty
  if ('uvPct' in data)       updateData.uvPct = data.uvPct
  if ('frPct' in data) {
    updateData.frPct = data.frPct
    updateData.frFlag = data.frPct != null ? data.frPct > 0 : false
  } else if (data.frFlag !== undefined) {
    updateData.frFlag = data.frFlag
  }
  if ('description' in data) updateData.description = data.description
  if ('remark' in data)      updateData.remark = data.remark
  if ('lineNote' in data)    updateData.lineNote = data.lineNote
  if (data.requiresPacking !== undefined) updateData.requiresPacking = data.requiresPacking
  if ('deliveryDate' in data) updateData.deliveryDate = data.deliveryDate ? new Date(data.deliveryDate) : null
  if ('containerSize' in data) updateData.containerSize = data.containerSize

  // Technical specs
  if ('meshType' in data)    updateData.meshType    = data.meshType
  if ('needleCount' in data) updateData.needleCount = data.needleCount
  if ('beamCount' in data)   updateData.beamCount   = data.beamCount
  // Mã Masterbatch màu
  if ('mbCode' in data)      updateData.mbCode      = data.mbCode
  // Kiểu đơn hàng
  if (data.orderType !== undefined) updateData.orderType = data.orderType
  if ('rollLength' in data)  updateData.rollLength  = data.rollLength
  if ('pieceLength' in data) updateData.pieceLength = data.pieceLength
  // Eyelet
  if (data.hasEyelet !== undefined) updateData.hasEyelet = data.hasEyelet
  if ('eyeletColor' in data)  updateData.eyeletColor  = data.eyeletColor
  if ('eyeletLines' in data)  updateData.eyeletLines  = data.eyeletLines
  if ('eyeletSpec' in data)   updateData.eyeletSpec   = data.eyeletSpec

  // 4. Recalculate weight if any relevant field changed
  const weightFields = ['widthM', 'lengthM', 'gsm', 'productionGsm', 'qty', 'rollLength', 'pieceLength', 'orderType']
  const weightFieldChanged = weightFields.some(f => f in updateData || f in data)

  if (weightFieldChanged) {
    // Fetch current values so we can fill in whichever fields weren't sent in this patch
    const current = await prisma.productionOrder.findUnique({
      where: { id },
      select: { widthM: true, lengthM: true, gsm: true, productionGsm: true, qty: true, rollLength: true, pieceLength: true, orderType: true },
    })
    if (current) {
      const { qtySqm, totalWeightKgs, requiredYarnKg } = calculateOrderWeight({
        orderType:     (updateData.orderType   ?? current.orderType)   as string,
        widthM:        (updateData.widthM      ?? current.widthM)      as number,
        lengthM:       (updateData.lengthM     ?? current.lengthM)     as number,
        gsm:           (updateData.gsm         ?? current.gsm)         as number,
        productionGsm: (updateData.productionGsm !== undefined ? updateData.productionGsm : current.productionGsm) as number | null,
        qty:           (updateData.qty         ?? current.qty)         as number | null,
        rollLength:    (updateData.rollLength  ?? current.rollLength  != null ? Number(current.rollLength)  : null) as number | null,
        pieceLength:   (updateData.pieceLength ?? current.pieceLength != null ? Number(current.pieceLength) : null) as number | null,
      })
      updateData.qtySqm         = qtySqm
      updateData.totalWeightKgs = totalWeightKgs
      updateData.requiredYarnKg = requiredYarnKg
    }
  }

  // 5. Update in DB
  try {
    const order = await prisma.productionOrder.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json({ success: true, order })
  } catch (err: unknown) {
    // P2025 = record not found
    if (
      err !== null &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code: string }).code === 'P2025'
    ) {
      return NextResponse.json(
        { success: false, error: 'Order not found.' },
        { status: 404 },
      )
    }
    // P2002 = unique constraint (piNumber + subLineIndex clash)
    if (
      err !== null &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code: string }).code === 'P2002'
    ) {
      return NextResponse.json(
        {
          success: false,
          error: 'That PI Number and sub-line combination already exists on another order.',
        },
        { status: 409 },
      )
    }

    console.error(`[PATCH /api/orders/${id}] Unexpected error:`, err)
    return NextResponse.json(
      { success: false, error: 'An unexpected server error occurred.' },
      { status: 500 },
    )
  }
}

// ── DELETE /api/orders/[id] ────────────────────────────────────────────────

export async function DELETE(
  _req: NextRequest,
  context: RouteContext,
) {
  const id = getId(context)

  try {
    await prisma.productionOrder.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    if (
      err !== null &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code: string }).code === 'P2025'
    ) {
      return NextResponse.json(
        { success: false, error: 'Order not found.' },
        { status: 404 },
      )
    }

    console.error(`[DELETE /api/orders/${id}] Unexpected error:`, err)
    return NextResponse.json(
      { success: false, error: 'An unexpected server error occurred.' },
      { status: 500 },
    )
  }
}
