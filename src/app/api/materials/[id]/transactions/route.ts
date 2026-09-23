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
  if (!Number.isFinite(quantityKg) || quantityKg <= 0) {
    return NextResponse.json(
      { success: false, error: 'quantityKg phải là số dương.' },
      { status: 422 },
    )
  }
  const txDateValue = new Date(`${txDate}T00:00:00.000Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(txDate) || !Number.isFinite(txDateValue.getTime()) || txDateValue.toISOString().slice(0, 10) !== txDate || (mbPct != null && !Number.isFinite(mbPct))) {
    return NextResponse.json({ success: false, error: 'txDate phải là YYYY-MM-DD.' }, { status: 422 })
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '5s'")
      await tx.$executeRawUnsafe('LOCK TABLE "materials" IN SHARE ROW EXCLUSIVE MODE')
      await tx.$executeRawUnsafe('LOCK TABLE "material_transactions" IN SHARE ROW EXCLUSIVE MODE')
      await tx.$executeRawUnsafe('LOCK TABLE "material_report_snapshots" IN SHARE ROW EXCLUSIVE MODE')
      const material = await tx.material.findUnique({ where: { id } })
      if (!material) return { notFound: true as const }
      if (material.stockReportDate && txDate <= material.stockReportDate.toISOString().slice(0, 10)) return { covered: true as const }
      const transaction = await tx.materialTransaction.create({
        data: { materialId: id, txType, quantityKg, txDate: txDateValue, mbPct, orderId, note },
      })
      const updatedMaterial = await tx.material.update({
        where: { id },
        data: {
          currentStock: { [txType === 'in' ? 'increment' : 'decrement']: quantityKg },
          ...(material.stockReportDate ? { stockReportDirty: true } : {}),
        },
      })
      return { transaction, updatedMaterial }
    }, { timeout: 30_000, maxWait: 5_000 })

    if ('notFound' in result && result.notFound) return NextResponse.json({ success: false, error: 'Nguyên liệu không tồn tại.' }, { status: 404 })
    if ('covered' in result && result.covered) return NextResponse.json({ success: false, code: 'SNAPSHOT_COVERED', error: 'Ngày giao dịch nằm trong snapshot tồn kho; hãy dùng báo cáo ngày mới.' }, { status: 409 })
    const { transaction, updatedMaterial } = result

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
    if (err !== null && typeof err === 'object' && 'code' in err && ['P2028', 'P2034'].includes(String((err as { code?: unknown }).code))) {
      return NextResponse.json({ success: false, code: 'STALE_PREVIEW', error: 'Thử lại sau khi xem trước dữ liệu.' }, { status: 409 })
    }
    console.error('[POST /api/materials/[id]/transactions] Error:', err)
    return NextResponse.json(
      { success: false, error: 'Không thể tạo giao dịch.' },
      { status: 500 },
    )
  }
}
