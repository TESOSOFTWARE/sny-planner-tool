import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { bulkEditCommitSchema } from '@/lib/validations/bulkEdit'
import { prepareBulkEdit, StaleBulkSelection } from '@/lib/schedule/bulkEdit'
import { BulkPlanError } from '@/lib/schedule/bulkPlan'
import { scheduleDay } from '@/lib/schedule/importSafety'
import { factoryDateToISO } from '@/lib/schedule/assignmentDates'
import { lockForAssignmentRemoval } from '@/lib/schedule/removeAssignments'
import { isLockRetryable, ASSIGNMENT_RETRY_MESSAGE } from '@/lib/schedule/assignmentLock'

export const maxDuration = 60
export async function POST(request: Request) {
  let body: unknown
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Dữ liệu JSON không hợp lệ.' }, { status: 422 }) }
  const parsed = bulkEditCommitSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Dữ liệu sửa lịch hoặc bản xem trước không hợp lệ. Chọn tối đa 500 lịch khác nhau.' }, { status: 422 })
  const input = parsed.data
  try {
    return await prisma.$transaction(async tx => {
      await lockForAssignmentRemoval(tx)
      const { selected, plan, planHash } = await prepareBulkEdit(tx, input, scheduleDay(new Date()))
      if (planHash !== input.planHash) return NextResponse.json({ error: 'Lịch đã thay đổi, xem lại.', code: 'STALE_PLAN', plan, planHash }, { status: 409 })
      if (plan.conflicts.length) return NextResponse.json({ error: 'Có lịch bị trùng hoặc dời vào quá khứ. Chưa lưu thay đổi.', code: 'CONFLICT', conflicts: plan.conflicts }, { status: 409 })
      if (!plan.changes.length) return NextResponse.json({ updated: 0, logId: null })
      const changedIds = new Set(plan.changes.map(row => row.id))
      const log = await tx.scheduleImportLog.create({ data: {
        backupData: selected.filter(row => changedIds.has(row.id)).map(row => ({
          id: row.id, machineId: row.machineId, orderId: row.orderId, piNumber: row.order.piNumber,
          startDate: row.startDate.toISOString(), endDate: row.endDate.toISOString(),
          allocatedMeters: row.allocatedMeters?.toString() ?? null, estimatedDailyOutput: row.estimatedDailyOutput?.toString() ?? null,
          isPlaceholder: row.isPlaceholder, endDateSource: row.endDateSource,
        })),
        summary: { action: 'bulk-edit', command: input.command, params: input.command === 'MOVE_MACHINE' ? { targetMachineId: input.targetMachineId } : { workingDays: input.workingDays }, updated: plan.changes.length },
      }, select: { id: true } })
      for (const change of plan.changes) await tx.machineAssignment.update({ where: { id: change.id }, data: input.command === 'MOVE_MACHINE'
        ? { machineId: change.after.machineId }
        : { startDate: new Date(factoryDateToISO(change.after.startDate)), endDate: new Date(factoryDateToISO(change.after.endDate)) } })
      return NextResponse.json({ updated: plan.changes.length, logId: log.id })
    }, { timeout: 60_000, maxWait: 5_000 })
  } catch (error) {
    if (error instanceof StaleBulkSelection) return NextResponse.json({ error: error.message, code: 'STALE_SELECTION', missing: error.missing, changed: error.changed }, { status: 409 })
    if (error instanceof BulkPlanError) return NextResponse.json({ error: error.message }, { status: 422 })
    if (isLockRetryable(error)) return NextResponse.json({ error: ASSIGNMENT_RETRY_MESSAGE, retryable: true }, { status: 409 })
    console.error('[BULK_EDIT]', error)
    return NextResponse.json({ error: 'Không thể sửa lịch. Chưa lưu thay đổi, vui lòng thử lại.' }, { status: 500 })
  }
}
