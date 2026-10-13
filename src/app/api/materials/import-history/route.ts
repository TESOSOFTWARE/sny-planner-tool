// [MoM §3.1] Preview historical snapshots without inventory writes.
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { planHistoryImport, readHistoryFile } from '@/lib/materials/reportHistoryImport'
export async function POST(req: NextRequest) {
  let input: Awaited<ReturnType<typeof readHistoryFile>>
  try { input = await readHistoryFile(req) } catch (error) { return NextResponse.json({ success: false, code: 'INVALID_INPUT', error: error instanceof Error ? error.message : 'Không đọc được file Excel.' }, { status: 422 }) }
  try {
    const materials = await prisma.material.findMany({ where: { group: { in: ['HDPE', 'MB'] } }, select: { id: true, name: true, group: true, stockReportDate: true } })
    const snapshots = await prisma.materialReportSnapshot.findMany({ where: { materialId: { in: materials.map(material => material.id) }, reportDate: { in: Array.from(new Set(input.rows.map(row => row.reportDate))).map(date => new Date(`${date}T00:00:00.000Z`)) } }, select: { materialId: true, reportDate: true, payload: true } })
    try { return NextResponse.json(planHistoryImport(input.rows, materials, snapshots, input.file).preview) }
    catch (error) { return NextResponse.json({ success: false, code: 'INVALID_INPUT', error: error instanceof Error ? error.message : 'Báo cáo không hợp lệ.' }, { status: 422 }) }
  } catch { return NextResponse.json({ success: false, code: 'PREVIEW_FAILED', error: 'Không tải được dữ liệu để xem trước.' }, { status: 500 }) }
}
