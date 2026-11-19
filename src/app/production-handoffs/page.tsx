import type { Metadata } from 'next'
import { prisma } from '@/lib/db'
import { requirePermission } from '@/lib/auth/session'
import { userHasPermission } from '@/lib/auth/permissions'
import ProductionHandoffsWorkspace from '@/components/orders/ProductionHandoffsWorkspace'

export const metadata: Metadata = { title: 'Bàn giao WIP — SNY Planner' }
export const dynamic = 'force-dynamic'

export default async function ProductionHandoffsPage() {
  const user = await requirePermission('output.read')
  const canEnter = await userHasPermission(user.id, 'output.actual.enter')
  const orders = await prisma.productionOrder.findMany({
    where: { isDraft: false, isPlaceholder: false, lifecycleStatus: 'APPROVED' },
    orderBy: [{ piNumber: 'asc' }, { subLineIndex: 'asc' }],
    select: { id: true, piNumber: true, subLineIndex: true, customer: true, color: true, orderType: true },
  })

  return <div className="mx-auto max-w-[1600px] space-y-5 px-4 py-6 xl:px-8">
    <header>
      <h1 className="text-2xl font-semibold text-primary">Bàn giao WIP</h1>
      <p className="mt-1 text-sm text-secondary">Theo dõi số lượng bàn giao giữa các công đoạn theo từng PI và dòng hàng.</p>
    </header>
    <ProductionHandoffsWorkspace orders={orders} canEnter={canEnter} />
  </div>
}
