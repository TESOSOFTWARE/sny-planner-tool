import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { bulkEditSchema } from '@/lib/validations/bulkEdit'
import { prepareBulkEdit, StaleBulkSelection } from '@/lib/schedule/bulkEdit'
import { BulkPlanError } from '@/lib/schedule/bulkPlan'
import { scheduleDay } from '@/lib/schedule/importSafety'

export const maxDuration = 60
export async function POST(request: Request) {
  let body: unknown
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Dữ liệu JSON không hợp lệ.' }, { status: 422 }) }
  const parsed = bulkEditSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Chọn 1–500 lịch khác nhau; máy đích hợp lệ hoặc số ngày nguyên khác 0, tối đa 60 ngày.' }, { status: 422 })
  try {
    const { plan, planHash } = await prepareBulkEdit(prisma, parsed.data, scheduleDay(new Date()))
    return NextResponse.json({ plan, planHash })
  } catch (error) {
    if (error instanceof StaleBulkSelection) return NextResponse.json({ error: error.message, code: 'STALE_SELECTION', missing: error.missing, changed: error.changed }, { status: 409 })
    if (error instanceof BulkPlanError) return NextResponse.json({ error: error.message }, { status: 422 })
    console.error('[BULK_EDIT_PREVIEW]', error)
    return NextResponse.json({ error: 'Không tải được bản xem trước. Vui lòng thử lại.' }, { status: 500 })
  }
}
