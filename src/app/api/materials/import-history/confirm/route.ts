// [MoM §3.1] Atomic monthly snapshot import.
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { planHistoryImport, readHistoryFile } from '@/lib/materials/reportHistoryImport'
import { loadMonthlyHistoryState } from '@/lib/materials/monthlyHistoryState'
import { importedTaxonomy } from '@/lib/materials/reportPayload'

class StaleHistoryPreview extends Error {}
class InvalidHistory extends Error {}
function lockUnavailable(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const value = error as { code?: unknown; meta?: { code?: unknown } }
  return value.code === '55P03' || value.code === 'P2028' || value.code === 'P2034' || value.meta?.code === '55P03'
}
export async function POST(req: NextRequest) {
  let input: Awaited<ReturnType<typeof readHistoryFile>>
  try {
    input = await readHistoryFile(req)
    if (!/^[a-f0-9]{64}$/.test(input.expectedSnapshot)) throw new Error('Cần xem trước báo cáo trước khi xác nhận.')
  } catch (error) { return NextResponse.json({ success: false, code: 'INVALID_INPUT', error: error instanceof Error ? error.message : 'Không đọc được file Excel.' }, { status: 422 }) }
  try {
    const result = await prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '5s'")
      await tx.$executeRawUnsafe('LOCK TABLE "materials" IN SHARE ROW EXCLUSIVE MODE')
      await tx.$executeRawUnsafe('LOCK TABLE "material_transactions" IN SHARE ROW EXCLUSIVE MODE')
      await tx.$executeRawUnsafe('LOCK TABLE "material_report_snapshots" IN SHARE ROW EXCLUSIVE MODE')
      const state = await loadMonthlyHistoryState(tx)
      let plan: ReturnType<typeof planHistoryImport>
      try { plan = planHistoryImport(input.rows, state.materials, state.snapshots, input.file, input.resolutions, state.manualTransactions) }
      catch (error) { throw new InvalidHistory(error instanceof Error ? error.message : 'Báo cáo không hợp lệ.') }
      if (plan.preview.expectedSnapshot !== input.expectedSnapshot) throw new StaleHistoryPreview()
      const createdIds = new Map<string, string>()
      for (const [key, row] of Array.from(plan.creations.entries())) {
        if (!plan.writes.some(write => write.materialId === 'new:' + key)) continue
        const material = await tx.material.create({ data: { name: row.materialName.trim(), group: row.group, ...importedTaxonomy(row), currentStock: 0, stockReportDate: null, stockReportDirty: false, unit: 'kg' } })
        createdIds.set('new:' + key, material.id)
      }
      const data = plan.writes.map(write => ({ ...write, materialId: createdIds.get(write.materialId) ?? write.materialId }))
      const created = data.length ? (await tx.materialReportSnapshot.createMany({ data })).count : 0
      for (const update of plan.stockUpdates) {
        const materialId = createdIds.get(update.materialId) ?? update.materialId
        await tx.material.update({ where: { id: materialId }, data: { currentStock: update.to.stock, stockReportDate: new Date(update.to.date + 'T00:00:00.000Z'), stockReportDirty: false } })
      }
      return { success: true, created, materialsCreated: createdIds.size, stockUpdated: plan.stockUpdates.map(update => ({ ...update, materialId: createdIds.get(update.materialId) ?? update.materialId })), stockKept: plan.stockKept, totalRows: plan.preview.totalRows, counts: plan.preview.counts }
    }, { maxWait: 5000, timeout: 30000 })
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof StaleHistoryPreview) return NextResponse.json({ success: false, code: 'STALE_PREVIEW', error: 'Dữ liệu đã thay đổi sau khi xem trước; vui lòng xem trước lại.' }, { status: 409 })
    if (error instanceof InvalidHistory) return NextResponse.json({ success: false, code: 'INVALID_INPUT', error: error.message }, { status: 422 })
    if (lockUnavailable(error)) return NextResponse.json({ success: false, code: 'LOCK_UNAVAILABLE', error: 'Đang có thao tác khác, vui lòng thử lại.' }, { status: 409 })
    return NextResponse.json({ success: false, code: 'IMPORT_FAILED', error: 'Không thể nhập lịch sử; không có thay đổi được lưu.' }, { status: 500 })
  }
}
