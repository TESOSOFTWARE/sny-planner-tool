import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { lockForAssignmentRemoval, removeAssignments } from '@/lib/schedule/removeAssignments'
import { isLockRetryable, ASSIGNMENT_RETRY_MESSAGE } from '@/lib/schedule/assignmentLock'

export const maxDuration = 60
const schema = z.object({ assignments: z.array(z.object({ id: z.string().min(1), updatedAt: z.string().datetime({ offset: true }) }).strict()).min(1).max(500) }).strict()
  .refine(body => new Set(body.assignments.map(row => row.id)).size === body.assignments.length, 'Phân công trùng ID')

class StaleSelection extends Error {
  constructor(public missing: string[], public changed: string[]) { super('Lịch đã thay đổi, tải lại và chọn lại') }
}

// [FB 15/10 #2] Only the explicitly confirmed IDs; never derive extra rows from a month.
export async function POST(request: Request) {
  let body: unknown
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Dữ liệu JSON không hợp lệ.' }, { status: 422 }) }
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Chọn từ 1 đến 500 phân công khác nhau, có thời điểm cập nhật hợp lệ.' }, { status: 422 })
  try {
    const result = await prisma.$transaction(async tx => {
      await lockForAssignmentRemoval(tx)
      const snapshot = parsed.data.assignments
      const rows = await tx.machineAssignment.findMany({ where: { id: { in: snapshot.map(row => row.id) } }, select: { id: true, updatedAt: true } })
      const byId = new Map(rows.map(row => [row.id, row]))
      const missing = snapshot.filter(row => !byId.has(row.id)).map(row => row.id)
      const changed = snapshot.filter(row => byId.has(row.id) && byId.get(row.id)!.updatedAt.getTime() !== new Date(row.updatedAt).getTime()).map(row => row.id)
      if (missing.length || changed.length) throw new StaleSelection(missing, changed)
      return removeAssignments(tx, snapshot.map(row => row.id))
    }, { timeout: 60_000, maxWait: 5_000 })
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof StaleSelection) return NextResponse.json({ error: error.message, code: 'STALE_SELECTION', missing: error.missing, changed: error.changed }, { status: 409 })
    if (isLockRetryable(error)) return NextResponse.json({ error: ASSIGNMENT_RETRY_MESSAGE, retryable: true }, { status: 409 })
    console.error('[BULK_REMOVE_ASSIGNMENTS]', error)
    return NextResponse.json({ error: 'Không thể gỡ phân công. Vui lòng thử lại.' }, { status: 500 })
  }
}
