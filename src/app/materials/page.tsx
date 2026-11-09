import { requireUser } from '@/lib/auth/session'
import MaterialsWorkspace from '@/components/materials/MaterialsWorkspace'
export default async function MaterialsPage() {
  await requireUser()
 return <MaterialsWorkspace /> }
