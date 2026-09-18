// src/app/orders/[id]/page.tsx
// Server Component — fetches a single order, renders OrderDetail (R1 light theme).

import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import type { SerializedProductionOrder } from '@/types'
import OrderDetail from '@/components/orders/OrderDetail'

interface Props {
  params: { id: string }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const order = await prisma.productionOrder.findUnique({
      where: { id: params.id },
      select: { piNumber: true },
    })
    if (order) {
      return {
        title: `${order.piNumber} — SNY Planner`,
        description: `View and edit production order ${order.piNumber}`,
      }
    }
  } catch {
    // Swallow — metadata failure should not break the page
  }
  return { title: 'Order Detail — SNY Planner' }
}

export const dynamic = 'force-dynamic'

export default async function OrderDetailPage({ params }: Props) {
  let order: SerializedProductionOrder | null = null

  try {
    const raw = await prisma.productionOrder.findUnique({
      where: { id: params.id },
      include: { assignments: { select: { startDate: true, endDate: true } } },
    })

    if (!raw) {
      redirect('/orders')
    }

    order = {
      ...raw,
      orderDate: raw.orderDate.toISOString(),
      createdAt: raw.createdAt.toISOString(),
      updatedAt: raw.updatedAt.toISOString(),
      uvPct: raw.uvPct != null ? raw.uvPct.toString() : null,
      rollLength:  raw.rollLength  != null ? raw.rollLength.toString()  : null,
      pieceLength: raw.pieceLength != null ? raw.pieceLength.toString() : null,
      qtySqm:         raw.qtySqm         != null ? raw.qtySqm.toString()         : null,
      totalWeightKgs: raw.totalWeightKgs != null ? raw.totalWeightKgs.toString() : null,
      requiredYarnKg: raw.requiredYarnKg != null ? raw.requiredYarnKg.toString() : null,
      deliveryDate: raw.deliveryDate != null ? raw.deliveryDate.toISOString() : null,
      frPct: raw.frPct != null ? raw.frPct.toString() : null,
      assignments: raw.assignments.map(a => ({
        startDate: a.startDate.toISOString(),
        endDate: a.endDate.toISOString(),
      })),
    }
  } catch (err) {
    throw err
  }

  return (
    <div className="max-w-[800px] mx-auto px-container-margin py-xl">

      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="mb-lg">
        <ol className="flex items-center gap-sm text-label-md font-inter text-on-surface-variant">
          <li>
            <Link href="/orders" className="hover:text-primary transition-colors">
              Production orders
            </Link>
          </li>
          <li aria-hidden="true">
            <span className="material-symbols-outlined text-[16px] text-outline">chevron_right</span>
          </li>
          <li className="text-on-surface font-medium font-mono text-type-mono" aria-current="page">
            {order.piNumber}
          </li>
        </ol>
      </nav>

      {/* Page header */}
      <div className="flex items-start justify-between mb-lg">
        <div className="flex flex-col gap-sm">
          <div className="flex items-center gap-sm">
            <h1 className="text-headline-lg font-inter font-semibold text-primary font-mono">
              {order.piNumber}
            </h1>
            {order.subLineIndex > 0 && (
              <span className="bg-primary-container text-on-primary-container text-label-sm font-inter font-medium rounded px-sm py-xs uppercase">
                Line {order.subLineIndex}
              </span>
            )}
          </div>
          <p className="text-body-md font-noto text-secondary">{order.customer}</p>
        </div>
      </div>

      {/* Detail card */}
      <div className="bg-surface-container-lowest border-[0.5px] border-outline-variant rounded-lg overflow-hidden">
        {/* Card header */}
        <div className="bg-surface-container-low border-b-[0.5px] border-outline-variant px-lg py-sm">
          <p className="text-label-sm font-inter font-medium text-secondary uppercase tracking-widest">
            Order Details
          </p>
        </div>
        <div className="p-lg md:p-[32px]">
          <OrderDetail order={order} />
        </div>
      </div>
    </div>
  )
}
