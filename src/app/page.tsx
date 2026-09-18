// src/app/page.tsx
// Root "/" redirects to "/orders" (server-side, no flash)
import { redirect } from 'next/navigation'

export default function RootPage() {
  redirect('/orders')
}
