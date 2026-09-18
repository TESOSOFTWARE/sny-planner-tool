// src/app/api/materials/[id]/transactions/[txId]/route.ts
// DELETE /api/materials/[id]/transactions/[txId]
// Deletes a transaction and reverses its currentStock impact.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

type Params = { params: { id: string; txId: string } }

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id, txId } = params

  // Fetch the transaction first so we know how to reverse it
  const tx = await prisma.materialTransaction.findUnique({
    where: { id: txId },
    select: { id: true, txType: true, quantityKg: true, materialId: true },
  })

  if (!tx) {
    return NextResponse.json({ success: false, error: 'Giao dịch không tồn tại.' }, { status: 404 })
  }

  if (tx.materialId !== id) {
    return NextResponse.json({ success: false, error: 'Giao dịch không thuộc nguyên liệu này.' }, { status: 403 })
  }

  try {
    // Reverse the stock impact: "in" was an increment → decrement to undo; "out_*" was decrement → increment to undo
    await prisma.$transaction([
      prisma.materialTransaction.delete({ where: { id: txId } }),
      prisma.material.update({
        where: { id },
        data: {
          currentStock: {
            [tx.txType === 'in' ? 'decrement' : 'increment']: tx.quantityKg,
          },
        },
      }),
    ])

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[DELETE /api/materials/[id]/transactions/[txId]] Error:', err)
    return NextResponse.json(
      { success: false, error: 'Không thể xóa giao dịch.' },
      { status: 500 },
    )
  }
}
