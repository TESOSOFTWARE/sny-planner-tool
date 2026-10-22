import { withAssignmentLock, overlapWhere, isLockRetryable, ASSIGNMENT_RETRY_MESSAGE } from '@/lib/schedule/assignmentLock'
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createAssignmentSchema } from "@/lib/validations/assignment";
import { resolveAssignmentDates, factoryDateToISO, AssignmentDateError } from "@/lib/schedule/assignmentDates";
import { loadFactoryCalendar } from "@/lib/schedule/factoryCalendar";
import { scheduleDay } from "@/lib/schedule/importSafety";
import type { Prisma } from '@prisma/client';
import { sameSpecGroup } from '@/lib/schedule/specGroup';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const year = searchParams.get("year");
    const month = searchParams.get("month"); // 0-indexed month
    // Lọc theo đơn hàng cụ thể (dùng ở OrderDetail để hiển thị máy đang chạy)
    const orderId = searchParams.get("orderId");
    const orderIdsParam = searchParams.get("orderIds");
    const piNumber = searchParams.get('piNumber');

    let whereClause: Prisma.MachineAssignmentWhereInput = {};

    if (orderIdsParam !== null) {
      const ids = orderIdsParam.split(',').map(id => id.trim());
      if (ids.length > 500 || ids.some(id => !id)) {
        return NextResponse.json({ message: "Chọn từ 1 đến 500 mã đơn hợp lệ." }, { status: 400 });
      }
      whereClause = { orderId: { in: Array.from(new Set(ids)) } };
    } else if (orderId) {
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

    const { machineId, startDate, endDate, allocatedMeters, estimatedDailyOutput, endDateSource } = result.data;
    const orderIds = Array.from(new Set(result.data.orderIds ?? [result.data.orderId!]));
    const grouped = result.data.orderIds !== undefined;
    if (grouped && orderIds.length !== result.data.orderIds!.length) {
      return NextResponse.json({ message: "Danh sách dòng hàng bị trùng." }, { status: 400 });
    }
    let start = new Date(startDate);
    let end = new Date(endDate);

    if (start > end && endDateSource !== "COMPUTED") {
      return NextResponse.json(
        { message: "Start date must be before or equal to end date" },
        { status: 400 }
      );
    }

    // Fetch order(s) to check lifecycle and placeholder (+ quy cách để xếp chung)
    const targetOrders = await prisma.productionOrder.findMany({
      where: { id: { in: orderIds } },
      select: {
        id: true, isDraft: true, isPlaceholder: true, lifecycleStatus: true, piNumber: true,
        widthM: true, gsm: true, color: true, meshType: true, lengthM: true,
        _count: { select: { assignments: true } },
      },
    });

    if (targetOrders.length !== orderIds.length) {
      return NextResponse.json({ message: "Order not found" }, { status: 404 });
    }
    // Giữ đúng thứ tự client gửi
    const ordered = orderIds.map(id => targetOrders.find(o => o.id === id)!);
    const first = ordered[0];
    if (grouped && orderIds.length > 1) {
      if (!ordered.every(o => sameSpecGroup(o, first))) {
        return NextResponse.json({ message: "Các dòng xếp chung phải cùng PI, khổ, GSM, màu và loại lưới." }, { status: 400 });
      }
      if (ordered.some(o => o._count.assignments > 0)) {
        return NextResponse.json({ message: "Có dòng đã có lịch; chỉ xếp chung các dòng chưa có lịch." }, { status: 400 });
      }
      if (allocatedMeters != null) {
        return NextResponse.json({ message: "Xếp chung: số mét mỗi lịch lấy theo từng dòng, không nhập số mét chung." }, { status: 400 });
      }
    }
    // Tổng mét để tính ngày = tổng lengthM các dòng xếp chung
    const groupMeters = grouped && orderIds.length > 1
      ? ordered.reduce((sum, o) => sum + Number(o.lengthM ?? 0), 0)
      : undefined;
    if (groupMeters !== undefined && !(groupMeters > 0)) {
      return NextResponse.json({ message: "Các dòng xếp chung chưa có số mét." }, { status: 400 });
    }
    const datePlan = await resolveAssignmentDates({
      startDate: scheduleDay(start), endDate: scheduleDay(end),
      allocatedMeters: groupMeters ?? allocatedMeters, estimatedDailyOutput,
      computeEnd: endDateSource === 'COMPUTED', adjustStart: true,
      // Xếp mới: ngày kết thúc do người dùng chọn nên không cho rơi vào ngày nghỉ.
      rejectNonWorkingEnd: endDateSource !== 'COMPUTED',
    }, (from, to) => loadFactoryCalendar(prisma, from, to));
    if (datePlan.startDate !== scheduleDay(start)) start = new Date(factoryDateToISO(datePlan.startDate));
    if (endDateSource === 'COMPUTED') end = new Date(factoryDateToISO(datePlan.endDate));

    return await withAssignmentLock(async tx => {
      // Overlap check (applies equally to draft placeholders and official assignments).
      // Chỉ miễn chồng khi cùng máy + cùng nhóm quy cách; mọi trường hợp khác giữ 409.
      const existing = await tx.machineAssignment.findFirst({
        where: overlapWhere(machineId, scheduleDay(start), scheduleDay(end), [], first, orderIds),
      });

      if (existing) {
        return NextResponse.json(
          { message: "Máy đã được xếp lịch trong khoảng thời gian này" },
          { status: 409 }
        );
      }

      const created = [];
      for (const targetOrder of ordered) {
        // Đơn nháp hoặc đơn giữ chỗ lên máy dệt với cờ isPlaceholder = true như nhánh cũ
        const isPlaceholder = Boolean(
          targetOrder.isDraft ||
          targetOrder.lifecycleStatus === 'DRAFT' ||
          targetOrder.lifecycleStatus === 'RESERVED' ||
          targetOrder.lifecycleStatus === 'RESERVE' ||
          targetOrder.lifecycleStatus === 'PLACEHOLDER' ||
          targetOrder.isPlaceholder
        );
        // Xếp chung: mét từng lịch = lengthM của dòng đó; còn lại giữ như cũ.
        const meters = groupMeters !== undefined ? Number(targetOrder.lengthM ?? 0) : allocatedMeters;

        created.push(await tx.machineAssignment.create({
          data: {
            machineId,
            orderId: targetOrder.id,
            startDate: start,
            endDate: end,
            isPlaceholder,
            endDateSource: endDateSource ?? "MANUAL",
            ...(meters != null && meters > 0 && { allocatedMeters: meters }),
            ...(estimatedDailyOutput != null && { estimatedDailyOutput }),
          },
          include: {
            order: true,
          },
        }));
      }

      // orderId cũ: giữ nguyên dạng phản hồi (1 object). orderIds: mảng + warnings.
      return grouped
        ? NextResponse.json({ assignments: created, warnings: datePlan.warnings }, { status: 201 })
        : NextResponse.json({ ...created[0], warnings: datePlan.warnings }, { status: 201 });
    });  } catch (error: unknown) {
    if (error instanceof AssignmentDateError) return NextResponse.json({ message: error.message }, { status: 400 });
    if (isLockRetryable(error)) return NextResponse.json({ message: ASSIGNMENT_RETRY_MESSAGE, retryable: true }, { status: 409 });
    console.error("[POST_ASSIGNMENTS]", error);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}
