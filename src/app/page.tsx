import { requireUser } from '@/lib/auth/session'
// src/app/page.tsx
// Root "/" redirects to "/orders" (server-side, no flash)
import { redirect } from 'next/navigation'

export default async function RootPage() {
  await requireUser()

  redirect('/orders')
}
