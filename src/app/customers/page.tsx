import type { Metadata } from 'next'
import { prisma } from '@/lib/db'
import CustomerTable from '@/components/customers/CustomerTable'

export const metadata: Metadata = {
  title: 'Customers — SNY Planner',
  description: 'Manage customers and their information.',
}

export const dynamic = 'force-dynamic'

export default async function CustomersPage() {
  const raw = await prisma.customer.findMany({
    orderBy: { name: 'asc' },
    include: {
      _count: { select: { orders: true } }
    }
  })

  const customers = raw.map(c => ({
    ...c,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  }))

  return (
    <div className="max-w-[1440px] mx-auto px-container-margin py-xl">
      <CustomerTable initialCustomers={customers} />
    </div>
  )
}
