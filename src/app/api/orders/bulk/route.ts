// src/app/api/orders/bulk/route.ts
// POST /api/orders/bulk
// Accepts { rows: ParsedOrder[] } JSON body.
// Validates each row, then uses createMany + skipDuplicates to save.
// Returns { success, imported, skipped }.

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { calculateOrderWeight } from '@/lib/calculations/orderWeight'

// ── Server-side validation schema for pasted rows ─────────────────────────────
const pastedRowSchema = z.object({
  piNumber:     z.string().min(1).max(50).transform((v) => v.trim()),
  subLineIndex: z.number().int().min(0),
  customer:     z.string().min(1).max(100).transform((v) => v.trim()),
  orderDate:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  widthM:       z.number().gt(0),
  lengthM:      z.number().gt(0),
  gsm:          z.number().int().gt(0),
  color:        z.string().min(1).max(50).transform((v) => v.trim().toUpperCase()),
  qty:          z.number().int().gt(0).nullable(),
  orderType:    z.enum(['meters', 'rolls', 'pieces']).default('meters'),
  rollLength:   z.number().positive().nullable().optional(),
  pieceLength:  z.number().positive().nullable().optional(),
  productionGsm:z.number().int().gt(0).nullable().optional(),
  uvPct:        z.number().min(0).max(100).nullable(),
  frFlag:       z.boolean(),
  frPct:        z.number().min(0).max(100).nullable().optional(),
  description:  z.string().max(200).nullable().transform((v) => v?.trim() ?? null),
  remark:       z.string().max(200).nullable().transform((v) => v?.trim() ?? null),
})

const bulkBodySchema = z.object({
  rows: z.array(pastedRowSchema).min(1).max(5000), // Max 5000 rows supported in one paste session
})

export async function POST(req: NextRequest) {
  // ── 1. Parse body ─────────────────────────────────────────────────────────
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON in request body.' },
      { status: 400 },
    )
  }

  // ── 2. Validate ───────────────────────────────────────────────────────────
  const parsed = bulkBodySchema.safeParse(body)
  if (!parsed.success) {
    const messages = parsed.error.issues
      .map((e) => `${String(e.path.join('.'))}: ${e.message}`)
      .join('; ')
    return NextResponse.json(
      { success: false, error: `Validation failed — ${messages}` },
      { status: 422 },
    )
  }

  const { rows } = parsed.data

  // ── 3. Resolve customerId for all unique customer names ────────────────────
  const uniqueCustomerNames = Array.from(
    new Set(rows.map((r) => r.customer.trim()).filter(Boolean))
  )

  const existingCustomers = await prisma.customer.findMany({
    where: {
      name: { in: uniqueCustomerNames, mode: 'insensitive' },
    },
    select: { id: true, name: true },
  })

  const customerMap = new Map<string, string>() // UPPERCASE NAME -> customerId
  for (const c of existingCustomers) {
    customerMap.set(c.name.trim().toUpperCase(), c.id)
  }

  // Create new Customer record only if name truly does not exist in DB
  for (const name of uniqueCustomerNames) {
    const key = name.trim().toUpperCase()
    if (!customerMap.has(key)) {
      try {
        const created = await prisma.customer.create({
          data: { name: name.trim() },
        })
        customerMap.set(key, created.id)
      } catch (err) {
        console.warn(`[orders/bulk] Could not create Customer "${name}":`, err)
      }
    }
  }

  // ── 4. Build DB create-data array ─────────────────────────────────────────
  const createData = rows.map((row) => {
    const custName = row.customer.trim()
    const customerId = customerMap.get(custName.toUpperCase()) ?? null
    const calc = calculateOrderWeight({
      orderType: row.orderType,
      widthM: row.widthM,
      lengthM: row.lengthM,
      gsm: row.gsm,
      productionGsm: row.productionGsm ?? null,
      qty: row.qty,
      rollLength: row.rollLength ?? null,
      pieceLength: row.pieceLength ?? null,
    })

    return {
      piNumber:     row.piNumber,
      subLineIndex: row.subLineIndex,
      customer:     custName,
      ...(customerId && { customerId }),
      orderDate:    new Date(row.orderDate),
      widthM:       row.widthM,
      lengthM:      calc.totalMeters ?? row.lengthM,
      gsm:          row.gsm,
      ...(row.productionGsm != null && { productionGsm: row.productionGsm }),
      color:        row.color,
      orderType:    row.orderType,
      ...(row.qty     != null && { qty: row.qty }),
      ...(row.rollLength != null && { rollLength: row.rollLength }),
      ...(row.pieceLength != null && { pieceLength: row.pieceLength }),
      ...(row.uvPct   != null && { uvPct: row.uvPct }),
      frFlag:       row.frFlag,
      ...(row.frPct != null && { frPct: row.frPct }),
      ...(row.description != null && { description: row.description }),
      ...(row.remark      != null && { remark: row.remark }),
      ...(calc.qtySqm != null && { qtySqm: calc.qtySqm }),
      ...(calc.totalWeightKgs != null && { totalWeightKgs: calc.totalWeightKgs }),
      ...(calc.requiredYarnKg != null && { requiredYarnKg: calc.requiredYarnKg }),
      dataSource: 'import',
    }
  })

  // ── 5. Save to DB ─────────────────────────────────────────────────────────
  try {
    const result = await prisma.productionOrder.createMany({
      data: createData,
      skipDuplicates: true,
    })

    const imported = result.count
    const skipped = rows.length - imported

    return NextResponse.json({ success: true, imported, skipped })
  } catch (err) {
    console.error('[POST /api/orders/bulk] DB error:', err)
    return NextResponse.json(
      { success: false, error: 'A database error occurred while saving the orders. Please try again.' },
      { status: 500 },
    )
  }
}
