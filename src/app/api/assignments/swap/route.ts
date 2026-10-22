import { withAssignmentLock, overlapWhere, isLockRetryable, ASSIGNMENT_RETRY_MESSAGE, groupMateCount, GROUPED_ASSIGNMENT_MESSAGE } from '@/lib/schedule/assignmentLock'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { scheduleDay } from '@/lib/schedule/importSafety'

const swapSchema = z.object({ aId: z.string().min(1), bId: z.string().min(1) })

export async function POST(request: Request) {
  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ message: 'Nội dung yêu cầu không phải JSON hợp lệ.' }, { status: 400 })
  }
  const parsed = swapSchema.safeParse(body)
  if (!parsed.success || parsed.data.aId === parsed.data.bId) {
    return NextResponse.json({ message: 'Hãy chọn hai phân công khác nhau.' }, { status: 400 })
  }
  const { aId, bId } = parsed.data
  try {
    return await withAssignmentLock(async tx => {
      const a = await tx.machineAssignment.findUnique({ where: { id: aId }, include: { order: { select: { piNumber: true, widthM: true, gsm: true, color: true, meshType: true } } } })
      const b = await tx.machineAssignment.findUnique({ where: { id: bId }, include: { order: { select: { piNumber: true, widthM: true, gsm: true, color: true, meshType: true } } } })
      if (!a || !b) return NextResponse.json({ message: 'Không tìm thấy phân công.' }, { status: 404 })
      if (a.machineId === b.machineId) return NextResponse.json({ message: 'Hai phân công phải ở hai máy khác nhau.' }, { status: 400 })
      const today = scheduleDay(new Date())
      if (scheduleDay(a.startDate) <= today || scheduleDay(b.startDate) <= today) {
        return NextResponse.json({ message: 'Chỉ được đảo các phân công chưa bắt đầu.' }, { status: 400 })
      }
      for (const source of [a, b]) {
        const mates = await groupMateCount(tx, source)
        if (mates > 0) return NextResponse.json({ message: GROUPED_ASSIGNMENT_MESSAGE(mates) }, { status: 400 })
      }
      for (const [source, targetMachineId] of [[a, b.machineId], [b, a.machineId]] as const) {
        const overlap = await tx.machineAssignment.findFirst({
          where: overlapWhere(targetMachineId, scheduleDay(source.startDate), scheduleDay(source.endDate), [aId, bId], source.order, [source.orderId]),
          include: { order: { select: { piNumber: true } } },
        })
        if (overlap) return NextResponse.json({
          message: `Máy ${targetMachineId} đã có PI ${overlap.order.piNumber} từ ${scheduleDay(overlap.startDate).split('-').reverse().join('/')} đến ${scheduleDay(overlap.endDate).split('-').reverse().join('/')}.`,
          conflict: { piNumber: overlap.order.piNumber, machineId: targetMachineId, startDate: overlap.startDate.toISOString(), endDate: overlap.endDate.toISOString() },
        }, { status: 409 })
      }
      const updatedA = await tx.machineAssignment.update({ where: { id: aId }, data: { machineId: b.machineId }, include: { order: true } })
      const updatedB = await tx.machineAssignment.update({ where: { id: bId }, data: { machineId: a.machineId }, include: { order: true } })
      return NextResponse.json({ success: true, assignments: [updatedA, updatedB] })
    })
  } catch (error: unknown) {
    if (isLockRetryable(error)) return NextResponse.json({ message: ASSIGNMENT_RETRY_MESSAGE, retryable: true }, { status: 409 })
    console.error("[SWAP_ASSIGNMENTS]", error)
    return NextResponse.json({ message: 'Không thể đảo máy. Vui lòng thử lại.' }, { status: 500 })
  }
}
