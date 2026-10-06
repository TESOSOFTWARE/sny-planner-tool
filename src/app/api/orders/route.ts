// src/app/api/orders/route.ts
// POST /api/orders — validate and create a new ProductionOrder in the DB.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { createOrderSchema } from '@/lib/validations/order'
import { calculateOrderWeight } from '@/lib/calculations/orderWeight'
import { resolveLifecycle, cleanSubLineForValidation, clearHemmedFields } from '@/lib/validations/order'

export async function POST(req: NextRequest) {
  // ── 1. Parse body ──────────────────────────────────────────────────────────
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON in request body.' },
      { status: 400 },
    )
  }

  // ── 2. Server-side Zod validation ──────────────────────────────────────────
  const sanitizedBody = body && typeof body === 'object' ? cleanSubLineForValidation(body) : body
  const parsed = createOrderSchema.safeParse(sanitizedBody)
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

  // P0-3: ghi lifecycleStatus + isPlaceholder thay vì để DB default('APPROVED') thắng
  const lifecycle = resolveLifecycle({
    lifecycleStatus: data.lifecycleStatus,
    isPlaceholder: data.isPlaceholder,
  })

  // ── 3. Calculate weight (Case A formula) ──────────────────────────────────
  const { qtySqm, totalWeightKgs, requiredYarnKg } = calculateOrderWeight({
    orderType: data.orderType ?? 'meters',
    widthM: data.widthM,
    lengthM: data.lengthM,
    gsm: data.gsm,
    productionGsm: data.productionGsm ?? null,
    qty: data.qty ?? null,
    rollLength: data.rollLength ?? null,
    pieceLength: data.pieceLength ?? null,
  })

  // ── 4. Save to DB ──────────────────────────────────────────────────────────
  try {
    const order = await prisma.productionOrder.create({
      data: clearHemmedFields({
        piNumber: data.piNumber,
        subLineIndex: data.subLineIndex,
        customer: data.customer,
        ...(data.customerId != null && { customerId: data.customerId }),
        // Convert YYYY-MM-DD string → JS Date for Prisma DateTime field
        orderDate: new Date(data.orderDate),
        widthM: data.widthM,
        lengthM: data.lengthM,
        gsm: data.gsm,
        ...(data.productionGsm != null && { productionGsm: data.productionGsm }),
        color: data.color,
        // Optional fields — only included when present
        ...(data.qty != null && { qty: data.qty }),
        ...(data.uvPct != null && { uvPct: data.uvPct }),
        frFlag: data.frFlag ?? false,
        ...(data.frPct != null && { frPct: data.frPct }),
        ...(data.description && { description: data.description }),
        ...(data.remark && { remark: data.remark }),
        ...(data.lineNote != null && { lineNote: data.lineNote }),
        requiresPacking: data.requiresPacking ?? false,
        lifecycleStatus: lifecycle.lifecycleStatus,
        isPlaceholder: lifecycle.isPlaceholder,
        ...(data.deliveryDate && { deliveryDate: new Date(data.deliveryDate) }),
        ...(data.containerSize != null && { containerSize: data.containerSize }),
        // Technical specs
        ...(data.meshType   != null && { meshType:    data.meshType }),
        ...(data.needleCount != null && { needleCount: data.needleCount }),
        ...(data.beamCount  != null && { beamCount:   data.beamCount }),
        // Mã Masterbatch màu
        ...(data.mbCode != null && { mbCode: data.mbCode }),
        // Item Code tự do theo dòng
        ...(data.itemCode != null && { itemCode: data.itemCode }),
        // Kiểu đơn hàng
        orderType: data.orderType ?? 'meters',
        ...(data.rollLength  != null && { rollLength:  data.rollLength }),
        ...(data.pieceLength != null && { pieceLength: data.pieceLength }),
        // Eyelet
        hasEyelet: data.hasEyelet ?? false,
        ...(data.eyeletColor != null && { eyeletColor: data.eyeletColor }),
        ...(data.eyeletLines != null && { eyeletLines: data.eyeletLines }),
        ...(data.eyeletSpec != null && { eyeletSpec: data.eyeletSpec }),
        // V4 Packaging & Dual-GSM
        primaryPackingType: data.primaryPackingType ?? 'ROLL',
        subPackingType: data.subPackingType ?? null,
        hasPaperCore: data.hasPaperCore ?? false,
        isHalfFolded: Boolean(data.isHalfFolded),
        outerWrapping: data.outerWrapping ?? 'POLYBAG',
        piecesPerCarton: data.piecesPerCarton ?? null,
        piecesPerBale: data.piecesPerBale ?? null,
        boxDimensions: data.boxDimensions ?? null,
        secondaryPackingType: data.secondaryPackingType ?? 'NONE',
        palletDimensions: data.palletDimensions ?? null,
        itemsPerPallet: data.itemsPerPallet ?? null,
        packingNote: data.packingNote ?? null,
        isLaminated: Boolean(data.isLaminated),
        rawFabricGsm: data.rawFabricGsm ?? null,
        coatingGsm: data.coatingGsm ?? null,
        finishedGsm: data.finishedGsm ?? null,
        colorVersion: data.colorVersion ?? null,
        toleranceQtyPct: data.toleranceQtyPct ?? 10.0,
        toleranceSpecPct: data.toleranceSpecPct ?? 5.0,
        // Calculated weight
        qtySqm,
        totalWeightKgs,
        requiredYarnKg,
      }),
    })

    return NextResponse.json({ success: true, order }, { status: 201 })
  } catch (err: unknown) {
    // Prisma unique constraint violation: duplicate (piNumber, subLineIndex)
    if (
      err !== null &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code: string }).code === 'P2002'
    ) {
      return NextResponse.json(
        {
          success: false,
          error: `PI Number "${data.piNumber}" with sub-line ${data.subLineIndex} already exists. Use a different PI Number or sub-line index.`,
        },
        { status: 409 },
      )
    }

    console.error('[POST /api/orders] Unexpected error:', err)
    return NextResponse.json(
      { success: false, error: 'An unexpected server error occurred. Please try again.' },
      { status: 500 },
    )
  }
}
