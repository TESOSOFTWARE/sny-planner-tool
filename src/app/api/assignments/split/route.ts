import { withAssignmentLock, overlapWhere, isLockRetryable, ASSIGNMENT_RETRY_MESSAGE } from '@/lib/schedule/assignmentLock'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { loadFactoryCalendar } from '@/lib/schedule/factoryCalendar'
import { scheduleDay } from '@/lib/schedule/importSafety'
import { estimateWovenBeforeStop, validSplitPlanningValue } from '@/lib/schedule/estimatedWoven'
import { AssignmentDateError, factoryDateToISO, resolveAssignmentDates } from '@/lib/schedule/assignmentDates'

const label = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const splitSchema = z.strictObject({
  id: z.string().min(1), stopDate: label, targetStartDate: label,
  targetMachineId: z.string().regex(/^M-0(0[1-9]|[1-3][0-9]|40)$/),
  // Source fields are validated only when the corresponding stored value is
  // missing. A caller cannot replace a source value already saved on the row.
  sourceAllocatedMeters: z.unknown().optional(), sourceDailyOutput: z.unknown().optional(),
  targetDailyOutput: z.number().refine(validSplitPlanningValue).optional(),
})

async function splitAssignment(request: Request, now: Date) {
  let body: unknown
  try { body = await request.json() } catch { return NextResponse.json({ message: 'Nội dung yêu cầu không phải JSON hợp lệ.' }, { status: 400 }) }
  const parsed = splitSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ message: 'Cần ngày chuyển hợp lệ; số mét và năng suất lớn hơn 0, tối đa 2 chữ số thập phân.' }, { status: 400 })
  const input = parsed.data
  if (input.targetStartDate < input.stopDate) return NextResponse.json({ message: 'Ngày bắt đầu máy đích không được trước ngày dừng.' }, { status: 400 })
  try {
    return await withAssignmentLock(async tx => {
      const existing = await tx.machineAssignment.findUnique({ where: { id: input.id } })
      if (!existing) return NextResponse.json({ message: 'Không tìm thấy phân công.' }, { status: 404 })
      if (scheduleDay(existing.startDate) > scheduleDay(now)) return NextResponse.json({ message: 'Phân công chưa bắt đầu; dùng chế độ Chuyển máy.' }, { status: 400 })
      const start = scheduleDay(existing.startDate), end = scheduleDay(existing.endDate)
      if (input.stopDate < start || input.stopDate > end) return NextResponse.json({ message: 'Ngày dừng phải nằm trong lịch phân công.' }, { status: 400 })
      if (input.targetMachineId === existing.machineId) return NextResponse.json({ message: 'Hãy chọn máy đích khác máy hiện tại.' }, { status: 400 })
      const sourceAllocatedMetersFromStored = existing.allocatedMeters != null
      const sourceDailyOutputFromStored = existing.estimatedDailyOutput != null
      const sourceAllocatedMetersUsed = sourceAllocatedMetersFromStored ? Number(existing.allocatedMeters) : input.sourceAllocatedMeters
      const sourceDailyOutputUsed = sourceDailyOutputFromStored ? Number(existing.estimatedDailyOutput) : input.sourceDailyOutput
      if (typeof sourceAllocatedMetersUsed !== 'number' || !validSplitPlanningValue(sourceAllocatedMetersUsed)
        || typeof sourceDailyOutputUsed !== 'number' || !validSplitPlanningValue(sourceDailyOutputUsed)) {
        return NextResponse.json({ message: 'Cần số mét phân công và năng suất máy cũ hợp lệ: lớn hơn 0, tối đa 2 chữ số thập phân. Chỉ nhập bổ sung trường chưa có số.' }, { status: 400 })
      }
      const targetDailyOutputUsed = input.targetDailyOutput ?? sourceDailyOutputUsed
      const calendar = await loadFactoryCalendar(tx, start, input.stopDate)
      const estimate = estimateWovenBeforeStop(calendar, start, input.stopDate, sourceAllocatedMetersUsed, sourceDailyOutputUsed)
      if (!estimate) return NextResponse.json({ message: 'Ngày dừng hoặc thông số ước tính không hợp lệ.' }, { status: 400 })
      if (estimate.remainingMeters <= 0) return NextResponse.json({ message: 'Không còn mét để chuyển.' }, { status: 400 })
      const plan = await resolveAssignmentDates({ startDate: input.targetStartDate, allocatedMeters: estimate.remainingMeters,
        estimatedDailyOutput: targetDailyOutputUsed, computeEnd: true, adjustStart: true },
      (from, to) => loadFactoryCalendar(tx, from, to))
      const overlap = await tx.machineAssignment.findFirst({
        where: overlapWhere(input.targetMachineId, plan.startDate, plan.endDate, [input.id]),
        include: { order: { select: { piNumber: true } } },
      })
      if (overlap) return NextResponse.json({
        message: `Máy ${input.targetMachineId} đã có PI ${overlap.order.piNumber} từ ${scheduleDay(overlap.startDate).split('-').reverse().join('/')} đến ${scheduleDay(overlap.endDate).split('-').reverse().join('/')}.`,
        conflict: { piNumber: overlap.order.piNumber, machineId: input.targetMachineId, startDate: overlap.startDate.toISOString(), endDate: overlap.endDate.toISOString() },
      }, { status: 409 })
      const targetData = { machineId: input.targetMachineId, startDate: new Date(factoryDateToISO(plan.startDate)),
        endDate: new Date(factoryDateToISO(plan.endDate)), allocatedMeters: estimate.remainingMeters,
        estimatedDailyOutput: targetDailyOutputUsed, endDateSource: 'COMPUTED' as const }
      const assignments = []
      if (estimate.estimatedWovenMeters === 0) {
        assignments.push(await tx.machineAssignment.update({ where: { id: existing.id }, data: targetData, include: { order: true } }))
      } else {
        assignments.push(await tx.machineAssignment.update({ where: { id: existing.id }, data: {
          endDate: new Date(factoryDateToISO(estimate.lastWorkingDate!)), allocatedMeters: estimate.estimatedWovenMeters,
          ...(sourceDailyOutputFromStored ? {} : { estimatedDailyOutput: sourceDailyOutputUsed }), endDateSource: 'COMPUTED',
        }, include: { order: true } }))
        assignments.push(await tx.machineAssignment.create({ data: { ...targetData, orderId: existing.orderId, isPlaceholder: existing.isPlaceholder }, include: { order: true } }))
      }
      return NextResponse.json({ success: true, estimateSource: 'Ước tính theo lịch', estimatedWovenMeters: estimate.estimatedWovenMeters,
        remainingMeters: estimate.remainingMeters, movedWholeAssignment: estimate.estimatedWovenMeters === 0,
        sourceAllocatedMetersUsed, sourceDailyOutputUsed, targetDailyOutputUsed,
        sourceAllocatedMetersFromStored, sourceDailyOutputFromStored, assignments })
    })
  } catch (error) {
    if (error instanceof AssignmentDateError) return NextResponse.json({ message: error.message }, { status: 400 })
    if (isLockRetryable(error)) return NextResponse.json({ message: ASSIGNMENT_RETRY_MESSAGE, retryable: true }, { status: 409 })
    console.error("[SPLIT_ASSIGNMENT]", error)
    return NextResponse.json({ message: 'Không thể chuyển phần còn lại. Vui lòng thử lại.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  return splitAssignment(request, new Date())
}
