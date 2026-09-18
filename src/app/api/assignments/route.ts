import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createAssignmentSchema } from "@/lib/validations/assignment";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const year = searchParams.get("year");
    const month = searchParams.get("month"); // 0-indexed month
    // Lọc theo đơn hàng cụ thể (dùng ở OrderDetail để hiển thị máy đang chạy)
    const orderId = searchParams.get("orderId");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let whereClause: any = {};

    if (orderId) {
      whereClause = { orderId };
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
            customer: true,
            status: true,
            isDraft: true,
            widthM: true,
            lengthM: true,
            gsm: true,
            color: true,
            mbCode: true,
            qty: true,
            meshType: true,
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

    const { machineId, orderId, startDate, endDate, allocatedMeters, estimatedDailyOutput } = result.data;
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (start > end) {
      return NextResponse.json(
        { message: "Start date must be before or equal to end date" },
        { status: 400 }
      );
    }

    // Fetch order to check if draft (for isPlaceholder flag)
    const targetOrder = await prisma.productionOrder.findUnique({
      where: { id: orderId },
      select: { isDraft: true, piNumber: true },
    });

    if (!targetOrder) {
      return NextResponse.json({ message: "Order not found" }, { status: 404 });
    }

    // Overlap check (applies equally to draft placeholders and official assignments)
    console.log("OVERLAP CHECK TRIGGERED");
    const existing = await prisma.machineAssignment.findFirst({
      where: {
        machineId,
        startDate: { lte: end },
        endDate: { gte: start },
      },
    });

    if (existing) {
      return NextResponse.json(
        { message: "Máy đã được xếp lịch trong khoảng thời gian này" },
        { status: 409 }
      );
    }

    // Insert with isPlaceholder = true if order is draft
    const assignment = await prisma.machineAssignment.create({
      data: {
        machineId,
        orderId,
        startDate: start,
        endDate: end,
        isPlaceholder: targetOrder.isDraft,
        ...(allocatedMeters != null && { allocatedMeters }),
        ...(estimatedDailyOutput != null && { estimatedDailyOutput }),
      },
      include: {
        order: true,
      },
    });

    return NextResponse.json(assignment, { status: 201 });
  } catch (error: unknown) {
    console.error("[POST_ASSIGNMENTS]", error);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}
