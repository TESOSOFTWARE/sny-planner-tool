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
} from '@/lib/validations/order'
import { calculateOrderWeight } from '@/lib/calculations/orderWeight'
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

  const isDraft = Boolean(body && typeof body === 'object' && 'isDraft' in body && (body as { isDraft?: unknown }).isDraft)
  const schema = isDraft ? draftMultiLineOrderSchema : multiLineOrderSchema
  const parsed = schema.safeParse(body)
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
        const state: ParsedOrder = {
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
        }
        const result = (isDraft ? draftOrderStateSchema : approvedOrderStateSchema).safeParse(state)
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
            isDraft,
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
            qtySqm: calculation.qtySqm,
            totalWeightKgs: calculation.totalWeightKgs,
            requiredYarnKg: calculation.requiredYarnKg,
            dataSource: 'manual',
          },
        }))
        void line
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
