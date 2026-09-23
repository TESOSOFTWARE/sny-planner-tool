// src/app/api/materials/import-transactions/route.ts
// Preview a selected material-report block. This route never writes.

import { createHash } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import {
  inspectMaterialBlocks,
  materialReportKey,
  normalizeMaterialName,
  parseMaterialReport,
  type MaterialGroupInput,
  type ParsedMaterialRow,
} from '@/lib/excel/parseMaterialReport'
import type { StockDecision } from '@/types'

const MAX_FILE_SIZE = 10 * 1024 * 1024

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function hashSnapshot(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function groupValue(value: FormDataEntryValue | null): MaterialGroupInput | null {
  return value === 'HDPE' || value === 'MB' || value === 'KOREA' ? value : null
}

function decisionError(code: string, error: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ success: false, code, error, ...extra }, { status: code === 'INVALID_INPUT' ? 422 : 409 })
}

export async function POST(req: NextRequest) {
  let formData: FormData
  try { formData = await req.formData() } catch {
    return NextResponse.json({ success: false, code: 'INVALID_INPUT', error: 'Không đọc được form data.' }, { status: 400 })
  }
  const file = formData.get('file')
  const group = groupValue(formData.get('group'))
  const txDate = String(formData.get('txDate') ?? '').trim()
  const headerRaw = String(formData.get('headerRow') ?? '').trim()
  const headerRow = headerRaw ? Number(headerRaw) : undefined
  if (!(file instanceof Blob) || !group || !validDate(txDate) || (headerRaw && (!Number.isInteger(headerRow) || (headerRow as number) < 1))) {
    return decisionError('INVALID_INPUT', 'Cần file, group và ngày báo cáo hợp lệ.')
  }
  const fileName = file instanceof File ? file.name : 'upload.xlsx'
  if (!fileName.toLowerCase().endsWith('.xlsx')) return decisionError('INVALID_INPUT', 'Chỉ chấp nhận file .xlsx.')
  if (file.size > MAX_FILE_SIZE) return decisionError('INVALID_INPUT', 'File phải nhỏ hơn hoặc bằng 10 MB.')

  let buffer: Buffer
  try { buffer = Buffer.from(await file.arrayBuffer()) } catch {
    return decisionError('INVALID_INPUT', 'Không đọc được file Excel.')
  }
  let blocks
  try {
    blocks = inspectMaterialBlocks(buffer, group)
  } catch (error) {
    return decisionError('INVALID_INPUT', error instanceof Error ? error.message : 'Không thể đọc block báo cáo.')
  }
  if (blocks.length === 0) return decisionError('INVALID_INPUT', 'Không tìm thấy block FIRST STOCK/LAST STOCK.')
  if (headerRow == null && blocks.length > 1) {
    return decisionError('BLOCK_REQUIRED', 'File có nhiều block, cần chọn block báo cáo.', { blocks })
  }
  let rows: ParsedMaterialRow[]
  try {
    rows = parseMaterialReport(buffer, group, headerRow ?? blocks[0].headerRow)
  } catch (error) {
    return decisionError('INVALID_INPUT', error instanceof Error ? error.message : 'Không thể đọc báo cáo.')
  }
  if (rows.length === 0 || rows.length > 500) return decisionError('INVALID_INPUT', 'Báo cáo phải có từ 1 đến 500 dòng vật tư.')

  const dbMaterials = await prisma.material.findMany({
    where: { group },
    include: {
      reportSnapshots: { orderBy: { reportDate: 'desc' }, take: 1 },
      transactions: { orderBy: { txDate: 'desc' }, take: 1 },
    },
  })
  const byName = new Map<string, typeof dbMaterials>()
  dbMaterials.forEach((material) => {
    const key = normalizeMaterialName(material.name)
    byName.set(key, [...(byName.get(key) ?? []), material])
  })

  const decisions: StockDecision[] = rows.map((row, rowIndex) => {
    const key = materialReportKey(group, row.materialName)
    if (!row.isValid) return { rowIndex, materialKey: key, materialId: null, status: 'invalid', reasons: row.validationErrors }
    const matches = byName.get(normalizeMaterialName(row.materialName)) ?? []
    if (matches.length > 1) return { rowIndex, materialKey: key, materialId: null, status: 'conflict', reasons: ['Có nhiều vật tư trong DB trùng tên sau khi chuẩn hóa'] }
    if (matches.length === 0) return { rowIndex, materialKey: key, materialId: null, status: 'new', reasons: [] }
    const material = matches[0]
    const snapshot = material.reportSnapshots[0]
    const latestTxDate = material.transactions[0]?.txDate.toISOString().slice(0, 10) ?? null
    if (material.stockReportDate && txDate < material.stockReportDate.toISOString().slice(0, 10)) {
      return { rowIndex, materialKey: key, materialId: material.id, status: 'conflict', reasons: ['Báo cáo cũ hơn tồn kho hiện tại (STALE_REPORT)'] }
    }
    if (latestTxDate && latestTxDate > txDate) {
      return { rowIndex, materialKey: key, materialId: material.id, status: 'conflict', reasons: ['Có giao dịch mới hơn ngày báo cáo (STALE_REPORT)'] }
    }
    if (snapshot && snapshot.reportDate.toISOString().slice(0, 10) === txDate) {
      const payload = snapshot.payload as Record<string, unknown>
      const same = Number(payload.firstStock) === row.firstStock && Number(payload.inQty) === row.inQty && Number(payload.outUsing) === row.outUsing && Number(payload.outBroken) === row.outBroken && Number(payload.outTape) === row.outTape && Number(payload.outReject) === row.outReject && Number(payload.lastStock) === row.lastStock && String(payload.materialName) === normalizeMaterialName(row.materialName)
      if (same) return { rowIndex, materialKey: key, materialId: material.id, status: 'identical', reasons: [] }
      if (material.stockReportDirty) return { rowIndex, materialKey: key, materialId: material.id, status: 'conflict', reasons: ['Đã có chỉnh tồn/giao dịch tay sau snapshot (SNAPSHOT_COVERED)'] }
      return { rowIndex, materialKey: key, materialId: material.id, status: 'replace', reasons: ['Bản sửa cùng ngày cần xác nhận thay thế'] }
    }
    const hasLegacyDateTx = material.transactions.some((tx) => tx.txDate.toISOString().slice(0, 10) === txDate)
    if (!snapshot && hasLegacyDateTx) return { rowIndex, materialKey: key, materialId: material.id, status: 'conflict', reasons: ['Đã có giao dịch lịch sử cùng ngày nhưng chưa có provenance'] }
    return { rowIndex, materialKey: key, materialId: material.id, status: 'replace', reasons: ['Sẽ thay snapshot tồn hiện tại bằng LAST STOCK'] }
  })

  const canonicalRows = rows.map((row, index) => ({
    key: decisions[index].materialKey,
    row: {
      materialName: normalizeMaterialName(row.materialName),
      firstStock: row.firstStock,
      inQty: row.inQty,
      outUsing: row.outUsing,
      outBroken: row.outBroken,
      outTape: row.outTape,
      outReject: row.outReject,
      lastStock: row.lastStock,
    },
    materialId: decisions[index].materialId,
    updatedAt: dbMaterials.find((material) => material.id === decisions[index].materialId)?.updatedAt.toISOString() ?? null,
    currentStock: dbMaterials.find((material) => material.id === decisions[index].materialId)?.currentStock.toString() ?? null,
    stockReportDate: dbMaterials.find((material) => material.id === decisions[index].materialId)?.stockReportDate?.toISOString().slice(0, 10) ?? null,
    stockReportDirty: dbMaterials.find((material) => material.id === decisions[index].materialId)?.stockReportDirty ?? false,
    snapshot: dbMaterials.find((material) => material.id === decisions[index].materialId)?.reportSnapshots[0] ? {
      id: dbMaterials.find((material) => material.id === decisions[index].materialId)?.reportSnapshots[0].id,
      hash: dbMaterials.find((material) => material.id === decisions[index].materialId)?.reportSnapshots[0].contentHash,
      version: dbMaterials.find((material) => material.id === decisions[index].materialId)?.reportSnapshots[0].version,
      reportDate: dbMaterials.find((material) => material.id === decisions[index].materialId)?.reportSnapshots[0].reportDate.toISOString().slice(0, 10),
    } : null,
    latestTxDate: dbMaterials.find((material) => material.id === decisions[index].materialId)?.transactions[0]?.txDate.toISOString().slice(0, 10) ?? null,
  })).sort((a, b) => a.key.localeCompare(b.key))
  const expectedSnapshot = hashSnapshot({ group, txDate, rows: canonicalRows })

  return NextResponse.json({
    success: true,
    rows,
    parsed: rows.length,
    matched: decisions.filter((decision) => decision.materialId != null).length,
    unmatched: decisions.filter((decision) => decision.materialId == null && decision.status === 'new').length,
    group,
    txDate,
    headerRow: headerRow ?? blocks[0].headerRow,
    expectedSnapshot,
    decisions,
  })
}
