// src/app/api/materials/import-transactions/confirm/route.ts
// Confirm a stock snapshot with provenance. The client preview is advisory:
// rows, decisions and replacement keys are revalidated under table locks.

import { createHash } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import {
  materialReportKey,
  parseMaterialReport,
  type MaterialGroupInput,
  type ParsedMaterialRow,
} from '@/lib/excel/parseMaterialReport'
import { materialReportPayload as payloadFor, sameMaterialReport as isSamePayload, importedTaxonomy } from '@/lib/materials/reportPayload'
import { taxonomyMatchesGroup } from '@/lib/materials/taxonomy'
import type { StockDecision } from '@/types'

const bodySchema = z.object({
  group: z.enum(['HDPE', 'MB', 'KOREA']),
  txDate: z.string(),
  headerRow: z.number().int().positive(),
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

function retryable(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && ['P2028', 'P2034'].includes(String((error as { code?: unknown }).code)))
}

function responseForConflict(code: string, error: string, decisions: StockDecision[]) {
  return NextResponse.json({ success: false, code, error, decisions }, { status: 409 })
}

export async function POST(req: NextRequest) {
  let form: FormData
  try { form = await req.formData() } catch {
    return NextResponse.json({ success: false, code: 'INVALID_INPUT', error: 'Cần gửi lại file Excel đã xem trước.' }, { status: 422 })
  }
  let replacement: unknown
  try { replacement = JSON.parse(String(form.get('replaceKeys') ?? '[]')) } catch { replacement = null }
  const parsedBody = bodySchema.safeParse({ group: form.get('group'), txDate: form.get('txDate'), headerRow: Number(form.get('headerRow')), expectedSnapshot: form.get('expectedSnapshot'), replaceKeys: replacement })
  const file = form.get('file')
  if (!parsedBody.success || !validDate(parsedBody.success ? parsedBody.data.txDate : '') || !(file instanceof File) || !file.name.toLowerCase().endsWith('.xlsx') || file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ success: false, code: 'INVALID_INPUT', error: 'File, nhóm, ngày, block và xác nhận thay thế không hợp lệ.' }, { status: 422 })
  }
  const { group, txDate, expectedSnapshot, replaceKeys, headerRow } = parsedBody.data
  let rows: ParsedMaterialRow[]
  try { rows = parseMaterialReport(Buffer.from(await file.arrayBuffer()), group, headerRow) } catch (error) {
    return NextResponse.json({ success: false, code: 'INVALID_INPUT', error: error instanceof Error ? error.message : 'Không đọc được file Excel.' }, { status: 422 })
  }
  if (!rows.length || !rows.some(row => row.isValid)) return NextResponse.json({ success: false, code: 'INVALID_INPUT', error: 'Không có dòng vật tư hợp lệ để nhập.' }, { status: 422 })
  if (rows.some(row => row.isValid && !taxonomyMatchesGroup(row.group ?? group, row))) return NextResponse.json({ success: false, code: 'INVALID_INPUT', error: 'Thông tin phân loại không phù hợp nhóm vật tư.' }, { status: 422 })
  const skippedRows = rows.filter(row => !row.isValid).map(row => ({ sourceRow: row.sourceRow, reasons: row.validationErrors }))
  const txDateObj = new Date(`${txDate}T00:00:00.000Z`)

  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '5s'")
      await tx.$executeRawUnsafe('LOCK TABLE "materials" IN SHARE ROW EXCLUSIVE MODE')
      await tx.$executeRawUnsafe('LOCK TABLE "material_transactions" IN SHARE ROW EXCLUSIVE MODE')
      await tx.$executeRawUnsafe('LOCK TABLE "material_report_snapshots" IN SHARE ROW EXCLUSIVE MODE')

      const materials = await tx.material.findMany({
        where: { group: { in: group === 'HDPE' ? ['HDPE', 'MB'] : [group] } },
        include: {
          reportSnapshots: { orderBy: { reportDate: 'desc' }, take: 1 },
          transactions: { orderBy: { txDate: 'desc' }, take: 1 },
        },
      })
      const byName = new Map<string, typeof materials>()
      materials.forEach((material) => {
        const key = materialReportKey(material.group as MaterialGroupInput, material.name)
        byName.set(key, [...(byName.get(key) ?? []), material])
      })
      const decisions: StockDecision[] = rows.map((row, rowIndex) => {
        const key = materialReportKey(row.group ?? group, row.materialName)
        if (!row.isValid) return { rowIndex, materialKey: key, materialId: null, status: 'invalid', reasons: row.validationErrors }
        const matches = byName.get(key) ?? []
        if (matches.length > 1) return { rowIndex, materialKey: key, materialId: null, status: 'conflict', reasons: ['Có nhiều vật tư trùng tên sau chuẩn hóa'] }
        if (matches.length === 0) return { rowIndex, materialKey: key, materialId: null, status: 'new', reasons: [] }
        const material = matches[0]
        const snapshot = material.reportSnapshots.find((item) => item.reportDate.toISOString().slice(0, 10) === txDate)
        const latestTxDate = material.transactions[0]?.txDate.toISOString().slice(0, 10) ?? null
        if (material.stockReportDate && txDate < material.stockReportDate.toISOString().slice(0, 10)) return { rowIndex, materialKey: key, materialId: material.id, status: 'conflict', reasons: ['STALE_REPORT'] }
        if (latestTxDate && latestTxDate > txDate) return { rowIndex, materialKey: key, materialId: material.id, status: 'conflict', reasons: ['STALE_REPORT'] }
        const same = snapshot != null && isSamePayload(snapshot.payload, row)
        if (same && material.stockReportDate?.toISOString().slice(0, 10) === txDate) {
          return { rowIndex, materialKey: key, materialId: material.id, status: 'identical', reasons: [] }
        }
        if (!snapshot && latestTxDate === txDate) return { rowIndex, materialKey: key, materialId: material.id, status: 'conflict', reasons: ['Đã có giao dịch lịch sử cùng ngày nhưng chưa có provenance'] }
        if (snapshot && material.stockReportDirty) return { rowIndex, materialKey: key, materialId: material.id, status: 'conflict', reasons: ['SNAPSHOT_COVERED'] }
        if (same) return { rowIndex, materialKey: key, materialId: material.id, status: 'replace', reasons: ['Đã có báo cáo lịch sử ngày này; xác nhận để cập nhật tồn hiện tại.'] }
        return { rowIndex, materialKey: key, materialId: material.id, status: 'replace', reasons: ['REPLACEMENT_REQUIRED'] }
      })
      const canonicalRows = rows.map((row, index) => ({
        key: decisions[index].materialKey,
        sourceRow: row.sourceRow,
        isValid: row.isValid,
        validationErrors: row.validationErrors,
        row: payloadFor(row),
        materialId: decisions[index].materialId,
        material: materials.find((item) => item.id === decisions[index].materialId),
      })).map((entry) => ({
        key: entry.key,
        sourceRow: entry.sourceRow,
        isValid: entry.isValid,
        validationErrors: entry.validationErrors,
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
      if (decisions.some((decision) => decision.status === 'conflict')) return { decisions }

      let created = 0
      let replaced = 0
      let unchanged = 0
      let transactionsCreated = 0
      for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index]
        const decision = decisions[index]
        if (decision.status === 'invalid') continue
        if (decision.status === 'identical') { unchanged += 1; continue }
        const payload = payloadFor(row)
        let materialId = decision.materialId
        let snapshotId: string
        if (!materialId) {
          const material = await tx.material.create({ data: { name: row.materialName.trim(), group: row.group ?? group, ...importedTaxonomy(row), currentStock: row.lastStock, stockReportDate: txDateObj, stockReportDirty: false, unit: 'kg' } })
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
          await tx.material.update({ where: { id: materialId }, data: { ...importedTaxonomy(row, materials.find(item => item.id === materialId)), currentStock: row.lastStock, stockReportDate: txDateObj, stockReportDirty: false } })
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
      return NextResponse.json({ success: false, code: 'STALE_REPORT', error: 'Báo cáo có xung đột; chưa ghi dữ liệu.', decisions: result.decisions }, { status: 409 })
    }
    return NextResponse.json({ success: true, materialsUpdated: result.created + result.replaced, transactionsCreated: result.transactionsCreated, created: result.created, replaced: result.replaced, unchanged: result.unchanged, skippedRows })
  } catch (error) {
    if (retryable(error)) return responseForConflict('STALE_PREVIEW', 'Thử xem trước lại.', [])
    console.error('[POST /api/materials/import-transactions/confirm]', error)
    return NextResponse.json({ success: false, code: 'DATABASE_ERROR', error: 'Không thể lưu báo cáo tồn kho.' }, { status: 500 })
  }
}
