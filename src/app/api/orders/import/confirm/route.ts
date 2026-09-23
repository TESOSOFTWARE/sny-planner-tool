// src/app/api/orders/import/confirm/route.ts
// POST /api/orders/import/confirm
// Classifies the complete parsed list again inside a transaction and writes
// only genuinely new rows. Existing rows are never overwritten by import.

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import type { OrderImportDecision, OrderImportSummary, ParsedOrder } from '@/types'
import { prisma } from '@/lib/db'
import { classifyOrderImport } from '@/lib/excel/parseOrderList'
import { calculateOrderWeight } from '@/lib/calculations/orderWeight'
import { MAX_IMPORTED_ORDER_ROWS } from '@/lib/validations/order'

const importEnvelopeSchema = z.object({
  rows: z.array(z.unknown()).min(1).max(MAX_IMPORTED_ORDER_ROWS),
})

function asParsedOrder(value: unknown): ParsedOrder {
  return (value && typeof value === 'object' ? value : {}) as ParsedOrder
}

function isRetryableTransactionError(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('code' in error)) return false
  const code = String((error as { code?: unknown }).code)
  return code === 'P2034' || code === 'P2028'
}

function normalizedName(value: string): string {
  return value.trim().toUpperCase()
}

function buildCreateData(row: ParsedOrder, customerId: string | null): Prisma.ProductionOrderCreateManyInput {
  const orderType = row.orderType ?? 'meters'
  const calculation = calculateOrderWeight({
    orderType,
    widthM: row.widthM,
    lengthM: row.lengthM,
    gsm: row.gsm,
    productionGsm: row.productionGsm ?? null,
    qty: row.qty ?? null,
    rollLength: row.rollLength ?? null,
    pieceLength: row.pieceLength ?? null,
  })

  return {
    piNumber: row.piNumber.trim(),
    subLineIndex: row.subLineIndex,
    customer: row.customer.trim(),
    customerId,
    orderDate: new Date(`${row.orderDate}T00:00:00.000Z`),
    widthM: row.widthM,
    lengthM: calculation.totalMeters,
    gsm: row.gsm,
    productionGsm: row.productionGsm ?? null,
    color: row.color,
    mbCode: row.mbCode ?? null,
    isDraft: false,
    qty: row.qty ?? null,
    uvPct: row.uvPct ?? null,
    frFlag: row.frFlag ?? false,
    frPct: row.frPct ?? null,
    description: row.description ?? null,
    remark: row.remark ?? null,
    lineNote: row.lineNote ?? null,
    requiresPacking: row.requiresPacking ?? false,
    deliveryDate: row.deliveryDate ? new Date(`${row.deliveryDate}T00:00:00.000Z`) : null,
    containerSize: row.containerSize ?? null,
    meshType: row.meshType ?? null,
    needleCount: row.needleCount ?? null,
    beamCount: row.beamCount ?? null,
    orderType,
    rollLength: row.rollLength ?? null,
    pieceLength: row.pieceLength ?? null,
    hasEyelet: row.hasEyelet ?? false,
    eyeletColor: row.eyeletColor ?? null,
    eyeletLines: row.eyeletLines ?? null,
    eyeletSpec: row.eyeletSpec ?? null,
    qtySqm: calculation.qtySqm,
    totalWeightKgs: calculation.totalWeightKgs,
    requiredYarnKg: calculation.requiredYarnKg,
    dataSource: 'import',
  }
}

function summaryFor(decisions: OrderImportDecision[]): OrderImportSummary {
  return decisions.reduce<OrderImportSummary>((summary, decision) => {
    summary.total += 1
    if (decision.status === 'new') summary.created += 1
    if (decision.status === 'identical') summary.identical += 1
    if (decision.status === 'conflict') summary.conflicted += 1
    if (decision.status === 'invalid') summary.invalid += 1
    return summary
  }, { total: 0, created: 0, identical: 0, conflicted: 0, invalid: 0 })
}

function decisionErrors(decisions: OrderImportDecision[]): string[] {
  return Array.from(new Set(
    decisions
      .filter((decision) => decision.status !== 'new')
      .flatMap((decision) => decision.reasons.map((reason) => `Dòng ${decision.rowIndex + 1}: ${reason}`)),
  ))
}

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Request body chứa dữ liệu JSON không hợp lệ.' }, { status: 400 })
  }

  const envelope = importEnvelopeSchema.safeParse(body)
  if (!envelope.success) {
    const messages = envelope.error.issues.map((issue) => `${String(issue.path.join('.'))}: ${issue.message}`).join('; ')
    return NextResponse.json({ success: false, error: `Lỗi kiểm tra danh sách import — ${messages}` }, { status: 422 })
  }

  const rows = envelope.data.rows.map(asParsedOrder)
  const inputPis = Array.from(new Set(
    rows
      .map((row) => String(row.piNumber ?? '').trim())
      .filter((pi) => pi && pi !== 'CHƯA_CÓ_PI'),
  ))

  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '5s'")
      // These locks serialize this importer with other order/customer writes
      // during classification. The table names are static by design.
      await tx.$executeRawUnsafe('LOCK TABLE "production_orders" IN SHARE ROW EXCLUSIVE MODE')
      await tx.$executeRawUnsafe('LOCK TABLE "Customer" IN SHARE ROW EXCLUSIVE MODE')

      const existingOrders = inputPis.length > 0
        ? await tx.productionOrder.findMany({ where: { piNumber: { in: inputPis, mode: 'insensitive' } } })
        : []
      const decisions = classifyOrderImport(rows, existingOrders)

      const customerNames = Array.from(new Set(
        rows
          .filter((_, index) => decisions[index].status !== 'invalid')
          .map((row) => String(row.customer ?? '').trim())
          .filter(Boolean),
      ))
      const customers = customerNames.length > 0
        ? await tx.customer.findMany({ where: { name: { in: customerNames, mode: 'insensitive' } }, select: { id: true, name: true } })
        : []
      const customerByName = new Map<string, string>()
      const ambiguousNames = new Set<string>()
      for (const customer of customers) {
        const key = normalizedName(customer.name)
        if (customerByName.has(key)) ambiguousNames.add(key)
        else customerByName.set(key, customer.id)
      }
      rows.forEach((row, index) => {
        const key = normalizedName(String(row.customer ?? ''))
        if (ambiguousNames.has(key) && decisions[index].status !== 'invalid') {
          decisions[index].status = 'conflict'
          decisions[index].reasons.push('Có nhiều khách hàng trùng tên sau khi chuẩn hóa; không tự chọn bản ghi')
        }
      })

      const acceptedIndexes = decisions
        .map((decision, index) => decision.status === 'new' ? index : -1)
        .filter((index) => index >= 0)
      for (const index of acceptedIndexes) {
        const row = rows[index]
        const key = normalizedName(String(row.customer ?? ''))
        if (!customerByName.has(key)) {
          const customer = await tx.customer.create({ data: { name: String(row.customer).trim() } })
          customerByName.set(key, customer.id)
        }
      }

      const createData = acceptedIndexes.map((index) => {
        const row = rows[index]
        const customerId = customerByName.get(normalizedName(String(row.customer ?? ''))) ?? null
        return buildCreateData(row, customerId)
      })
      if (createData.length > 0) await tx.productionOrder.createMany({ data: createData })

      const summary = summaryFor(decisions)
      return {
        imported: summary.created,
        skipped: summary.identical + summary.conflicted + summary.invalid,
        errors: decisionErrors(decisions),
        summary,
        decisions,
      }
    }, { timeout: 30_000, maxWait: 5_000 })

    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    if (isRetryableTransactionError(error)) {
      return NextResponse.json({ success: false, code: 'STALE_PREVIEW', error: 'Dữ liệu đã thay đổi trong lúc import. Vui lòng xem trước lại.' }, { status: 409 })
    }
    console.error('[POST /api/orders/import/confirm] DB error:', error)
    return NextResponse.json({ success: false, error: 'Có lỗi CSDL xảy ra khi lưu đơn hàng. Vui lòng thử lại.' }, { status: 500 })
  }
}
