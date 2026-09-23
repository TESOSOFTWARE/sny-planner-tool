// src/app/api/orders/bulk/route.ts
// POST /api/orders/bulk
// Bulk-paste uses the same server-side validation/classification policy as
// Excel import. Existing orders are preserved and never hidden by skipDuplicates.

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import type { OrderImportDecision, OrderImportSummary, ParsedOrder } from '@/types'
import { prisma } from '@/lib/db'
import { classifyOrderImport } from '@/lib/excel/parseOrderList'
import { calculateOrderWeight } from '@/lib/calculations/orderWeight'
import { MAX_IMPORTED_ORDER_ROWS } from '@/lib/validations/order'

const bulkEnvelopeSchema = z.object({
  rows: z.array(z.unknown()).min(1).max(MAX_IMPORTED_ORDER_ROWS),
})

function asParsedOrder(value: unknown): ParsedOrder {
  return (value && typeof value === 'object' ? value : {}) as ParsedOrder
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

function summarize(decisions: OrderImportDecision[]): OrderImportSummary {
  return decisions.reduce<OrderImportSummary>((summary, decision) => {
    summary.total += 1
    if (decision.status === 'new') summary.created += 1
    if (decision.status === 'identical') summary.identical += 1
    if (decision.status === 'conflict') summary.conflicted += 1
    if (decision.status === 'invalid') summary.invalid += 1
    return summary
  }, { total: 0, created: 0, identical: 0, conflicted: 0, invalid: 0 })
}

function errorsFor(decisions: OrderImportDecision[]): string[] {
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
  const envelope = bulkEnvelopeSchema.safeParse(body)
  if (!envelope.success) {
    const messages = envelope.error.issues.map((issue) => `${String(issue.path.join('.'))}: ${issue.message}`).join('; ')
    return NextResponse.json({ success: false, error: `Lỗi kiểm tra danh sách import — ${messages}` }, { status: 422 })
  }

  const rows = envelope.data.rows.map(asParsedOrder)
  const pis = Array.from(new Set(rows.map((row) => String(row.piNumber ?? '').trim()).filter(Boolean)))
  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '5s'")
      await tx.$executeRawUnsafe('LOCK TABLE "production_orders" IN SHARE ROW EXCLUSIVE MODE')
      await tx.$executeRawUnsafe('LOCK TABLE "Customer" IN SHARE ROW EXCLUSIVE MODE')

      const existingOrders = await tx.productionOrder.findMany({ where: { piNumber: { in: pis, mode: 'insensitive' } } })
      const decisions = classifyOrderImport(rows, existingOrders)
      const names = Array.from(new Set(rows
        .filter((_, index) => decisions[index].status !== 'invalid')
        .map((row) => String(row.customer ?? '').trim())
        .filter(Boolean)))
      const customers = names.length > 0
        ? await tx.customer.findMany({ where: { name: { in: names, mode: 'insensitive' } }, select: { id: true, name: true } })
        : []
      const customerIds = new Map<string, string>()
      const ambiguous = new Set<string>()
      for (const customer of customers) {
        const key = normalizedName(customer.name)
        if (customerIds.has(key)) ambiguous.add(key)
        else customerIds.set(key, customer.id)
      }
      rows.forEach((row, index) => {
        const key = normalizedName(String(row.customer ?? ''))
        if (ambiguous.has(key) && decisions[index].status !== 'invalid') {
          decisions[index].status = 'conflict'
          decisions[index].reasons.push('Có nhiều khách hàng trùng tên sau khi chuẩn hóa; không tự chọn bản ghi')
        }
      })
      const accepted = decisions.map((decision, index) => decision.status === 'new' ? index : -1).filter((index) => index >= 0)
      for (const index of accepted) {
        const key = normalizedName(String(rows[index].customer ?? ''))
        if (!customerIds.has(key)) {
          const customer = await tx.customer.create({ data: { name: String(rows[index].customer).trim() } })
          customerIds.set(key, customer.id)
        }
      }
      const data = accepted.map((index) => buildCreateData(rows[index], customerIds.get(normalizedName(String(rows[index].customer ?? ''))) ?? null))
      if (data.length > 0) await tx.productionOrder.createMany({ data })
      const summary = summarize(decisions)
      return {
        imported: summary.created,
        skipped: summary.identical + summary.conflicted + summary.invalid,
        errors: errorsFor(decisions),
        summary,
        decisions,
      }
    }, { timeout: 30_000, maxWait: 5_000 })
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && ['P2028', 'P2034'].includes(String((error as { code?: unknown }).code))) {
      return NextResponse.json({ success: false, code: 'STALE_PREVIEW', error: 'Dữ liệu đã thay đổi trong lúc import. Vui lòng xem trước lại.' }, { status: 409 })
    }
    console.error('[POST /api/orders/bulk] DB error:', error)
    return NextResponse.json({ success: false, error: 'Có lỗi CSDL xảy ra khi lưu đơn hàng. Vui lòng thử lại.' }, { status: 500 })
  }
}
