// src/app/api/materials/route.ts
// GET /api/materials  — return all materials ordered by name
// POST /api/materials — create a new material

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { z } from 'zod'

// ── Zod schema for POST body ──────────────────────────────────────────────────

const createMaterialSchema = z.object({
  name: z
    .string()
    .min(1, 'Tên nguyên liệu là bắt buộc')
    .max(100, 'Tên nguyên liệu tối đa 100 ký tự')
    .transform((v) => v.trim()),

  currentStock: z
    .number({ message: 'Tồn kho phải là số' })
    .min(0, 'Tồn kho không được âm'),

  minThreshold: z
    .number({ message: 'Ngưỡng tối thiểu phải là số' })
    .min(0, 'Ngưỡng tối thiểu không được âm')
    .nullable()
    .optional(),

  unit: z.string().default('kg'),
  
  group: z.enum(['HDPE', 'MB', 'KOREA']).default('KOREA'),
  color: z.string().nullable().optional(),
  brand: z.string().nullable().optional(),

  note: z
    .string()
    .max(200, 'Ghi chú tối đa 200 ký tự')
    .transform((v) => v.trim())
    .nullable()
    .optional(),
})

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET() {
  try {
    const materials = await prisma.material.findMany({
      orderBy: { name: 'asc' },
    })

    // Serialize Decimal fields to strings — same pattern as uvPct in orders
    const serialized = materials.map((m) => ({
      ...m,
      currentStock: m.currentStock.toString(),
      minThreshold: m.minThreshold?.toString() ?? null,
      createdAt: m.createdAt.toISOString(),
      updatedAt: m.updatedAt.toISOString(),
    }))

    return NextResponse.json({ success: true, materials: serialized })
  } catch (err) {
    console.error('[GET /api/materials] Error:', err)
    return NextResponse.json(
      { success: false, error: 'Không thể tải danh sách nguyên liệu.' },
      { status: 500 },
    )
  }
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON in request body.' },
      { status: 400 },
    )
  }

  const parsed = createMaterialSchema.safeParse(body)
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

  try {
    const material = await prisma.material.create({
      data: {
        name: data.name,
        group: data.group,
        color: data.color || null,
        brand: data.brand || null,
        currentStock: data.currentStock,
        minThreshold: data.minThreshold,
        unit: data.unit,
        note: data.note || null,
      },
    })

    const serialized = {
      ...material,
      currentStock: material.currentStock.toString(),
      minThreshold: material.minThreshold?.toString() ?? null,
      createdAt: material.createdAt.toISOString(),
      updatedAt: material.updatedAt.toISOString(),
    }

    return NextResponse.json({ success: true, material: serialized }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/materials] Error:', err)
    return NextResponse.json(
      { success: false, error: 'Không thể tạo nguyên liệu.' },
      { status: 500 },
    )
  }
}
