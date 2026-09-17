// src/app/api/materials/[id]/route.ts
// PATCH /api/materials/[id] — update currentStock, minThreshold, note
// DELETE /api/materials/[id] — delete material

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { z } from 'zod'

type RouteContext = { params: { id: string } }

// ── Zod schema for PATCH body ──────────────────────────────────────────────────

const updateMaterialSchema = z.object({
  currentStock: z
    .number({ message: 'Tồn kho phải là số' })
    .min(0, 'Tồn kho không được âm')
    .optional(),

  // null = remove threshold (“chưa đặt ngưỡng”); number = set threshold
  minThreshold: z
    .number({ message: 'Ngưỡng tối thiểu phải là số' })
    .min(0, 'Ngưỡng tối thiểu không được âm')
    .nullable()
    .optional(),

  note: z
    .string()
    .max(200, 'Ghi chú tối đa 200 ký tự')
    .transform((v) => v.trim())
    .nullable()
    .optional(),

  group: z.enum(['HDPE', 'MB', 'KOREA']).optional(),
  color: z.string().nullable().optional(),
  brand: z.string().nullable().optional(),
})

// ── PATCH ─────────────────────────────────────────────────────────────────────

export async function PATCH(req: NextRequest, context: RouteContext) {
  const { id } = context.params

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON in request body.' },
      { status: 400 },
    )
  }

  const parsed = updateMaterialSchema.safeParse(body)
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
  const updateData: any = {}

  if (data.currentStock !== undefined) updateData.currentStock = data.currentStock
  if (data.minThreshold !== undefined) updateData.minThreshold = data.minThreshold
  if (data.note !== undefined) updateData.note = data.note
  if (data.group !== undefined) updateData.group = data.group
  if (data.color !== undefined) updateData.color = data.color
  if (data.brand !== undefined) updateData.brand = data.brand

  try {
    const material = await prisma.material.update({
      where: { id },
      data: updateData,
    })

    const serialized = {
      ...material,
      currentStock: material.currentStock.toString(),
      minThreshold: material.minThreshold?.toString() ?? null,
      createdAt: material.createdAt.toISOString(),
      updatedAt: material.updatedAt.toISOString(),
    }

    return NextResponse.json({ success: true, material: serialized })
  } catch (err: unknown) {
    if (
      err !== null &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code: string }).code === 'P2025'
    ) {
      return NextResponse.json(
        { success: false, error: 'Nguyên liệu không tồn tại.' },
        { status: 404 },
      )
    }
    console.error(`[PATCH /api/materials/${id}] Error:`, err)
    return NextResponse.json(
      { success: false, error: 'Không thể cập nhật nguyên liệu.' },
      { status: 500 },
    )
  }
}

// ── DELETE ────────────────────────────────────────────────────────────────────

export async function DELETE(_req: NextRequest, context: RouteContext) {
  const { id } = context.params

  try {
    await prisma.material.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    if (
      err !== null &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code: string }).code === 'P2025'
    ) {
      return NextResponse.json(
        { success: false, error: 'Nguyên liệu không tồn tại.' },
        { status: 404 },
      )
    }
    console.error(`[DELETE /api/materials/${id}] Error:`, err)
    return NextResponse.json(
      { success: false, error: 'Không thể xóa nguyên liệu.' },
      { status: 500 },
    )
  }
}
