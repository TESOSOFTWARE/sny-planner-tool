// src/app/api/orders/pi/[piNumber]/route.ts
// GET & PUT for PI Master-Detail editing.
// GET: Fetches all sub-lines for a given PI Number.
// PUT: Atomically updates PI Header and reconciles all sub-lines (update, create, delete) in a single transaction.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { calculateOrderWeight } from '@/lib/calculations/orderWeight'
import { deriveOrderTypeFromPacking, lineSchema, draftLineSchema } from '@/lib/validations/order'

interface Props {
  params: { piNumber: string }
}

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: Props) {
  const piNumber = decodeURIComponent(params.piNumber)

  try {
    const orders = await prisma.productionOrder.findMany({
      where: { piNumber },
      include: {
        assignments: {
          select: {
            id: true,
            machineId: true,
            startDate: true,
            endDate: true,
            isPlaceholder: true,
          },
        },
      },
      orderBy: { subLineIndex: 'asc' },
    })

    if (!orders || orders.length === 0) {
      return NextResponse.json(
        { success: false, error: `Không tìm thấy đơn hàng với mã PI "${piNumber}".` },
        { status: 404 }
      )
    }

    const serializedOrders = orders.map((raw) => ({
      ...raw,
      orderDate: raw.orderDate.toISOString().slice(0, 10),
      deliveryDate: raw.deliveryDate ? raw.deliveryDate.toISOString().slice(0, 10) : null,
      createdAt: raw.createdAt.toISOString(),
      updatedAt: raw.updatedAt.toISOString(),
      uvPct: raw.uvPct != null ? raw.uvPct.toString() : null,
      frPct: raw.frPct != null ? raw.frPct.toString() : null,
      rollLength: raw.rollLength != null ? raw.rollLength.toString() : null,
      pieceLength: raw.pieceLength != null ? raw.pieceLength.toString() : null,
      qtySqm: raw.qtySqm != null ? raw.qtySqm.toString() : null,
      totalWeightKgs: raw.totalWeightKgs != null ? raw.totalWeightKgs.toString() : null,
      requiredYarnKg: raw.requiredYarnKg != null ? raw.requiredYarnKg.toString() : null,
      assignments: raw.assignments.map((a) => ({
        ...a,
        startDate: a.startDate.toISOString(),
        endDate: a.endDate.toISOString(),
      })),
    }))

    return NextResponse.json({
      success: true,
      piNumber,
      count: serializedOrders.length,
      orders: serializedOrders,
    })
  } catch (err) {
    console.error(`[GET /api/orders/pi/${piNumber}] Error:`, err)
    return NextResponse.json(
      { success: false, error: 'Lỗi máy chủ khi tải danh sách dòng hàng PI.' },
      { status: 500 }
    )
  }
}

export async function PUT(req: NextRequest, { params }: Props) {
  const piNumber = decodeURIComponent(params.piNumber)

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ success: false, error: 'JSON payload không hợp lệ.' }, { status: 400 })
  }

  const {
    customer,
    customerId,
    orderDate,
    deliveryDate,
    containerSize,
    description,
    remark,
    lifecycleStatus = 'APPROVED',
    isPlaceholder = false,
    expectedUpdatedAt,
    lines,
  } = body

  if (!customer || !customer.trim()) {
    return NextResponse.json({ success: false, error: 'Tên khách hàng là bắt buộc.' }, { status: 422 })
  }
  if (!orderDate || !/^\d{4}-\d{2}-\d{2}$/.test(orderDate)) {
    return NextResponse.json({ success: false, error: 'Ngày đặt hàng không hợp lệ (YYYY-MM-DD).' }, { status: 422 })
  }
  if (!Array.isArray(lines) || lines.length === 0) {
    return NextResponse.json({ success: false, error: 'Cần có ít nhất 1 dòng sản phẩm trong đơn.' }, { status: 422 })
  }

  // Pre-validate lines with Zod schema
  const validationIssues: { line: number; errors: string[] }[] = []
  for (let idx = 0; idx < lines.length; idx++) {
    const rawLine = lines[idx]
    const schemaToUse = lifecycleStatus === 'DRAFT' ? draftLineSchema : lineSchema
    const parseRes = schemaToUse.safeParse(rawLine)
    if (!parseRes.success) {
      validationIssues.push({
        line: idx + 1,
        errors: parseRes.error.issues.map((i: { message: string }) => i.message),
      })
    }
  }

  if (validationIssues.length > 0) {
    return NextResponse.json(
      {
        success: false,
        error: 'Dữ liệu dòng sản phẩm không hợp lệ.',
        details: validationIssues,
      },
      { status: 422 }
    )
  }

  const effectiveDeliveryDate = deliveryDate && /^\d{4}-\d{2}-\d{2}$/.test(deliveryDate)
    ? new Date(`${deliveryDate}T00:00:00.000Z`)
    : null

  try {
    const transactionResult = await prisma.$transaction(async (tx) => {
      // 1. Fetch current sub-lines
      const currentOrders = await tx.productionOrder.findMany({
        where: { piNumber },
        include: { assignments: true },
      })

      // Concurrency check: Stale update protection
      if (expectedUpdatedAt) {
        const expectedDate = new Date(expectedUpdatedAt)
        const isStale = currentOrders.some((o) => o.updatedAt.getTime() > expectedDate.getTime())
        if (isStale) {
          throw new Error('STALE_UPDATE: Đơn hàng đã được chỉnh sửa bởi người khác. Vui lòng tải lại trang.')
        }
      }

      const currentIds = new Set(currentOrders.map((o) => o.id))
      const incomingIds = new Set(lines.filter((l: any) => l.id).map((l: any) => l.id))

      // 2. Identify sub-lines to delete
      const toDelete = currentOrders.filter((o) => !incomingIds.has(o.id))
      for (const order of toDelete) {
        if (order.assignments && order.assignments.length > 0) {
          throw new Error(
            `Không thể xóa dòng sản phẩm (Line ${order.subLineIndex}) vì đã được gán lịch chạy trên máy dệt (${order.assignments.map((a) => a.machineId).join(', ')}). Vui lòng hủy gán máy trước khi xóa.`
          )
        }
        await tx.productionOrder.delete({ where: { id: order.id } })
      }

      // 3. Process incoming lines (update or create)
      const savedOrders = []

      for (let idx = 0; idx < lines.length; idx++) {
        const line = lines[idx]
        const subLineIndex = idx + 1

        const widthM = line.widthM != null ? Number(line.widthM) : null
        const gsm = line.gsm != null ? Number(line.gsm) : null
        const productionGsm = line.productionGsm != null ? Number(line.productionGsm) : null
        const color = line.color ? String(line.color).trim().toUpperCase() : null

        const primaryPackingType = line.primaryPackingType || 'ROLL'
        const orderType = deriveOrderTypeFromPacking(primaryPackingType, line.orderType)

        const qty = line.qty != null ? Number(line.qty) : null
        let rollLength = line.rollLength != null ? Number(line.rollLength) : null
        let pieceLength = line.pieceLength != null ? Number(line.pieceLength) : null
        let lengthM = line.lengthM != null ? Number(line.lengthM) : null

        if (orderType === 'rolls' && rollLength == null && lengthM != null) {
          rollLength = lengthM
        }
        if (orderType === 'pieces' && pieceLength == null && lengthM != null) {
          pieceLength = lengthM
        }

        const calculation = calculateOrderWeight({
          orderType,
          widthM,
          lengthM,
          gsm,
          productionGsm,
          qty,
          rollLength,
          pieceLength,
          isLaminated: Boolean(line.isLaminated),
          rawFabricGsm: line.rawFabricGsm != null ? Number(line.rawFabricGsm) : null,
          coatingGsm: line.coatingGsm != null ? Number(line.coatingGsm) : null,
          finishedGsm: line.finishedGsm != null ? Number(line.finishedGsm) : null,
        })

        const lineData: any = {
          piNumber,
          subLineIndex,
          customer: customer.trim(),
          customerId: customerId || null,
          orderDate: new Date(`${orderDate}T00:00:00.000Z`),
          deliveryDate: effectiveDeliveryDate,
          containerSize: containerSize ? containerSize.trim() : null,
          description: description ? description.trim() : null,
          remark: remark ? remark.trim() : null,

          lifecycleStatus: lifecycleStatus || 'APPROVED',
          isPlaceholder: Boolean(isPlaceholder || lifecycleStatus === 'PLACEHOLDER'),
          isDraft: lifecycleStatus === 'DRAFT',

          color,
          colorVersion: line.colorVersion || null,
          colorRecipeSnapshot: line.colorRecipeSnapshot || null,

          widthM,
          lengthM: calculation.totalMeters,
          gsm,
          productionGsm,
          qty,
          orderType,
          rollLength,
          pieceLength,

          primaryPackingType,
          hasPaperCore: line.hasPaperCore === true,
          isHalfFolded: Boolean(line.isHalfFolded),
          piecesPerCarton: line.piecesPerCarton != null ? Number(line.piecesPerCarton) : null,
          piecesPerBale: line.piecesPerBale != null ? Number(line.piecesPerBale) : null,
          boxDimensions: line.boxDimensions ? String(line.boxDimensions).trim() : null,
          onPallet: Boolean(line.onPallet),
          secondaryPackingType: line.secondaryPackingType || 'NONE',
          palletDimensions: line.palletDimensions ? String(line.palletDimensions).trim() : null,
          itemsPerPallet: line.itemsPerPallet != null ? Number(line.itemsPerPallet) : null,
          packingNote: line.packingNote ? String(line.packingNote).trim() : null,
          outerWrapping: line.outerWrapping || 'POLYBAG',

          // Dual-GSM & Tolerance
          isLaminated: Boolean(line.isLaminated),
          rawFabricGsm: line.rawFabricGsm != null ? Number(line.rawFabricGsm) : null,
          coatingGsm: line.coatingGsm != null ? Number(line.coatingGsm) : null,
          finishedGsm: line.finishedGsm != null ? Number(line.finishedGsm) : null,
          toleranceQtyPct: line.toleranceQtyPct != null ? Number(line.toleranceQtyPct) : 10.0,
          toleranceSpecPct: line.toleranceSpecPct != null ? Number(line.toleranceSpecPct) : 5.0,

          uvPct: line.uvPct != null ? Number(line.uvPct) : null,
          frFlag: Boolean(line.frFlag),
          frPct: line.frPct != null ? Number(line.frPct) : null,
          lineNote: line.lineNote ? String(line.lineNote).trim() : null,
          requiresPacking: line.requiresPacking === true,

          meshType: line.meshType ? String(line.meshType).trim() : null,
          needleCount: line.needleCount != null ? Number(line.needleCount) : null,
          beamCount: line.beamCount != null ? Number(line.beamCount) : null,
          mbCode: line.mbCode ? String(line.mbCode).trim() : null,

          hasEyelet: Boolean(line.hasEyelet),
          eyeletColor: line.eyeletColor ? String(line.eyeletColor).trim() : null,
          eyeletLines: line.eyeletLines != null ? Number(line.eyeletLines) : null,
          eyeletSpec: line.eyeletSpec ? String(line.eyeletSpec).trim() : null,

          qtySqm: calculation.qtySqm,
          totalWeightKgs: calculation.totalWeightKgs,
          requiredYarnKg: calculation.requiredYarnKg,
        }

        if (line.id && currentIds.has(line.id)) {
          const updated = await tx.productionOrder.update({
            where: { id: line.id },
            data: lineData,
          })
          savedOrders.push(updated)
        } else {
          const created = await tx.productionOrder.create({
            data: {
              ...lineData,
              dataSource: 'manual',
            },
          })
          savedOrders.push(created)
        }
      }

      return savedOrders
    }, { timeout: 30_000, maxWait: 5_000 })

    return NextResponse.json({
      success: true,
      message: `Đã lưu thành công ${transactionResult.length} dòng hàng cho PI ${piNumber}.`,
      count: transactionResult.length,
    })
  } catch (err: any) {
    console.error(`[PUT /api/orders/pi/${piNumber}] Error:`, err)
    const isConflict = typeof err?.message === 'string' && err.message.startsWith('STALE_UPDATE')
    return NextResponse.json(
      { success: false, error: err?.message || 'Lỗi máy chủ khi cập nhật đơn hàng PI.' },
      { status: isConflict ? 409 : 500 }
    )
  }
}
