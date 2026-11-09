import { requireUser } from '@/lib/auth/session'
import type { Metadata } from 'next'
import MaterialsWorkspace from '@/components/materials/MaterialsWorkspace'
export const metadata: Metadata = { title: 'Báo cáo thống kê — SNY Planner' }
export default async function ReportsPage() {
  await requireUser()
 return <MaterialsWorkspace reports /> }
