// src/app/api/materials/[id]/transactions/route.ts
// GET  /api/materials/[id]/transactions — fetch transaction history for a material
// POST /api/materials/[id]/transactions — create a new transaction + update currentStock

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

type Params = { params: { id: string } }

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = params

  try {
    const transactions = await prisma.materialTransaction.findMany({
      where: { materialId: id },
      orderBy: { txDate: 'desc' },
      select: {
        id: true,
        txType: true,
        quantityKg: true,
        txDate: true,
        mbPct: true,
        orderId: true,
        note: true,
        createdAt: true,
      },
    })

    const serialized = transactions.map((t) => ({
      ...t,
      quantityKg: t.quantityKg.toString(),
      mbPct: t.mbPct?.toString() ?? null,
      txDate: t.txDate.toISOString(),
      createdAt: t.createdAt.toISOString(),
    }))

    return NextResponse.json({ success: true, transactions: serialized })
  } catch (err) {
    console.error('[GET /api/materials/[id]/transactions] Error:', err)
    return NextResponse.json(
      { success: false, error: 'Không thể tải lịch sử giao dịch.' },
      { status: 500 },
    )
  }
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = params

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON.' }, { status: 400 })
  }

  const b = body as Record<string, unknown>
  const txType     = String(b.txType ?? '').trim()
  const quantityKg = Number(b.quantityKg)
  const txDate     = String(b.txDate ?? '').trim()
  const mbPct      = b.mbPct != null && b.mbPct !== '' ? Number(b.mbPct) : null
  const orderId    = b.orderId ? String(b.orderId).trim() : null
  const note       = b.note ? String(b.note).trim() : null

  const validTypes = ['in', 'out_using', 'out_broken', 'out_tape', 'out_reject']
  if (!validTypes.includes(txType)) {
    return NextResponse.json(
      { success: false, error: `txType phải là một trong: ${validTypes.join(', ')}` },
      { status: 422 },
    )
  }
  if (isNaN(quantityKg) || quantityKg <= 0) {
    return NextResponse.json(
      { success: false, error: 'quantityKg phải là số dương.' },
      { status: 422 },
    )
  }
  if (!txDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
    return NextResponse.json({ success: false, error: 'txDate phải là YYYY-MM-DD.' }, { status: 422 })
  }

  // Verify material exists
  const material = await prisma.material.findUnique({ where: { id } })
  if (!material) {
    return NextResponse.json({ success: false, error: 'Nguyên liệu không tồn tại.' }, { status: 404 })
  }

  try {
    const [transaction, updatedMaterial] = await prisma.$transaction([
      prisma.materialTransaction.create({
        data: {
          materialId: id,
          txType,
          quantityKg,
          txDate: new Date(txDate + 'T00:00:00.000Z'),
          mbPct,
          orderId,
          note,
        },
      }),
      prisma.material.update({
        where: { id },
        data: {
          currentStock: {
            // "in" adds stock; all "out_*" reduce stock
            [txType === 'in' ? 'increment' : 'decrement']: quantityKg,
          },
        },
      }),
    ])

    return NextResponse.json({
      success: true,
      transaction: {
        ...transaction,
        quantityKg: transaction.quantityKg.toString(),
        mbPct: transaction.mbPct?.toString() ?? null,
        txDate: transaction.txDate.toISOString(),
        createdAt: transaction.createdAt.toISOString(),
      },
      material: {
        ...updatedMaterial,
        currentStock: updatedMaterial.currentStock.toString(),
        minThreshold: updatedMaterial.minThreshold?.toString() ?? null,
        createdAt: updatedMaterial.createdAt.toISOString(),
        updatedAt: updatedMaterial.updatedAt.toISOString(),
      },
    }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/materials/[id]/transactions] Error:', err)
    return NextResponse.json(
      { success: false, error: 'Không thể tạo giao dịch.' },
      { status: 500 },
    )
  }
}
