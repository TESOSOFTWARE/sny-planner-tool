// src/app/api/orders/multi-line/route.ts
// POST /api/orders/multi-line
// Creates multiple sub-lines under the same PI Number in a single Prisma transaction.
// Sub-line indices are auto-assigned, continuing from the highest existing index for that PI.
//
// After per-line migration:
// - gsm, meshType, needleCount, beamCount come from each LINE (not top-level)
// - eyeletLines, eyeletSpec added per-line
// - mbCode, description, remark remain shared (top-level)

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { multiLineOrderSchema, draftMultiLineOrderSchema } from '@/lib/validations/order'
import { calculateOrderWeight } from '@/lib/calculations/orderWeight'

export async function POST(req: NextRequest) {
  // ── 1. Parse body ──────────────────────────────────────────────────────────
  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON in request body.' },
      { status: 400 },
    )
  }

  // ── 2. Zod validation (draft vs normal) ───────────────────────────────────
  const isDraft = Boolean(body?.isDraft)
  const schema = isDraft ? draftMultiLineOrderSchema : multiLineOrderSchema
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    const messages = parsed.error.issues
      .map((e) => `${String(e.path.join('.'))}: ${e.message}`)
      .join('; ')
    return NextResponse.json(
      { success: false, error: `Validation failed — ${messages}` },
      { status: 422 },
    )
  }

  // ── 3. Destructure shared fields ──────────────────────────────────────────
  // gsm / meshType / needleCount / beamCount intentionally NOT here — they are per-line
  const { piNumber, customer, customerId, orderDate, deliveryDate, containerSize, description, remark, lines } = parsed.data

  // ── 4. Derive effective lengthM for each line ──────────────────────────────
  // For "rolls" and "pieces", lengthM = calculated totalMeters so the field is
  // populated for display and downstream formulas.
  function effectiveLengthM(line: typeof lines[number]): number {
    if (line.orderType === 'rolls' && line.qty && line.rollLength) {
      return line.qty * line.rollLength
    }
    if (line.orderType === 'pieces' && line.qty && line.pieceLength) {
      return line.qty * line.pieceLength
    }
    return line.lengthM ?? 0
  }

  // ── 5. Check existing sub-lines for this PI to avoid index collision ────────
  try {
    const existing = await prisma.productionOrder.findMany({
      where: { piNumber },
      select: { subLineIndex: true },
      orderBy: { subLineIndex: 'asc' },
    })

    // Continue numbering from the next available index
    const nextIndex = existing.length > 0
      ? Math.max(...existing.map((e) => e.subLineIndex)) + 1
      : 0

    // ── 6. Build create-many payload ──────────────────────────────────────────
    const createPayload = lines.map((line, i) => {
      const lm = effectiveLengthM(line)
      const { qtySqm, totalWeightKgs, requiredYarnKg } = calculateOrderWeight({
        orderType:     line.orderType ?? 'meters',
        widthM:        line.widthM ?? null,
        lengthM:       line.lengthM ?? null,
        gsm:           line.gsm ?? null,
        productionGsm: line.productionGsm ?? null,
        qty:           line.qty ?? null,
        rollLength:    line.rollLength ?? null,
        pieceLength:   line.pieceLength ?? null,
      })

      const effectiveOrderDate = orderDate ? new Date(orderDate) : new Date()

      return {
        piNumber,
        subLineIndex: nextIndex + i,
        customer,
        isDraft,
        ...(customerId && { customerId }),
        orderDate:   effectiveOrderDate,
        ...(line.gsm           != null && { gsm:           line.gsm }),
        ...(line.productionGsm != null && { productionGsm: line.productionGsm }),
        ...(line.color   && { color:  line.color }),
        ...(line.widthM != null && { widthM: line.widthM }),
        ...(lm != null && lm > 0 && { lengthM: lm }),
        orderType:   line.orderType ?? 'meters',
        // Conditional per-type fields
        ...(line.qty        != null && { qty:        line.qty }),
        ...(line.rollLength  != null && { rollLength:  line.rollLength }),
        ...(line.pieceLength != null && { pieceLength: line.pieceLength }),
        // Per-line tech specs (migrated from shared)
        ...(line.meshType    && { meshType:    line.meshType }),
        ...(line.needleCount != null && { needleCount: line.needleCount }),
        ...(line.beamCount   != null && { beamCount:   line.beamCount }),
        // New eyelet spec fields
        ...(line.eyeletLines != null && { eyeletLines: line.eyeletLines }),
        ...(line.eyeletSpec  && { eyeletSpec:  line.eyeletSpec }),
        // Shared optional fields
        ...(deliveryDate && { deliveryDate: new Date(deliveryDate) }),
        ...(containerSize && { containerSize }),
        ...(description && { description }),
        ...(remark      && { remark }),
        // Per-line optional fields
        ...(line.uvPct  != null && { uvPct: line.uvPct }),
        frFlag:    line.frPct != null ? line.frPct > 0 : (line.frFlag ?? false),
        ...(line.frPct  != null && { frPct: line.frPct }),
        requiresPacking: line.requiresPacking ?? false,
        ...(line.lineNote && { lineNote: line.lineNote }),
        ...(line.mbCode && { mbCode: line.mbCode }),
        hasEyelet: line.hasEyelet ?? false,
        ...(line.eyeletColor && { eyeletColor: line.eyeletColor }),
        // Calculated weight (Case A formula)
        qtySqm,
        totalWeightKgs,
        requiredYarnKg,
        // dataSource: tracks provenance for AI training data quality
        dataSource: 'manual',
      }
    })

    // ── 7. Prisma transaction — all-or-nothing ─────────────────────────────────
    const created = await prisma.$transaction(
      createPayload.map((row) => prisma.productionOrder.create({ data: row }))
    )

    return NextResponse.json({ success: true, orders: created, count: created.length }, { status: 201 })
  } catch (err: unknown) {
    // P2002 = unique constraint violation — duplicate (piNumber, subLineIndex)
    if (
      err !== null &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code: string }).code === 'P2002'
    ) {
      return NextResponse.json(
        { success: false, error: 'Duplicate sub-line index detected. Please retry.' },
        { status: 409 },
      )
    }
    console.error('[POST /api/orders/multi-line] Error:', err)
    return NextResponse.json(
      { success: false, error: 'An unexpected server error occurred.' },
      { status: 500 },
    )
  }
}
