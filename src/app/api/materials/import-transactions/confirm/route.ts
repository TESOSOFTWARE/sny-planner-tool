// src/app/api/materials/import-transactions/confirm/route.ts
// Confirm a stock snapshot with provenance. The client preview is advisory:
// rows, decisions and replacement keys are revalidated under table locks.

import { createHash } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import {
  materialReportKey,
  normalizeMaterialName,
  type MaterialGroupInput,
  type ParsedMaterialRow,
} from '@/lib/excel/parseMaterialReport'
import type { StockDecision } from '@/types'

const bodySchema = z.object({
  group: z.enum(['HDPE', 'MB', 'KOREA']),
  txDate: z.string(),
  rows: z.array(z.unknown()).min(1).max(500),
  expectedSnapshot: z.string().min(1),
  replaceKeys: z.array(z.string()),
})

function hashSnapshot(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function rowFromUnknown(value: unknown): ParsedMaterialRow {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const numeric = (key: string): number | null => {
    if (source[key] == null || source[key] === '') return null
    const n = Number(source[key])
    return Number.isFinite(n) ? Math.round((n + Number.EPSILON) * 100) / 100 : null
  }
  const errors: string[] = []
  const materialName = typeof source.materialName === 'string' ? source.materialName.trim() : ''
  if (!materialName) errors.push('Tên vật tư là bắt buộc')
  const values = ['firstStock', 'lastStock', 'inQty', 'outUsing', 'outBroken', 'outTape', 'outReject']
  values.forEach((key) => {
    const valueNumber = numeric(key)
    const required = key === 'firstStock' || key === 'lastStock'
    if (valueNumber == null) {
      if (required || (source[key] != null && source[key] !== '')) errors.push(`${key} phải là số hữu hạn`)
      return
    }
    if (valueNumber < 0 && key !== 'outUsing' && key !== 'outBroken' && key !== 'outTape' && key !== 'outReject') errors.push(`${key} không được âm`)
    if (Math.abs(valueNumber) > 99_999_999.99) errors.push(`${key} vượt giới hạn lưu trữ`)
  })
  return {
    materialName,
    firstStock: numeric('firstStock') ?? 0,
    inQty: numeric('inQty') ?? 0,
    outUsing: Math.abs(numeric('outUsing') ?? 0),
    outBroken: Math.abs(numeric('outBroken') ?? 0),
    outTape: Math.abs(numeric('outTape') ?? 0),
    outReject: Math.abs(numeric('outReject') ?? 0),
    lastStock: numeric('lastStock') ?? 0,
    sourceRow: Number(source.sourceRow) || 0,
    isValid: errors.length === 0,
    validationErrors: errors,
  }
}

function payloadFor(row: ParsedMaterialRow) {
  return {
    materialName: normalizeMaterialName(row.materialName),
    firstStock: row.firstStock,
    inQty: row.inQty,
    outUsing: row.outUsing,
    outBroken: row.outBroken,
    outTape: row.outTape,
    outReject: row.outReject,
    lastStock: row.lastStock,
  }
}

function isSamePayload(payload: unknown, row: ParsedMaterialRow): boolean {
  return JSON.stringify(payload) === JSON.stringify(payloadFor(row))
}

function retryable(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && ['P2028', 'P2034'].includes(String((error as { code?: unknown }).code)))
}

function responseForConflict(code: string, error: string, decisions: StockDecision[]) {
  return NextResponse.json({ success: false, code, error, decisions }, { status: 409 })
}

export async function POST(req: NextRequest) {
  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ success: false, code: 'INVALID_INPUT', error: 'JSON không hợp lệ.' }, { status: 400 })
  }
  const parsedBody = bodySchema.safeParse(body)
  if (!parsedBody.success || !validDate(parsedBody.success ? parsedBody.data.txDate : '')) {
    return NextResponse.json({ success: false, code: 'INVALID_INPUT', error: 'group, txDate, rows, expectedSnapshot và replaceKeys không hợp lệ.' }, { status: 422 })
  }
  const { group, txDate, expectedSnapshot, replaceKeys } = parsedBody.data
  const rows = parsedBody.data.rows.map(rowFromUnknown)
  const materialKeys = rows.map((row) => materialReportKey(group, row.materialName))
  if (new Set(materialKeys).size !== materialKeys.length) {
    const decisions: StockDecision[] = rows.map((row, rowIndex) => ({
      rowIndex,
      materialKey: materialKeys[rowIndex],
      materialId: null,
      status: 'invalid',
      reasons: ['Trùng vật tư sau chuẩn hóa trong cùng một file; không tự gộp.'],
    }))
    return NextResponse.json({ success: false, code: 'INVALID_INPUT', error: 'File có vật tư trùng tên trong cùng block.', decisions }, { status: 422 })
  }
  const txDateObj = new Date(`${txDate}T00:00:00.000Z`)

  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '5s'")
      await tx.$executeRawUnsafe('LOCK TABLE "materials" IN SHARE ROW EXCLUSIVE MODE')
      await tx.$executeRawUnsafe('LOCK TABLE "material_transactions" IN SHARE ROW EXCLUSIVE MODE')
      await tx.$executeRawUnsafe('LOCK TABLE "material_report_snapshots" IN SHARE ROW EXCLUSIVE MODE')

      const materials = await tx.material.findMany({
        where: { group },
        include: {
          reportSnapshots: { orderBy: { reportDate: 'desc' }, take: 1 },
          transactions: { orderBy: { txDate: 'desc' }, take: 1 },
        },
      })
      const byName = new Map<string, typeof materials>()
      materials.forEach((material) => {
        const key = normalizeMaterialName(material.name)
        byName.set(key, [...(byName.get(key) ?? []), material])
      })
      const decisions: StockDecision[] = rows.map((row, rowIndex) => {
        const key = materialReportKey(group as MaterialGroupInput, row.materialName)
        if (!row.isValid) return { rowIndex, materialKey: key, materialId: null, status: 'invalid', reasons: row.validationErrors }
        const matches = byName.get(normalizeMaterialName(row.materialName)) ?? []
        if (matches.length > 1) return { rowIndex, materialKey: key, materialId: null, status: 'conflict', reasons: ['Có nhiều vật tư trùng tên sau chuẩn hóa'] }
        if (matches.length === 0) return { rowIndex, materialKey: key, materialId: null, status: 'new', reasons: [] }
        const material = matches[0]
        const snapshot = material.reportSnapshots.find((item) => item.reportDate.toISOString().slice(0, 10) === txDate)
        const latestTxDate = material.transactions[0]?.txDate.toISOString().slice(0, 10) ?? null
        if (material.stockReportDate && txDate < material.stockReportDate.toISOString().slice(0, 10)) return { rowIndex, materialKey: key, materialId: material.id, status: 'conflict', reasons: ['STALE_REPORT'] }
        if (latestTxDate && latestTxDate > txDate) return { rowIndex, materialKey: key, materialId: material.id, status: 'conflict', reasons: ['STALE_REPORT'] }
        if (snapshot && isSamePayload(snapshot.payload, row)) {
          return { rowIndex, materialKey: key, materialId: material.id, status: 'identical', reasons: [] }
        }
        if (!snapshot && latestTxDate === txDate) return { rowIndex, materialKey: key, materialId: material.id, status: 'conflict', reasons: ['Đã có giao dịch lịch sử cùng ngày nhưng chưa có provenance'] }
        if (snapshot && material.stockReportDirty) return { rowIndex, materialKey: key, materialId: material.id, status: 'conflict', reasons: ['SNAPSHOT_COVERED'] }
        return { rowIndex, materialKey: key, materialId: material.id, status: 'replace', reasons: ['REPLACEMENT_REQUIRED'] }
      })
      const canonicalRows = rows.map((row, index) => ({
        key: decisions[index].materialKey,
        row: payloadFor(row),
        materialId: decisions[index].materialId,
        material: materials.find((item) => item.id === decisions[index].materialId),
      })).map((entry) => ({
        key: entry.key,
        row: entry.row,
        materialId: entry.materialId,
        updatedAt: entry.material?.updatedAt.toISOString() ?? null,
        currentStock: entry.material?.currentStock.toString() ?? null,
        stockReportDate: entry.material?.stockReportDate?.toISOString().slice(0, 10) ?? null,
        stockReportDirty: entry.material?.stockReportDirty ?? false,
        snapshot: entry.material?.reportSnapshots[0] ? {
          id: entry.material.reportSnapshots[0].id,
          hash: entry.material.reportSnapshots[0].contentHash,
          version: entry.material.reportSnapshots[0].version,
          reportDate: entry.material.reportSnapshots[0].reportDate.toISOString().slice(0, 10),
        } : null,
        latestTxDate: entry.material?.transactions[0]?.txDate.toISOString().slice(0, 10) ?? null,
      })).sort((a, b) => a.key.localeCompare(b.key))
      const actualSnapshot = hashSnapshot({ group, txDate, rows: canonicalRows })
      if (actualSnapshot !== expectedSnapshot) return { stale: true as const, decisions }

      const replaceSet = new Set(replaceKeys)
      const requiredReplace = decisions.filter((decision) => decision.status === 'replace').map((decision) => decision.materialKey)
      if (replaceSet.size !== requiredReplace.length || requiredReplace.some((key) => !replaceSet.has(key)) || replaceKeys.some((key) => !requiredReplace.includes(key))) return { replacement: true as const, decisions }
      if (decisions.some((decision) => decision.status === 'conflict' || decision.status === 'invalid')) return { decisions }

      let created = 0
      let replaced = 0
      let unchanged = 0
      let transactionsCreated = 0
      for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index]
        const decision = decisions[index]
        if (decision.status === 'identical') { unchanged += 1; continue }
        const payload = payloadFor(row)
        let materialId = decision.materialId
        let snapshotId: string
        if (!materialId) {
          const material = await tx.material.create({ data: { name: row.materialName.trim(), group, currentStock: row.lastStock, stockReportDate: txDateObj, stockReportDirty: false, unit: 'kg' } })
          materialId = material.id
          const snapshot = await tx.materialReportSnapshot.create({ data: { materialId, reportDate: txDateObj, payload, contentHash: hashSnapshot(payload), version: 1 } })
          snapshotId = snapshot.id
          created += 1
        } else {
          const oldSnapshot = await tx.materialReportSnapshot.findUnique({ where: { materialId_reportDate: { materialId, reportDate: txDateObj } } })
          if (oldSnapshot) {
            await tx.materialTransaction.deleteMany({ where: { reportSnapshotId: oldSnapshot.id } })
            const snapshot = await tx.materialReportSnapshot.update({ where: { id: oldSnapshot.id }, data: { payload, contentHash: hashSnapshot(payload), version: { increment: 1 } } })
            snapshotId = snapshot.id
          } else {
            const snapshot = await tx.materialReportSnapshot.create({ data: { materialId, reportDate: txDateObj, payload, contentHash: hashSnapshot(payload), version: 1 } })
            snapshotId = snapshot.id
          }
          await tx.material.update({ where: { id: materialId }, data: { currentStock: row.lastStock, stockReportDate: txDateObj, stockReportDirty: false } })
          replaced += 1
        }
        const movementSpecs: Array<[string, number]> = [
          ['in', row.inQty],
          ['out_using', row.outUsing],
          ['out_broken', row.outBroken],
          ['out_tape', row.outTape],
          ['out_reject', row.outReject],
        ]
        const movements = movementSpecs.filter(([, quantity]) => quantity > 0).map(([txType, quantity]) => ({ materialId: materialId as string, txType, quantityKg: quantity, txDate: txDateObj, reportSnapshotId: snapshotId }))
        if (movements.length > 0) {
          await tx.materialTransaction.createMany({ data: movements })
          transactionsCreated += movements.length
        }
      }
      return { created, replaced, unchanged, transactionsCreated }
    }, { timeout: 30_000, maxWait: 5_000 })

    if ('stale' in result && result.stale) return responseForConflict('STALE_PREVIEW', 'Dữ liệu đã thay đổi sau khi xem trước. Vui lòng xem trước lại.', result.decisions)
    if ('replacement' in result && result.replacement) return responseForConflict('REPLACEMENT_REQUIRED', 'Cần xác nhận thay thế các bản ghi cùng ngày.', result.decisions)
    if (result.decisions) {
      const invalid = result.decisions.some((decision) => decision.status === 'invalid')
      return NextResponse.json({ success: false, code: invalid ? 'INVALID_INPUT' : 'STALE_REPORT', error: 'Báo cáo có xung đột hoặc không hợp lệ; chưa ghi dữ liệu.', decisions: result.decisions }, { status: invalid ? 422 : 409 })
    }
    return NextResponse.json({ success: true, materialsUpdated: result.created + result.replaced, transactionsCreated: result.transactionsCreated, created: result.created, replaced: result.replaced, unchanged: result.unchanged })
  } catch (error) {
    if (retryable(error)) return responseForConflict('STALE_PREVIEW', 'Thử xem trước lại.', [])
    console.error('[POST /api/materials/import-transactions/confirm]', error)
    return NextResponse.json({ success: false, code: 'DATABASE_ERROR', error: 'Không thể lưu báo cáo tồn kho.' }, { status: 500 })
  }
}
