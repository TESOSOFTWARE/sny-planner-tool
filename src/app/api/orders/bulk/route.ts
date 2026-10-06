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
import { chunkedCreateManyOrders, mapParsedRowToCreateInput } from '@/lib/orders/importPersist'
import { resolveCustomerNames } from '@/lib/customers/matching'
import { MAX_IMPORTED_ORDER_ROWS } from '@/lib/validations/order'

const customerOverrideSchema = z.object({
  rowName: z.string().min(1).max(100),
  // `MERGE:<customerId>` reuses an existing customer; 'NEW' forces creation.
  decision: z.string().regex(/^(MERGE:.+|NEW)$/, 'Override khách hàng không hợp lệ'),
})

const bulkEnvelopeSchema = z.object({
  rows: z.array(z.unknown()).min(1).max(MAX_IMPORTED_ORDER_ROWS),
  customerOverrides: z.array(customerOverrideSchema).max(500).optional().default([]),
  // P0-12: dryRun kiểm tra trước khi ghi — trả decisions + customer
  // reviews mà không insert, để UI hiện radio chọn rồi mới ghi thật.
  dryRun: z.boolean().optional().default(false),
})

function asParsedOrder(value: unknown): ParsedOrder {
  return (value && typeof value === 'object' ? value : {}) as ParsedOrder
}

function buildCreateData(row: ParsedOrder, customerId: string | null): Prisma.ProductionOrderCreateManyInput {
  return mapParsedRowToCreateInput(row, customerId)
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
  // P0-12: block customer-ambiguous rows in decisions — shared with write path.
  function blockAmbiguousRows(decisions: OrderImportDecision[], ambiguous: Map<string, string>) {
    rows.forEach((row, index) => {
      const key = String(row.customer ?? '').trim()
      if (ambiguous.has(key) && decisions[index].status !== 'invalid') {
        decisions[index].status = 'conflict'
        decisions[index].reasons.push(ambiguous.get(key)!)
      }
    })
  }
  if (envelope.data.dryRun) {
    // Read-only check: no transaction, no write. UI shows radios first.
    const existingOrders = await prisma.productionOrder.findMany({ where: { piNumber: { in: pis, mode: 'insensitive' } } })
    const decisions = classifyOrderImport(rows, existingOrders)
    const names = Array.from(new Set(rows
      .filter((_, index) => decisions[index].status !== 'invalid')
      .map((row) => String(row.customer ?? '').trim())
      .filter(Boolean)))
    const customers = names.length > 0
      ? await prisma.customer.findMany({ select: { id: true, name: true } })
      : []
    const resolution = resolveCustomerNames(names, customers, envelope.data.customerOverrides)
    blockAmbiguousRows(decisions, resolution.ambiguous)
    return NextResponse.json({
      success: true,
      dryRun: true,
      decisions,
      summary: summarize(decisions),
      customerReviews: resolution.reviews,
      customerAmbiguous: resolution.blockedAmbiguous,
    })
  }
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
        ? await tx.customer.findMany({ select: { id: true, name: true } })
        : []
      // P0-12: same rule as Excel import confirm via shared helper — planner
      // overrides win, NEEDS_REVIEW without decision conflicts,
      // AMBIGUOUS never auto-picks.
      const resolution = resolveCustomerNames(names, customers, envelope.data.customerOverrides)
      const customerIds = resolution.resolved
      const ambiguousCustomerReasons = resolution.ambiguous
      blockAmbiguousRows(decisions, ambiguousCustomerReasons)
      const accepted = decisions.map((decision, index) => decision.status === 'new' ? index : -1).filter((index) => index >= 0)
      for (const index of accepted) {
        const key = String(rows[index].customer ?? '').trim()
        if (!customerIds.has(key)) {
          const customer = await tx.customer.create({ data: { name: String(rows[index].customer).trim() } })
          customerIds.set(key, customer.id)
        }
      }
      const data = accepted.map((index) => buildCreateData(rows[index], customerIds.get(String(rows[index].customer ?? '').trim()) ?? null))
      // P0-13: chunked insert — same param-limit reason as import/confirm.
      if (data.length > 0) await chunkedCreateManyOrders(tx, data)
      const summary = summarize(decisions)
      return {
        imported: summary.created,
        skipped: summary.identical + summary.conflicted + summary.invalid,
        errors: errorsFor(decisions),
        summary,
        decisions,
        customerReviews: resolution.reviews,
        customerAmbiguous: resolution.blockedAmbiguous,
      }
    }, { timeout: 60_000, maxWait: 5_000 }) // P0-13: up to 10 chunks + classify on cold Neon
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && ['P2028', 'P2034'].includes(String((error as { code?: unknown }).code))) {
      return NextResponse.json({ success: false, code: 'STALE_PREVIEW', error: 'Dữ liệu đã thay đổi trong lúc import. Vui lòng xem trước lại.' }, { status: 409 })
    }
    console.error('[POST /api/orders/bulk] DB error:', error)
    return NextResponse.json({ success: false, error: 'Có lỗi CSDL xảy ra khi lưu đơn hàng. Vui lòng thử lại.' }, { status: 500 })
  }
}
