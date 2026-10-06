// src/app/api/orders/multi-line/route.ts
// POST /api/orders/multi-line
// Creates all sub-lines atomically after applying the same draft/approved
// final-state validation used by single-order edits and approval.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import {
  approvedOrderStateSchema,
  draftMultiLineOrderSchema,
  draftOrderStateSchema,
  multiLineOrderSchema,
  resolveLifecycle,
  cleanSubLineForValidation,
  clearHemmedFields,
} from '@/lib/validations/order'
import { calculateOrderWeight } from '@/lib/calculations/orderWeight'
import { buildRecipeSnapshot, matchRecipe } from '@/lib/orders/recipeSnapshot'
import type { ParsedOrder } from '@/types'

function numberOrNull(value: unknown): number | null {
  if (value == null) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON in request body.' }, { status: 400 })
  }

  // P0: Canonical lifecycle resolution & conflict detection
  const rawLifecycle = body && typeof body === 'object' && 'lifecycleStatus' in body
    ? String((body as { lifecycleStatus?: unknown }).lifecycleStatus)
    : undefined
  const hasRawIsDraft = body && typeof body === 'object' && 'isDraft' in body
  const rawIsDraft = hasRawIsDraft ? Boolean((body as { isDraft?: unknown }).isDraft) : undefined

  // Reject conflicting payload if both fields are provided with contradictory semantics
  if (rawLifecycle && hasRawIsDraft) {
    if (rawLifecycle === 'APPROVED' && rawIsDraft === true) {
      return NextResponse.json(
        { success: false, error: 'LIFECYCLE_CONFLICT: Đơn hàng không thể đồng thời là APPROVED và isDraft=true.' },
        { status: 422 }
      )
    }
    if (rawLifecycle === 'PLACEHOLDER' && rawIsDraft === true) {
      return NextResponse.json(
        { success: false, error: 'LIFECYCLE_CONFLICT: Đơn giữ chỗ (RESERVED) không thể là isDraft=true.' },
        { status: 422 }
      )
    }
    if (rawLifecycle === 'DRAFT' && rawIsDraft === false) {
      return NextResponse.json(
        { success: false, error: 'LIFECYCLE_CONFLICT: Đơn nháp (DRAFT) không thể là isDraft=false.' },
        { status: 422 }
      )
    }
  }

  // Resolve canonical lifecycle state
  const lifecycle = resolveLifecycle({
    lifecycleStatus: rawLifecycle,
    isPlaceholder: Boolean(body && typeof body === 'object' && (body as { isPlaceholder?: unknown }).isPlaceholder),
    isDraft: rawIsDraft,
  })

  // Select schema strictly based on canonical lifecycle
  const schema = lifecycle.lifecycleStatus === 'DRAFT' ? draftMultiLineOrderSchema : multiLineOrderSchema
  const sanitizedBody = body && typeof body === 'object' && Array.isArray((body as Record<string, unknown>).lines)
    ? {
        ...(body as Record<string, unknown>),
        lines: ((body as { lines: unknown[] }).lines).map(cleanSubLineForValidation),
      }
    : body
  const parsed = schema.safeParse(sanitizedBody)
  if (!parsed.success) {
    const messages = parsed.error.issues.map((issue) => `${String(issue.path.join('.'))}: ${issue.message}`).join('; ')
    return NextResponse.json({ success: false, error: `Validation failed — ${messages}` }, { status: 422 })
  }

  const { piNumber, customer, customerId, orderDate, deliveryDate, containerSize, description, remark, lines } = parsed.data
  const effectiveOrderDate = orderDate && /^\d{4}-\d{2}-\d{2}$/.test(orderDate)
    ? orderDate
    : new Date().toISOString().slice(0, 10)

  try {
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.productionOrder.findMany({
        where: { piNumber },
        select: { subLineIndex: true },
        orderBy: { subLineIndex: 'asc' },
      })
      const nextIndex = existing.length > 0
        ? Math.max(...existing.map((item) => item.subLineIndex)) + 1
        : 0

      const validatedLines: Array<{ line: typeof lines[number]; subLineIndex: number; state: ParsedOrder }> = []
      const validationErrors: string[] = []
      lines.forEach((line, index) => {
        // H2 (01/10): HEMMED không lưu field dư — clear trước validate để
        // result.data và create bên dưới kế thừa.
        const state: ParsedOrder = clearHemmedFields({
          piNumber,
          subLineIndex: nextIndex + index,
          customer,
          orderDate: effectiveOrderDate,
          widthM: (line.widthM ?? null) as number,
          lengthM: line.lengthM ?? null,
          gsm: (line.gsm ?? null) as number,
          color: (line.color ?? null) as string,
          productionGsm: line.productionGsm ?? null,
          orderType: line.orderType ?? 'meters',
          qty: line.qty ?? null,
          rollLength: numberOrNull(line.rollLength),
          pieceLength: numberOrNull(line.pieceLength),
          uvPct: numberOrNull(line.uvPct),
          frFlag: line.frFlag ?? false,
          frPct: numberOrNull(line.frPct),
          description: description ?? null,
          remark: remark ?? null,
          mbCode: line.mbCode ?? null,
          itemCode: line.itemCode ?? null,
          meshType: line.meshType ?? null,
          needleCount: line.needleCount ?? null,
          beamCount: line.beamCount ?? null,
          lineNote: line.lineNote ?? null,
          requiresPacking: line.requiresPacking ?? false,
          deliveryDate: deliveryDate ?? null,
          containerSize: containerSize ?? null,
          hasEyelet: line.hasEyelet ?? false,
          eyeletColor: line.eyeletColor ?? null,
          eyeletLines: line.eyeletLines ?? null,
          eyeletSpec: line.eyeletSpec ?? null,
          // V4.1 passthrough — lineSchema/draftLineSchema already validate these.
          colorVersion: (line as any).colorVersion ?? null,
          primaryPackingType: (line as any).primaryPackingType ?? 'ROLL',
          subPackingType: (line as any).subPackingType ?? null,
          hasPaperCore: (line as any).hasPaperCore ?? false,
          isHalfFolded: (line as any).isHalfFolded ?? false,
          outerWrapping: (line as any).outerWrapping ?? 'POLYBAG',
          piecesPerCarton: (line as any).piecesPerCarton ?? null,
          piecesPerBale: (line as any).piecesPerBale ?? null,
          boxDimensions: (line as any).boxDimensions ?? null,
          onPallet: (line as any).onPallet ?? false,
          secondaryPackingType: (line as any).secondaryPackingType ?? 'NONE',
          palletDimensions: (line as any).palletDimensions ?? null,
          itemsPerPallet: (line as any).itemsPerPallet ?? null,
          packingNote: (line as any).packingNote ?? null,
          isLaminated: (line as any).isLaminated ?? false,
          rawFabricGsm: (line as any).rawFabricGsm ?? null,
          coatingGsm: (line as any).coatingGsm ?? null,
          finishedGsm: (line as any).finishedGsm ?? null,
          toleranceQtyPct: (line as any).toleranceQtyPct ?? 10.0,
          toleranceSpecPct: (line as any).toleranceSpecPct ?? 5.0,
        })
        const result = (lifecycle.lifecycleStatus === 'DRAFT' ? draftOrderStateSchema : approvedOrderStateSchema).safeParse(state)
        if (!result.success) {
          result.error.issues.forEach((issue) => validationErrors.push(`Dòng ${index + 1}: ${String(issue.path.join('.'))}: ${issue.message}`))
        } else {
          validatedLines.push({ line, subLineIndex: nextIndex + index, state: result.data as ParsedOrder })
        }
      })
      if (validationErrors.length > 0) return { invalid: validationErrors }

      const created = []
      for (const item of validatedLines) {
        const { line, state } = item
        const calculation = calculateOrderWeight({
          orderType: state.orderType ?? 'meters',
          widthM: state.widthM ?? null,
          lengthM: state.lengthM ?? null,
          gsm: state.gsm ?? null,
          productionGsm: state.productionGsm ?? null,
          qty: state.qty ?? null,
          rollLength: state.rollLength ?? null,
          pieceLength: state.pieceLength ?? null,
          isLaminated: Boolean((state as any).isLaminated),
          rawFabricGsm: (state as any).rawFabricGsm ?? null,
          coatingGsm: (state as any).coatingGsm ?? null,
          finishedGsm: (state as any).finishedGsm ?? null,
        })
        created.push(await tx.productionOrder.create({
          data: {
            piNumber,
            subLineIndex: item.subLineIndex,
            customer,
            customerId: customerId ?? null,
            orderDate: new Date(`${effectiveOrderDate}T00:00:00.000Z`),
            widthM: state.widthM ?? null,
            lengthM: calculation.totalMeters,
            gsm: state.gsm ?? null,
            productionGsm: state.productionGsm ?? null,
            color: state.color ?? null,
            mbCode: state.mbCode ?? null,
            isDraft: lifecycle.lifecycleStatus === 'DRAFT',
            lifecycleStatus: lifecycle.lifecycleStatus,
            isPlaceholder: lifecycle.isPlaceholder,
            qty: state.qty ?? null,
            uvPct: state.uvPct ?? null,
            frFlag: state.frFlag ?? false,
            frPct: state.frPct ?? null,
            description: state.description ?? null,
            remark: state.remark ?? null,
            lineNote: state.lineNote ?? null,
            requiresPacking: state.requiresPacking ?? false,
            deliveryDate: state.deliveryDate ? new Date(`${state.deliveryDate}T00:00:00.000Z`) : null,
            containerSize: state.containerSize ?? null,
            meshType: state.meshType ?? null,
            needleCount: state.needleCount ?? null,
            beamCount: state.beamCount ?? null,
            orderType: state.orderType ?? 'meters',
            rollLength: state.rollLength ?? null,
            pieceLength: state.pieceLength ?? null,
            hasEyelet: state.hasEyelet ?? false,
            eyeletColor: state.eyeletColor ?? null,
            eyeletLines: state.eyeletLines ?? null,
            eyeletSpec: state.eyeletSpec ?? null,
            colorVersion: (state as any).colorVersion ?? null,
            primaryPackingType: (state as any).primaryPackingType ?? 'ROLL',
            subPackingType: (state as any).subPackingType ?? null,
            hasPaperCore: (state as any).hasPaperCore ?? false,
            isHalfFolded: Boolean((state as any).isHalfFolded),
            outerWrapping: (state as any).outerWrapping ?? 'POLYBAG',
            piecesPerCarton: (state as any).piecesPerCarton ?? null,
            piecesPerBale: (state as any).piecesPerBale ?? null,
            boxDimensions: (state as any).boxDimensions ?? null,
            onPallet: Boolean((state as any).onPallet),
            secondaryPackingType: (state as any).secondaryPackingType ?? 'NONE',
            palletDimensions: (state as any).palletDimensions ?? null,
            itemsPerPallet: (state as any).itemsPerPallet ?? null,
            packingNote: (state as any).packingNote ?? null,
            isLaminated: Boolean((state as any).isLaminated),
            rawFabricGsm: (state as any).rawFabricGsm ?? null,
            coatingGsm: (state as any).coatingGsm ?? null,
            finishedGsm: (state as any).finishedGsm ?? null,
            toleranceQtyPct: (state as any).toleranceQtyPct ?? 10.0,
            toleranceSpecPct: (state as any).toleranceSpecPct ?? 5.0,
            qtySqm: calculation.qtySqm,
            totalWeightKgs: calculation.totalWeightKgs,
            requiredYarnKg: calculation.requiredYarnKg,
            dataSource: 'manual',
          },
        }))
        void line
      }

      // P0-1: Build colorRecipeSnapshot for APPROVED orders (same as approve route)
      if (lifecycle.lifecycleStatus === 'APPROVED') {
        const piColors = Array.from(new Set(validatedLines.map((item) => (item.state.color ?? '').trim()).filter(Boolean)))
        const recipes = piColors.length > 0
          ? await tx.productColorRecipe.findMany({ where: { colorName: { in: piColors, mode: 'insensitive' } } })
          : []
        const nowIso = new Date().toISOString()
        for (let i = 0; i < validatedLines.length; i++) {
          const item = validatedLines[i]
          const recipe = matchRecipe(item.state.color, (item.state as any).colorVersion, recipes)
          if (recipe) {
            await tx.productionOrder.update({
              where: { id: created[i].id },
              data: { colorRecipeSnapshot: buildRecipeSnapshot(recipe, nowIso) },
            })
          }
        }
      }

      return { created }
    }, { timeout: 30_000, maxWait: 5_000 })

    if (result.invalid) return NextResponse.json({ success: false, error: `Validation failed — ${result.invalid.join('; ')}` }, { status: 422 })
    return NextResponse.json({ success: true, orders: result.created, count: result.created.length }, { status: 201 })
  } catch (err: unknown) {
    if (err !== null && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'P2002') {
      return NextResponse.json({ success: false, error: 'Duplicate sub-line index detected. Please retry.' }, { status: 409 })
    }
    console.error('[POST /api/orders/multi-line] Error:', err)
    return NextResponse.json({ success: false, error: 'An unexpected server error occurred.' }, { status: 500 })
  }
}
