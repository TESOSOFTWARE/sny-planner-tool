// src/app/orders/pi/[piNumber]/page.tsx
// Server Component — fetches all sub-lines for a given PI Number and renders PiMasterDetailEditor.

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/db'
import PiMasterDetailEditor, { type SubLineItem } from '@/components/orders/PiMasterDetailEditor'

interface Props {
  params: { piNumber: string }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const piNumber = decodeURIComponent(params.piNumber)
  return {
    title: `PI ${piNumber} — Chỉnh sửa tập trung | SNY Planner`,
    description: `Quản lý và chỉnh sửa toàn bộ các dòng hàng thuộc PI ${piNumber}`,
  }
}

export const dynamic = 'force-dynamic'

export default async function PiMasterDetailPage({ params }: Props) {
  const piNumber = decodeURIComponent(params.piNumber)

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
    notFound()
  }

  const primaryHeader = orders[0]

  // F1 (R4): mốc cập nhật mới nhất của cả PI — client gửi lại khi PUT để chống ghi đè (409).
  const initialUpdatedAt = new Date(
    Math.max(...orders.map((o) => o.updatedAt.getTime()))
  ).toISOString()

  // Load related PIs in cluster: same customer, same container, or same order month
  const orderMonth = primaryHeader.orderDate
  const startOfMonth = new Date(orderMonth.getFullYear(), orderMonth.getMonth(), 1)
  const endOfMonth = new Date(orderMonth.getFullYear(), orderMonth.getMonth() + 1, 0, 23, 59, 59, 999)

  const candidateOrders = await prisma.productionOrder.findMany({
    where: {
      OR: [
        { customer: primaryHeader.customer },
        ...(primaryHeader.customerId ? [{ customerId: primaryHeader.customerId }] : []),
        ...(primaryHeader.containerSize ? [{ containerSize: primaryHeader.containerSize }] : []),
        { orderDate: { gte: startOfMonth, lte: endOfMonth } },
      ],
    },
    select: {
      piNumber: true,
      customer: true,
      containerSize: true,
      orderDate: true,
      lifecycleStatus: true,
    },
    orderBy: { orderDate: 'desc' },
  })

  const piMap = new Map<string, {
    piNumber: string
    customer: string
    containerSize?: string | null
    orderDate: string
    lifecycleStatus: string
    lineCount: number
  }>()

  for (const o of candidateOrders) {
    const existing = piMap.get(o.piNumber)
    if (!existing) {
      piMap.set(o.piNumber, {
        piNumber: o.piNumber,
        customer: o.customer,
        containerSize: o.containerSize,
        orderDate: o.orderDate.toISOString().slice(0, 10),
        lifecycleStatus: o.lifecycleStatus || 'APPROVED',
        lineCount: 1,
      })
    } else {
      existing.lineCount++
    }
  }

  // Ensure current PI is always in the map
  if (!piMap.has(piNumber)) {
    piMap.set(piNumber, {
      piNumber,
      customer: primaryHeader.customer,
      containerSize: primaryHeader.containerSize,
      orderDate: primaryHeader.orderDate.toISOString().slice(0, 10),
      lifecycleStatus: primaryHeader.lifecycleStatus || 'APPROVED',
      lineCount: orders.length,
    })
  }

  const relatedPis = Array.from(piMap.values())

  const lines: SubLineItem[] = orders.map((o) => ({
    id: o.id,
    subLineIndex: o.subLineIndex,
    color: o.color || '',
    colorVersion: o.colorVersion || 'STD',
    colorRecipeSnapshot: o.colorRecipeSnapshot,
    widthM: o.widthM != null ? o.widthM : '',
    lengthM: o.lengthM != null ? o.lengthM : '',
    gsm: o.gsm != null ? o.gsm : '',
    productionGsm: o.productionGsm != null ? o.productionGsm : '',
    orderType: (o.orderType as any) || 'rolls',
    qty: o.qty != null ? o.qty : '',
    rollLength: o.rollLength != null ? Number(o.rollLength) : '',
    pieceLength: o.pieceLength != null ? Number(o.pieceLength) : '',

    primaryPackingType: (o.primaryPackingType as any) || 'ROLL',
    hasPaperCore: o.hasPaperCore === true,
    isHalfFolded: Boolean(o.isHalfFolded),
    piecesPerCarton: o.piecesPerCarton != null ? o.piecesPerCarton : '',
    piecesPerBale: o.piecesPerBale != null ? o.piecesPerBale : '',
    boxDimensions: o.boxDimensions || '',
    onPallet: Boolean(o.onPallet),
    secondaryPackingType: (o.secondaryPackingType as any) || 'NONE',
    palletDimensions: o.palletDimensions || '',
    itemsPerPallet: o.itemsPerPallet != null ? o.itemsPerPallet : '',
    packingNote: o.packingNote || '',
    outerWrapping: o.outerWrapping || 'POLYBAG',

    // Dual-GSM & Tolerance
    isLaminated: Boolean(o.isLaminated),
    rawFabricGsm: o.rawFabricGsm != null ? o.rawFabricGsm : '',
    coatingGsm: o.coatingGsm != null ? o.coatingGsm : '',
    finishedGsm: o.finishedGsm != null ? o.finishedGsm : '',
    toleranceQtyPct: o.toleranceQtyPct != null ? o.toleranceQtyPct : '',
    toleranceSpecPct: o.toleranceSpecPct != null ? o.toleranceSpecPct : '',

    uvPct: o.uvPct != null ? Number(o.uvPct) : '',
    frFlag: Boolean(o.frFlag),
    frPct: o.frPct != null ? Number(o.frPct) : '',
    lineNote: o.lineNote || '',
    requiresPacking: Boolean(o.requiresPacking),
    meshType: o.meshType || '',
    needleCount: o.needleCount != null ? o.needleCount : '',
    beamCount: o.beamCount != null ? o.beamCount : '',
    mbCode: o.mbCode || '',

    hasEyelet: Boolean(o.hasEyelet),
    eyeletColor: o.eyeletColor || '',
    eyeletLines: o.eyeletLines != null ? o.eyeletLines : '',
    eyeletSpec: o.eyeletSpec || '',

    assignments: o.assignments.map((a) => ({
      ...a,
      startDate: a.startDate.toISOString(),
      endDate: a.endDate.toISOString(),
    })),
  }))

  return (
    <PiMasterDetailEditor
      initialPiNumber={piNumber}
      initialCustomer={primaryHeader.customer}
      initialCustomerId={primaryHeader.customerId}
      initialOrderDate={primaryHeader.orderDate.toISOString().slice(0, 10)}
      initialDeliveryDate={primaryHeader.deliveryDate ? primaryHeader.deliveryDate.toISOString().slice(0, 10) : null}
      initialContainerSize={primaryHeader.containerSize}
      initialDescription={primaryHeader.description}
      initialRemark={primaryHeader.remark}
      initialLifecycleStatus={primaryHeader.lifecycleStatus || 'APPROVED'}
      initialIsPlaceholder={primaryHeader.isPlaceholder}
      initialLines={lines}
      initialUpdatedAt={initialUpdatedAt}
      relatedPis={relatedPis}
    />
  )
}
