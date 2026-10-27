// src/app/api/materials/[id]/route.ts
// PATCH /api/materials/[id] — update currentStock, minThreshold, note
// DELETE /api/materials/[id] — delete material

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { z } from 'zod'
import { materialTaxonomyShape, taxonomyMatchesGroup } from '@/lib/materials/taxonomy'

type RouteContext = { params: { id: string } }

// ── Zod schema for PATCH body ──────────────────────────────────────────────────

const updateMaterialSchema = z.object({
  ...materialTaxonomyShape,
  name: z.string().trim().min(1).max(120).optional(),
  currentStock: z
    .number({ message: 'Tồn kho phải là số' })
    .finite()
    .min(0, 'Tồn kho không được âm')
    .optional(),

  // null = remove threshold (“chưa đặt ngưỡng”); number = set threshold
  minThreshold: z
    .number({ message: 'Ngưỡng tối thiểu phải là số' })
    .finite()
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

  if (data.name !== undefined) updateData.name = data.name
  if (data.currentStock !== undefined) updateData.currentStock = data.currentStock
  if (data.minThreshold !== undefined) updateData.minThreshold = data.minThreshold
  if (data.note !== undefined) updateData.note = data.note
  if (data.group !== undefined) updateData.group = data.group
  if (data.color !== undefined) updateData.color = data.color
  if (data.brand !== undefined) updateData.brand = data.brand
  if (data.subGroup !== undefined) updateData.subGroup = data.subGroup
  if (data.lightFastness !== undefined) updateData.lightFastness = data.lightFastness

  try {
    const material = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '5s'")
      await tx.$executeRawUnsafe('LOCK TABLE "materials" IN SHARE ROW EXCLUSIVE MODE')
      await tx.$executeRawUnsafe('LOCK TABLE "material_transactions" IN SHARE ROW EXCLUSIVE MODE')
      await tx.$executeRawUnsafe('LOCK TABLE "material_report_snapshots" IN SHARE ROW EXCLUSIVE MODE')
      const current = await tx.material.findUnique({ where: { id }, include: { reportSnapshots: { take: 1 } } })
      if (!current) throw Object.assign(new Error('NOT_FOUND'), { code: 'P2025' })
      const nextGroup = data.group ?? current.group
      if (data.name !== undefined || data.group !== undefined) {
        const peers = await tx.material.findMany({ where: { group: nextGroup }, select: { id: true, name: true, group: true } })
        const target = (data.name ?? current.name).trim().replace(/\s+/g, ' ').toUpperCase()
        if (peers.some(peer => peer.id !== id && peer.name.trim().replace(/\s+/g, ' ').toUpperCase() === target)) throw Object.assign(new Error('DUPLICATE_NAME'), { code: 'DUPLICATE_NAME' })
      }
      if (!taxonomyMatchesGroup(nextGroup, data)) throw Object.assign(new Error('INVALID_TAXONOMY'), { code: 'INVALID_TAXONOMY' })
      if (data.group !== undefined && data.group !== current.group) {
        if (nextGroup !== 'HDPE') updateData.subGroup = null
        if (nextGroup !== 'MB') updateData.lightFastness = null
      }
      if (data.group !== undefined && data.group !== current.group && current.reportSnapshots.length > 0) {
        throw Object.assign(new Error('SNAPSHOT_COVERED'), { code: 'SNAPSHOT_COVERED' })
      }
      if (data.currentStock !== undefined && current.stockReportDate) updateData.stockReportDirty = true
      return tx.material.update({ where: { id }, data: updateData })
    }, { timeout: 30_000, maxWait: 5_000 })

    const serialized = {
      ...material,
      currentStock: material.currentStock.toString(),
      minThreshold: material.minThreshold?.toString() ?? null,
      createdAt: material.createdAt.toISOString(),
      updatedAt: material.updatedAt.toISOString(),
    }

    return NextResponse.json({ success: true, material: serialized })
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && err.code === 'DUPLICATE_NAME') return NextResponse.json({ success: false, error: 'Đã có vật tư cùng tên trong nhóm.' }, { status: 409 })
    if (err && typeof err === 'object' && 'code' in err && err.code === 'INVALID_TAXONOMY') return NextResponse.json({ success: false, error: 'Phân loại nhựa chỉ dùng cho HDPE; độ bền màu chỉ dùng cho MB.' }, { status: 422 })

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
    if (err !== null && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'SNAPSHOT_COVERED') {
      return NextResponse.json({ success: false, code: 'SNAPSHOT_COVERED', error: 'Không thể thay đổi nhóm hoặc tồn trực tiếp sau khi đã có snapshot.' }, { status: 409 })
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
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '5s'")
      await tx.$executeRawUnsafe('LOCK TABLE "materials" IN SHARE ROW EXCLUSIVE MODE')
      await tx.$executeRawUnsafe('LOCK TABLE "material_transactions" IN SHARE ROW EXCLUSIVE MODE')
      await tx.$executeRawUnsafe('LOCK TABLE "material_report_snapshots" IN SHARE ROW EXCLUSIVE MODE')
      const current = await tx.material.findUnique({ where: { id }, include: { reportSnapshots: { take: 1 } } })
      if (!current) throw Object.assign(new Error('NOT_FOUND'), { code: 'P2025' })
      if (current.reportSnapshots.length > 0) throw Object.assign(new Error('SNAPSHOT_COVERED'), { code: 'SNAPSHOT_COVERED' })
      await tx.material.delete({ where: { id } })
    }, { timeout: 30_000, maxWait: 5_000 })
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
    if (err !== null && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'SNAPSHOT_COVERED') {
      return NextResponse.json({ success: false, code: 'SNAPSHOT_COVERED', error: 'Không thể xóa nguyên liệu đã có snapshot tồn kho.' }, { status: 409 })
    }
    console.error(`[DELETE /api/materials/${id}] Error:`, err)
    return NextResponse.json(
      { success: false, error: 'Không thể xóa nguyên liệu.' },
      { status: 500 },
    )
  }
}
