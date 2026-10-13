import { withAssignmentLock, overlapWhere, isLockRetryable, ASSIGNMENT_RETRY_MESSAGE } from '@/lib/schedule/assignmentLock'
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createAssignmentSchema } from "@/lib/validations/assignment";
import { resolveAssignmentDates, factoryDateToISO, AssignmentDateError } from "@/lib/schedule/assignmentDates";
import { loadFactoryCalendar } from "@/lib/schedule/factoryCalendar";
import { scheduleDay } from "@/lib/schedule/importSafety";
import type { Prisma } from '@prisma/client';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const year = searchParams.get("year");
    const month = searchParams.get("month"); // 0-indexed month
    // Lọc theo đơn hàng cụ thể (dùng ở OrderDetail để hiển thị máy đang chạy)
    const orderId = searchParams.get("orderId");
    const piNumber = searchParams.get('piNumber');

    let whereClause: Prisma.MachineAssignmentWhereInput = {};

    if (orderId) {
      whereClause = { orderId };
    } else if (piNumber) {
      whereClause = { order: { piNumber } };
    } else if (year && month) {
      const y = parseInt(year, 10);
      const m = parseInt(month, 10);

      if (!isNaN(y) && !isNaN(m)) {
        // Construct Vietnam time boundary
        // Start of month
        const monthStartStr = `${y}-${String(m + 1).padStart(2, '0')}-01T00:00:00+07:00`;
        const monthStart = new Date(monthStartStr);

        // Start of next month
        const nextMonthM = m === 11 ? 0 : m + 1;
        const nextMonthY = m === 11 ? y + 1 : y;
        const nextMonthStartStr = `${nextMonthY}-${String(nextMonthM + 1).padStart(2, '0')}-01T00:00:00+07:00`;
        const nextMonthStart = new Date(nextMonthStartStr);

        whereClause = {
          startDate: { lt: nextMonthStart },
          endDate: { gte: monthStart },
        };
      }
    }

    const assignments = await prisma.machineAssignment.findMany({
      where: whereClause,
      include: {
        order: {
          select: {
            id: true,
            piNumber: true,
            subLineIndex: true,
            isPlaceholder: true,
            itemCode: true,
            customer: true,
            status: true,
            isDraft: true,
            widthM: true,
            lengthM: true,
            orderType: true,
            rollLength: true,
            pieceLength: true,
            gsm: true,
            color: true,
            mbCode: true,
            qty: true,
            meshType: true,
            description: true,
            needleCount: true,
            hasEyelet: true,
            eyeletColor: true,
            totalWeightKgs: true,
          },
        },
      },
      orderBy: { startDate: 'asc' },
    });

    return NextResponse.json(assignments);
  } catch (error) {
    console.error("[GET_ASSIGNMENTS]", error);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = createAssignmentSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { message: "Invalid input", errors: result.error.issues },
        { status: 400 }
      );
    }

    const { machineId, orderId, startDate, endDate, allocatedMeters, estimatedDailyOutput, endDateSource } = result.data;
    let start = new Date(startDate);
    let end = new Date(endDate);

    if (start > end && endDateSource !== "COMPUTED") {
      return NextResponse.json(
        { message: "Start date must be before or equal to end date" },
        { status: 400 }
      );
    }

    // Fetch order to check lifecycle and placeholder
    const targetOrder = await prisma.productionOrder.findUnique({
      where: { id: orderId },
      select: { isDraft: true, isPlaceholder: true, lifecycleStatus: true, piNumber: true },
    });

    if (!targetOrder) {
      return NextResponse.json({ message: "Order not found" }, { status: 404 });
    }

    const datePlan = await resolveAssignmentDates({
      startDate: scheduleDay(start), endDate: scheduleDay(end),
      allocatedMeters, estimatedDailyOutput,
      computeEnd: endDateSource === 'COMPUTED', adjustStart: true,
      // Xếp mới: ngày kết thúc do người dùng chọn nên không cho rơi vào ngày nghỉ.
      rejectNonWorkingEnd: endDateSource !== 'COMPUTED',
    }, (from, to) => loadFactoryCalendar(prisma, from, to));
    if (datePlan.startDate !== scheduleDay(start)) start = new Date(factoryDateToISO(datePlan.startDate));
    if (endDateSource === 'COMPUTED') end = new Date(factoryDateToISO(datePlan.endDate));

    return await withAssignmentLock(async tx => {
      // Overlap check (applies equally to draft placeholders and official assignments)
      const existing = await tx.machineAssignment.findFirst({
        where: overlapWhere(machineId, scheduleDay(start), scheduleDay(end)),
      });

      if (existing) {
        return NextResponse.json(
          { message: "Máy đã được xếp lịch trong khoảng thời gian này" },
          { status: 409 }
        );
      }

      // Đơn nháp hoặc đơn giữ chỗ lên máy dệt với cờ isPlaceholder = true như nhánh cũ
      const isPlaceholder = Boolean(
        targetOrder.isDraft ||
        targetOrder.lifecycleStatus === 'DRAFT' ||
        targetOrder.lifecycleStatus === 'RESERVED' ||
        targetOrder.lifecycleStatus === 'RESERVE' ||
        targetOrder.lifecycleStatus === 'PLACEHOLDER' ||
        targetOrder.isPlaceholder
      );

      const assignment = await tx.machineAssignment.create({
        data: {
          machineId,
          orderId,
          startDate: start,
          endDate: end,
          isPlaceholder,
          endDateSource: endDateSource ?? "MANUAL",
          ...(allocatedMeters != null && { allocatedMeters }),
          ...(estimatedDailyOutput != null && { estimatedDailyOutput }),
        },
        include: {
          order: true,
        },
      });

      return NextResponse.json({ ...assignment, warnings: datePlan.warnings }, { status: 201 });
    });
  } catch (error: unknown) {
    if (error instanceof AssignmentDateError) return NextResponse.json({ message: error.message }, { status: 400 });
    if (isLockRetryable(error)) return NextResponse.json({ message: ASSIGNMENT_RETRY_MESSAGE, retryable: true }, { status: 409 });
    console.error("[POST_ASSIGNMENTS]", error);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}
