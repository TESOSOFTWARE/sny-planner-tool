// [MoM §3.1] Preview monthly material snapshots and stock changes.
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { planHistoryImport, readHistoryFile } from '@/lib/materials/reportHistoryImport'
import { loadMonthlyHistoryState } from '@/lib/materials/monthlyHistoryState'

export async function POST(req: NextRequest) {
  let input: Awaited<ReturnType<typeof readHistoryFile>>
  try { input = await readHistoryFile(req) } catch (error) {
    return NextResponse.json({ success: false, code: 'INVALID_INPUT', error: error instanceof Error ? error.message : 'Không đọc được file Excel.' }, { status: 422 })
  }
  try {
    const state = await loadMonthlyHistoryState(prisma)
    try { return NextResponse.json(planHistoryImport(input.rows, state.materials, state.snapshots, input.file, input.resolutions, state.manualTransactions).preview) }
    catch (error) { return NextResponse.json({ success: false, code: 'INVALID_INPUT', error: error instanceof Error ? error.message : 'Báo cáo không hợp lệ.' }, { status: 422 }) }
  } catch { return NextResponse.json({ success: false, code: 'PREVIEW_FAILED', error: 'Không tải được dữ liệu để xem trước.' }, { status: 500 }) }
}
