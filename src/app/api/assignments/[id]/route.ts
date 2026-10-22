import { withAssignmentLock, overlapWhere, isLockRetryable, ASSIGNMENT_RETRY_MESSAGE } from '@/lib/schedule/assignmentLock'
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { updateAssignmentSchema } from "@/lib/validations/assignment";
import { resolveAssignmentDates, factoryDateToISO, AssignmentDateError } from "@/lib/schedule/assignmentDates";
import { loadFactoryCalendar } from "@/lib/schedule/factoryCalendar";
import { scheduleDay } from "@/lib/schedule/importSafety";
import type { SpecOrder } from '@/lib/schedule/specGroup'
import { lockForAssignmentRemoval, removeAssignments } from '@/lib/schedule/removeAssignments'

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const id = params.id;

    if (!id) {
      return NextResponse.json({ message: "ID is required" }, { status: 400 });
    }

    const result = await prisma.$transaction(async tx => {
      await lockForAssignmentRemoval(tx)
      return removeAssignments(tx, [id])
    }, { timeout: 60_000, maxWait: 5_000 })
    if (result.missing.length) return NextResponse.json({ message: 'Không tìm thấy phân công.' }, { status: 404 })
    if (result.protected.length) return NextResponse.json({ message: `Không gỡ được: máy ${result.protected[0].machineId} đã có sản lượng trong khoảng ngày này.` }, { status: 409 })
    return NextResponse.json({ success: true, logId: result.logId });
  } catch (error: unknown) {
    console.error("[DELETE_ASSIGNMENT]", error);
    if (isLockRetryable(error)) return NextResponse.json({ message: ASSIGNMENT_RETRY_MESSAGE, retryable: true }, { status: 409 });
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const id = params.id;
    if (!id) return NextResponse.json({ message: "ID is required" }, { status: 400 });

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ message: "Nội dung yêu cầu không phải JSON hợp lệ." }, { status: 400 });
    }
    const result = updateAssignmentSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json({
        message: "Thông tin phân công không hợp lệ.",
        errors: result.error.issues,
      }, { status: 400 });
    }
    const { machineId, orderId, startDate, endDate, allocatedMeters, estimatedDailyOutput, endDateSource } = result.data;

    return await withAssignmentLock(async tx => {
      const existing = await tx.machineAssignment.findUnique({
        where: { id },
        include: { order: { select: { piNumber: true, widthM: true, gsm: true, color: true, meshType: true } } },
      });

      if (!existing) {
        return NextResponse.json({ message: "Assignment not found" }, { status: 404 });
      }

      const targetMachineId = machineId || existing.machineId;
      if (targetMachineId !== existing.machineId && scheduleDay(existing.startDate) <= scheduleDay(new Date())) {
        return NextResponse.json({ message: "Phân công đã bắt đầu; hãy dùng chế độ Máy hư để chuyển phần còn lại." }, { status: 400 });
      }
      const targetOrderId = orderId || existing.orderId;
      let start = startDate ? new Date(startDate) : existing.startDate;
      let end = endDate ? new Date(endDate) : existing.endDate;

      if (start > end && endDateSource !== "COMPUTED") {
        return NextResponse.json(
          { message: "Start date must be before or equal to end date" },
          { status: 400 }
        );
      }

      // Check target order if orderId changed
      let isPlaceholder = existing.isPlaceholder;
      let group: SpecOrder | null | undefined = existing.order;
      if (orderId && orderId !== existing.orderId) {
        const targetOrder = await tx.productionOrder.findUnique({
          where: { id: orderId },
          select: { isDraft: true, lifecycleStatus: true, isPlaceholder: true, piNumber: true, widthM: true, gsm: true, color: true, meshType: true },
        });
        if (!targetOrder) {
          return NextResponse.json({ message: "Order not found" }, { status: 404 });
        }
        group = targetOrder;
        isPlaceholder = Boolean(
          targetOrder.isDraft ||
          targetOrder.lifecycleStatus === 'DRAFT' ||
          targetOrder.lifecycleStatus === 'RESERVED' ||
          targetOrder.lifecycleStatus === 'RESERVE' ||
          targetOrder.lifecycleStatus === 'PLACEHOLDER' ||
          targetOrder.isPlaceholder
        );
      }

      const datePlan = await resolveAssignmentDates({
        startDate: scheduleDay(start), endDate: scheduleDay(end),
        allocatedMeters: allocatedMeters !== undefined ? allocatedMeters : existing.allocatedMeters?.toString(),
        estimatedDailyOutput: estimatedDailyOutput !== undefined ? estimatedDailyOutput : existing.estimatedDailyOutput?.toString(),
        computeEnd: endDateSource === 'COMPUTED',
        adjustStart: endDateSource === 'COMPUTED' || scheduleDay(start) !== scheduleDay(existing.startDate),
        // Chỉ chặn khi người dùng thực sự ĐỔI ngày kết thúc. Bản ghi cũ/import giữ
        // nguyên ngày đã lưu để không khoá việc sửa các trường khác.
        rejectNonWorkingEnd:
          endDateSource !== 'COMPUTED' && scheduleDay(end) !== scheduleDay(existing.endDate),
      }, (from, to) => loadFactoryCalendar(tx, from, to));
      if (datePlan.startDate !== scheduleDay(start)) start = new Date(factoryDateToISO(datePlan.startDate));
      if (endDateSource === 'COMPUTED') end = new Date(factoryDateToISO(datePlan.endDate));

      // Overlap check on target machine and date range, excluding current assignment
      const overlap = await tx.machineAssignment.findFirst({
        where: overlapWhere(targetMachineId, scheduleDay(start), scheduleDay(end), [id], group, [targetOrderId]),
        include: { order: { select: { piNumber: true } } },
      });

      if (overlap) {
        return NextResponse.json(
          {
            message: "Máy " + targetMachineId + " đã có PI " + overlap.order.piNumber + " từ " +
              overlap.startDate.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) + " đến " +
              overlap.endDate.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) + ".",
            conflict: {
              piNumber: overlap.order.piNumber,
              machineId: overlap.machineId,
              startDate: overlap.startDate.toISOString(),
              endDate: overlap.endDate.toISOString(),
            },
          },
          { status: 409 }
        );
      }

      const updated = await tx.machineAssignment.update({
        where: { id },
        data: {
          machineId: targetMachineId,
          orderId: targetOrderId,
          startDate: start,
          endDate: end,
          isPlaceholder,
          endDateSource: endDateSource ?? (endDate !== undefined && scheduleDay(end) !== scheduleDay(existing.endDate) ? "MANUAL" : existing.endDateSource ?? "MANUAL"),
          ...(allocatedMeters !== undefined && { allocatedMeters }),
          // Cập nhật sản lượng dự kiến nếu client gửi lên (undefined = giữ nguyên)
          ...(estimatedDailyOutput !== undefined && {
            estimatedDailyOutput: estimatedDailyOutput === null ? null : estimatedDailyOutput,
          }),
        },
        include: { order: true },
      });

      return NextResponse.json({ ...updated, warnings: datePlan.warnings });
    });
  } catch (error: unknown) {
    if (error instanceof AssignmentDateError) return NextResponse.json({ message: error.message }, { status: 400 });
    if (isLockRetryable(error)) return NextResponse.json({ message: ASSIGNMENT_RETRY_MESSAGE, retryable: true }, { status: 409 });
    console.error("[PATCH_ASSIGNMENT]", error);
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
      return NextResponse.json({ message: "Order is already assigned to a machine" }, { status: 409 });
    }
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}
