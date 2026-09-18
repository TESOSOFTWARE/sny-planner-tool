// src/app/api/orders/import/confirm/route.ts
// POST /api/orders/import/confirm
// Accepts { rows: ParsedOrder[] } JSON body.
// Validates each row strictly against mandatory order rules before saving to DB.

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { calculateOrderWeight } from '@/lib/calculations/orderWeight'

// ── Server-side validation schema for imported rows ───────────────────────────
// Strict validation matching MultiLineOrderForm & lineSchema

const importedRowSchema = z
  .object({
    piNumber:     z.string().min(1, 'PI Number là bắt buộc').max(50).transform((v) => v.trim()),
    subLineIndex: z.number().int().min(0),
    customer:     z.string().min(1, 'Khách hàng là bắt buộc').max(100).transform((v) => v.trim()),
    orderDate:    z.string().min(1, 'Ngày đặt là bắt buộc').regex(/^\d{4}-\d{2}-\d{2}$/),
    widthM:       z.number().gt(0, 'Khổ m phải > 0').max(20),
    lengthM:      z.number().gt(0).max(100_000).nullable().optional(),
    gsm:          z.number().int().gt(0, 'GSM phải > 0').max(500),
    productionGsm: z.number().int().gt(0).max(500).nullable().optional(),
    color:        z.string().min(1, 'Màu là bắt buộc').max(50).transform((v) => v.trim().toUpperCase()),
    orderType:    z.enum(['meters', 'rolls', 'pieces']).default('meters'),
    qty:          z.number().int().gt(0).nullable().optional(),
    rollLength:   z.number().gt(0).nullable().optional(),
    pieceLength:  z.number().gt(0).nullable().optional(),
    uvPct:        z.number().min(0).max(100).nullable().optional(),
    frFlag:       z.boolean().default(false),
    frPct:        z.number().min(0).max(100).nullable().optional(),
    description:  z.string().max(200).nullable().optional().transform((v) => v?.trim() ?? null),
    remark:       z.string().max(200).nullable().optional().transform((v) => v?.trim() ?? null),
    mbCode:       z.string().max(50).nullable().optional().transform((v) => v?.trim() ?? null),
  })
  .refine(
    (data) => {
      if (data.frFlag && (data.frPct == null || data.frPct <= 0)) {
        return false
      }
      return true
    },
    {
      message: 'FR% phải > 0 khi chọn chống cháy (FR)',
      path: ['frPct'],
    }
  )
  .refine(
    (data) => {
      if (data.orderType === 'meters') {
        return data.lengthM != null && data.lengthM > 0
      }
      if (data.orderType === 'rolls') {
        return data.qty != null && data.qty > 0 && data.rollLength != null && data.rollLength > 0
      }
      if (data.orderType === 'pieces') {
        return data.qty != null && data.qty > 0 && data.pieceLength != null && data.pieceLength > 0
      }
      return true
    },
    {
      message: 'Thiếu thông số chiều dài (Tổng mét / Số cuộn & mét cuộn / Số tấm & chiều dài tấm)',
      path: ['lengthM'],
    }
  )

const confirmBodySchema = z.object({
  rows: z.array(importedRowSchema).min(1).max(5000),
})

export async function POST(req: NextRequest) {
  // ── 1. Parse body ─────────────────────────────────────────────────────────
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { success: false, error: 'Request body chứa dữ liệu JSON không hợp lệ.' },
      { status: 400 },
    )
  }

  // ── 2. Validate ───────────────────────────────────────────────────────────
  const parsed = confirmBodySchema.safeParse(body)
  if (!parsed.success) {
    const messages = parsed.error.issues
      .map((e) => `${String(e.path.join('.'))}: ${e.message}`)
      .join('; ')
    return NextResponse.json(
      { success: false, error: `Lỗi kiểm tra dữ liệu bắt buộc — ${messages}` },
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
        console.warn(`[orders/import/confirm] Could not create Customer "${name}":`, err)
      }
    }
  }

  // ── 4. Build DB create-data array with calculated weight fields ───────────
  const createData = rows.map((row) => {
    const custName = row.customer.trim()
    const customerId = customerMap.get(custName.toUpperCase()) ?? null

    const calcResult = calculateOrderWeight({
      orderType: row.orderType,
      widthM: row.widthM,
      lengthM: row.lengthM ?? 0,
      gsm: row.gsm,
      productionGsm: row.productionGsm ?? null,
      qty: row.qty ?? null,
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
      lengthM:      calcResult.totalMeters ?? row.lengthM ?? 0,
      gsm:          row.gsm,
      ...(row.productionGsm && { productionGsm: row.productionGsm }),
      color:        row.color,
      orderType:    row.orderType,
      ...(row.qty        != null && { qty: row.qty }),
      ...(row.rollLength != null && { rollLength: row.rollLength }),
      ...(row.pieceLength!= null && { pieceLength: row.pieceLength }),
      ...(row.uvPct      != null && { uvPct: row.uvPct }),
      frFlag:       row.frFlag,
      ...(row.frPct      != null && { frPct: row.frPct }),
      ...(calcResult.qtySqm != null && { qtySqm: calcResult.qtySqm }),
      ...(calcResult.totalWeightKgs != null && { totalWeightKgs: calcResult.totalWeightKgs }),
      ...(calcResult.requiredYarnKg != null && { requiredYarnKg: calcResult.requiredYarnKg }),
      ...(row.description != null && { description: row.description }),
      ...(row.remark      != null && { remark: row.remark }),
      ...(row.mbCode      != null && { mbCode: row.mbCode }),
      dataSource: 'import',
    }
  })

  // ── 5. createMany with skipDuplicates ────────────────────────────────────
  try {
    const result = await prisma.productionOrder.createMany({
      data: createData,
      skipDuplicates: true,
    })

    const imported = result.count
    const skipped = rows.length - imported

    return NextResponse.json({ success: true, imported, skipped, errors: [] })
  } catch (err) {
    console.error('[POST /api/orders/import/confirm] DB error:', err)
    return NextResponse.json(
      { success: false, error: 'Có lỗi CSDL xảy ra khi lưu đơn hàng. Vui lòng thử lại.' },
      { status: 500 },
    )
  }
}
