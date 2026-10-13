import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { issueTypes, summarizePiIssues } from '@/lib/materials/piIssues'

export const dynamic = 'force-dynamic'
export async function GET(_req: NextRequest, { params }: { params: { piNumber: string } }) {
  const piNumber = params.piNumber.trim()
  if (!piNumber) return NextResponse.json({ success: false, error: 'Thiếu mã PI.' }, { status: 422 })
  try {
    const transactions = await prisma.materialTransaction.findMany({
      where: { orderId: { equals: piNumber, mode: 'insensitive' }, reportSnapshotId: null, txType: { in: [...issueTypes] } },
      select: { materialId: true, material: { select: { name: true } }, orderId: true, reportSnapshotId: true, txType: true, quantityKg: true, txDate: true },
    })
    const rows = summarizePiIssues(transactions.map(tx => ({ ...tx, quantityKg: tx.quantityKg.toString(), txDate: tx.txDate.toISOString() })), piNumber)
    return NextResponse.json({ success: true, piNumber, rows })
  } catch {
    return NextResponse.json({ success: false, error: 'Không thể tải vật tư đã xuất theo PI.' }, { status: 500 })
  }
}
