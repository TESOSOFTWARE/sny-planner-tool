import { requireUser } from '@/lib/auth/session'
import type { Metadata } from 'next'
import MaterialsWorkspace from '@/components/materials/MaterialsWorkspace'
import ProductionSummary from '@/components/reports/ProductionSummary'
export const metadata: Metadata = { title: 'Báo cáo thống kê — SNY Planner' }
export default async function ReportsPage() {
  await requireUser()
 return <><div className="px-4 pt-6 md:px-8"><ProductionSummary /></div><MaterialsWorkspace reports /></> }
