// [MoM §3.1; D1=B] Atomic snapshot-only history import.
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { planHistoryImport, readHistoryFile } from '@/lib/materials/reportHistoryImport'

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
      await tx.$executeRawUnsafe('LOCK TABLE "material_report_snapshots" IN SHARE ROW EXCLUSIVE MODE')
      const materials = await tx.material.findMany({ where: { group: { in: ['HDPE', 'MB'] } }, select: { id: true, name: true, group: true, stockReportDate: true } })
      const snapshots = await tx.materialReportSnapshot.findMany({ where: { materialId: { in: materials.map(material => material.id) }, reportDate: { in: Array.from(new Set(input.rows.map(row => row.reportDate))).map(date => new Date(`${date}T00:00:00.000Z`)) } }, select: { materialId: true, reportDate: true, payload: true } })
      let plan: ReturnType<typeof planHistoryImport>
      try { plan = planHistoryImport(input.rows, materials, snapshots, input.file) } catch (error) { throw new InvalidHistory(error instanceof Error ? error.message : 'Báo cáo không hợp lệ.') }
      if (plan.preview.expectedSnapshot !== input.expectedSnapshot) throw new StaleHistoryPreview()
      const created = plan.writes.length ? (await tx.materialReportSnapshot.createMany({ data: plan.writes })).count : 0
      return { success: true, created, totalRows: plan.preview.totalRows, counts: plan.preview.counts }
    }, { maxWait: 5000, timeout: 30000 })
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof StaleHistoryPreview) return NextResponse.json({ success: false, code: 'STALE_PREVIEW', error: 'Dữ liệu đã thay đổi sau khi xem trước; vui lòng xem trước lại.' }, { status: 409 })
    if (error instanceof InvalidHistory) return NextResponse.json({ success: false, code: 'INVALID_INPUT', error: error.message }, { status: 422 })
    if (lockUnavailable(error)) return NextResponse.json({ success: false, code: 'LOCK_UNAVAILABLE', error: 'Đang có thao tác khác, vui lòng thử lại.' }, { status: 409 })
    return NextResponse.json({ success: false, code: 'IMPORT_FAILED', error: 'Không thể nhập lịch sử; không có thay đổi được lưu.' }, { status: 500 })
  }
}
