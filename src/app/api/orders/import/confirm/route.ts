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
import { chunkedCreateManyOrders, mapParsedRowToCreateInput } from '@/lib/orders/importPersist'
import { findCustomerMatch } from '@/lib/customers/matching'
import { buildRecipeSnapshot, matchRecipe, normalizeColorName } from '@/lib/orders/recipeSnapshot'
import { MAX_IMPORTED_ORDER_ROWS } from '@/lib/validations/order'

const customerOverrideSchema = z.object({
  rowName: z.string().min(1).max(100),
  // `MERGE:<customerId>` reuses an existing customer; 'NEW' forces creation.
  decision: z.string().regex(/^(MERGE:.+|NEW)$/, 'Override khách hàng không hợp lệ'),
})

const importEnvelopeSchema = z.object({
  rows: z.array(z.unknown()).min(1).max(MAX_IMPORTED_ORDER_ROWS),
  customerOverrides: z.array(customerOverrideSchema).max(500).optional().default([]),
})

function asParsedOrder(value: unknown): ParsedOrder {
  return (value && typeof value === 'object' ? value : {}) as ParsedOrder
}

function isRetryableTransactionError(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('code' in error)) return false
  const code = String((error as { code?: unknown }).code)
  return code === 'P2034' || code === 'P2028'
}

function buildCreateData(row: ParsedOrder, customerId: string | null): Prisma.ProductionOrderCreateManyInput {
  return mapParsedRowToCreateInput(row, customerId)
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
      const allCustomers = await tx.customer.findMany({ select: { id: true, name: true } })
      const customerIdSet = new Set(allCustomers.map((c) => c.id))
      const resolvedCustomerByName = new Map<string, string>()
      const ambiguousCustomerReasons = new Map<string, string>()
      // Planner overrides from preview: rowName (trimmed Excel text) -> MERGE:<id> | NEW.
      const overrideByName = new Map<string, string>()
      for (const o of envelope.data.customerOverrides) {
        overrideByName.set(o.rowName.trim(), o.decision)
      }

      for (const name of customerNames) {
        const override = overrideByName.get(name)
        if (override && override !== 'NEW') {
          const mergeId = override.slice('MERGE:'.length)
          if (customerIdSet.has(mergeId)) {
            resolvedCustomerByName.set(name, mergeId)
          } else {
            ambiguousCustomerReasons.set(
              name,
              `Lựa chọn gộp khách hàng "${name}" trỏ tới bản ghi không tồn tại — vui lòng xem trước lại.`,
            )
          }
          continue
        }
        const match = findCustomerMatch(name, allCustomers)
        if (match.status === 'MATCHED' && match.customer) {
          resolvedCustomerByName.set(name, match.customer.id)
        } else if (match.status === 'AMBIGUOUS') {
          ambiguousCustomerReasons.set(
            name,
            match.reason || 'Có nhiều khách hàng trùng tên sau khi chuẩn hóa; không tự chọn bản ghi',
          )
        } else if (match.status === 'NEEDS_REVIEW' && override !== 'NEW') {
          // Suffix-stripped candidates are never auto-merged nor auto-created:
          // without an explicit planner decision the row becomes a conflict.
          ambiguousCustomerReasons.set(
            name,
            match.reason || `Tên "${name}" cần planner xác nhận gộp hay tạo mới`,
          )
        }
      }

      rows.forEach((row, index) => {
        const name = String(row.customer ?? '').trim()
        if (ambiguousCustomerReasons.has(name) && decisions[index].status !== 'invalid') {
          decisions[index].status = 'conflict'
          decisions[index].reasons.push(ambiguousCustomerReasons.get(name)!)
        }
      })

      const acceptedIndexes = decisions
        .map((decision, index) => decision.status === 'new' ? index : -1)
        .filter((index) => index >= 0)
      for (const index of acceptedIndexes) {
        const row = rows[index]
        const name = String(row.customer ?? '').trim()
        if (!resolvedCustomerByName.has(name) && name) {
          const created = await tx.customer.create({ data: { name } })
          resolvedCustomerByName.set(name, created.id)
          allCustomers.push(created)
        }
      }

      const createData = acceptedIndexes.map((index) => {
        const row = rows[index]
        const name = String(row.customer ?? '').trim()
        const customerId = resolvedCustomerByName.get(name) ?? null
        return buildCreateData(row, customerId)
      })
      // P0-13: chunked insert — one createMany = one multi-row INSERT capped
      // by the Postgres 65,535 bind-param limit (~1,191 rows at ~55 cols).
      if (createData.length > 0) await chunkedCreateManyOrders(tx, createData)

      // P0-2: Build colorRecipeSnapshot for imported orders (same as approve route)
      if (createData.length > 0) {
        const createdKeys = createData.map((d) => ({ piNumber: d.piNumber, subLineIndex: d.subLineIndex }))
        const importedOrders = await tx.productionOrder.findMany({
          where: {
            OR: createdKeys.map((k) => ({ piNumber: k.piNumber, subLineIndex: k.subLineIndex })),
          },
          select: { id: true, piNumber: true, subLineIndex: true, color: true, colorVersion: true },
        })
        const piColors = Array.from(new Set(importedOrders.map((o) => normalizeColorName(o.color)).filter(Boolean)))
        const recipes = piColors.length > 0
          ? await tx.productColorRecipe.findMany({ where: { colorName: { in: piColors, mode: 'insensitive' } } })
          : []
        const nowIso = new Date().toISOString()
        for (const order of importedOrders) {
          const recipe = matchRecipe(order.color, order.colorVersion, recipes)
          if (recipe) {
            await tx.productionOrder.update({
              where: { id: order.id },
              data: { colorRecipeSnapshot: buildRecipeSnapshot(recipe, nowIso) },
            })
          }
        }
      }

      const summary = summaryFor(decisions)
      return {
        imported: summary.created,
        skipped: summary.identical + summary.conflicted + summary.invalid,
        errors: decisionErrors(decisions),
        summary,
        decisions,
      }
    }, { timeout: 60_000, maxWait: 5_000 }) // P0-13: up to 10 chunks + classify on cold Neon

    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    if (isRetryableTransactionError(error)) {
      return NextResponse.json({ success: false, code: 'STALE_PREVIEW', error: 'Dữ liệu đã thay đổi trong lúc import. Vui lòng xem trước lại.' }, { status: 409 })
    }
    console.error('[POST /api/orders/import/confirm] DB error:', error)
    return NextResponse.json({ success: false, error: 'Có lỗi CSDL xảy ra khi lưu đơn hàng. Vui lòng thử lại.' }, { status: 500 })
  }
}
