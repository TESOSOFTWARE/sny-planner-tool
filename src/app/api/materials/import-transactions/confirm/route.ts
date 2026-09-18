// src/app/api/materials/import-transactions/confirm/route.ts
// POST /api/materials/import-transactions/confirm
// Accepts parsed rows + txDate, upserts materials, creates MaterialTransaction records,
// and updates material.currentStock = lastStock (file is source of truth).

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import type { ParsedMaterialRow } from '@/lib/excel/parseMaterialReport'

interface ConfirmBody {
  rows: ParsedMaterialRow[]
  txDate: string // ISO date string YYYY-MM-DD
}

export async function POST(req: NextRequest) {
  let body: ConfirmBody
  try {
    body = await req.json() as ConfirmBody
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON.' }, { status: 400 })
  }

  const { rows, txDate } = body

  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ success: false, error: 'Không có dòng nào để import.' }, { status: 400 })
  }

  if (!txDate || !/^\d{4}-\d{2}-\d{2}$/.test(txDate)) {
    return NextResponse.json({ success: false, error: 'Ngày báo cáo không hợp lệ.' }, { status: 400 })
  }

  const txDateObj = new Date(txDate + 'T00:00:00.000Z')

  // ── Fetch all existing materials once ──────────────────────────────────────
  const existingMaterials = await prisma.material.findMany({ select: { id: true, name: true } })
  const materialMap = new Map(existingMaterials.map((m) => [m.name.toUpperCase().trim(), m.id]))

  let materialsUpdated = 0
  let transactionsCreated = 0

  // ── Process the complete report atomically ────────────────────────────────
  // A partial report must never leave transactions and currentStock out of
  // sync. Existing materials are read before the transaction only to build a
  // fast lookup; all writes use the transaction client below.
  await prisma.$transaction(async (tx) => {
   for (const row of rows) {
    const nameKey = row.materialName.toUpperCase().trim()

    // Upsert material if not found
    let materialId = materialMap.get(nameKey)
    if (!materialId) {
      const created = await tx.material.create({
        data: {
          name: row.materialName.trim(),
          currentStock: row.lastStock,
          minThreshold: null, // null = "chưa đặt ngưỡng"
          unit: 'kg',
        },
      })
      materialId = created.id
      materialMap.set(nameKey, materialId)
    }

    // Build transaction records for this row
    const txRecords: {
      materialId: string
      txType: string
      quantityKg: number
      txDate: Date
    }[] = []

    if (row.inQty > 0)      txRecords.push({ materialId, txType: 'in',         quantityKg: row.inQty,      txDate: txDateObj })
    if (row.outUsing > 0)   txRecords.push({ materialId, txType: 'out_using',  quantityKg: row.outUsing,   txDate: txDateObj })
    if (row.outBroken > 0)  txRecords.push({ materialId, txType: 'out_broken', quantityKg: row.outBroken,  txDate: txDateObj })
    if (row.outTape > 0)    txRecords.push({ materialId, txType: 'out_tape',   quantityKg: row.outTape,    txDate: txDateObj })
    if (row.outReject > 0)  txRecords.push({ materialId, txType: 'out_reject', quantityKg: row.outReject,  txDate: txDateObj })

    if (txRecords.length > 0) {
      await tx.materialTransaction.createMany({ data: txRecords })
      transactionsCreated += txRecords.length
    }

    // Update currentStock to lastStock from file (source of truth)
    await tx.material.update({
      where: { id: materialId },
      data: { currentStock: row.lastStock },
    })

    materialsUpdated++
   }
  }, { timeout: 30_000 })

  return NextResponse.json({
    success: true,
    materialsUpdated,
    transactionsCreated,
  })
}
