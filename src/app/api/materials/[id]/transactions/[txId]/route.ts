// src/app/api/materials/[id]/transactions/[txId]/route.ts
// Deletes only a manual transaction outside a stock-report baseline.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

type Params = { params: { id: string; txId: string } }

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id, txId } = params
  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '5s'")
      await tx.$executeRawUnsafe('LOCK TABLE "materials" IN SHARE ROW EXCLUSIVE MODE')
      await tx.$executeRawUnsafe('LOCK TABLE "material_transactions" IN SHARE ROW EXCLUSIVE MODE')
      await tx.$executeRawUnsafe('LOCK TABLE "material_report_snapshots" IN SHARE ROW EXCLUSIVE MODE')
      const transaction = await tx.materialTransaction.findUnique({ where: { id: txId } })
      if (!transaction) return { notFound: true as const }
      if (transaction.materialId !== id) return { forbidden: true as const }
      const material = await tx.material.findUnique({ where: { id } })
      if (!material) return { notFound: true as const }
      if (transaction.reportSnapshotId || (material.stockReportDate && transaction.txDate.toISOString().slice(0, 10) <= material.stockReportDate.toISOString().slice(0, 10))) return { covered: true as const }
      await tx.materialTransaction.delete({ where: { id: txId } })
      const updated = await tx.material.update({
        where: { id },
        data: {
          currentStock: { [transaction.txType === 'in' ? 'decrement' : 'increment']: transaction.quantityKg },
          ...(material.stockReportDate ? { stockReportDirty: true } : {}),
        },
      })
      return { updated }
    }, { timeout: 30_000, maxWait: 5_000 })
    if ('notFound' in result && result.notFound) return NextResponse.json({ success: false, error: 'Giao dịch không tồn tại.' }, { status: 404 })
    if ('forbidden' in result && result.forbidden) return NextResponse.json({ success: false, error: 'Giao dịch không thuộc nguyên liệu này.' }, { status: 403 })
    if ('covered' in result && result.covered) return NextResponse.json({ success: false, code: 'SNAPSHOT_COVERED', error: 'Không thể xóa giao dịch thuộc snapshot hoặc đã được snapshot bao phủ.' }, { status: 409 })
    return NextResponse.json({ success: true })
  } catch (err) {
    if (err !== null && typeof err === 'object' && 'code' in err && ['P2028', 'P2034'].includes(String((err as { code?: unknown }).code))) {
      return NextResponse.json({ success: false, code: 'STALE_PREVIEW', error: 'Thử lại sau khi xem trước dữ liệu.' }, { status: 409 })
    }
    console.error('[DELETE /api/materials/[id]/transactions/[txId]] Error:', err)
    return NextResponse.json({ success: false, error: 'Không thể xóa giao dịch.' }, { status: 500 })
  }
}
