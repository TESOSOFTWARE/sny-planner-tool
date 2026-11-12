// src/app/layout.tsx
// Root layout — imports Google Fonts via next/font/google for Inter + Noto Sans KR.
// Material Symbols Outlined is loaded via @import in globals.css.
// Structure: fixed TopNav (64px) + fixed SideNav (280px) + scrollable main.

import type { Metadata } from 'next'
import { Inter, Noto_Sans_KR } from 'next/font/google'
import './globals.css'
import TopNav from '@/components/layout/TopNav'
import SideNav from '@/components/layout/SideNav'
import { headers } from 'next/headers'
import { requireUser } from '@/lib/auth/session'
import { permissionForRequest, userPermissionKeys, type PermissionKey } from '@/lib/auth/permissions'
import { redirect } from 'next/navigation'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

const noto = Noto_Sans_KR({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-noto',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'SNY Planner — Production Management',
  description:
    'Internal production planning tool for SNY factory, Vietnam. Manage orders, machine schedules, and materials.',
}

function homePath(permissions: PermissionKey[]) {
  if (permissions.includes('orders.read')) return '/orders'
  if (permissions.includes('output.read')) return '/orders/production'
  if (permissions.includes('customers.read')) return '/customers'
  if (permissions.includes('schedule.read')) return '/schedule'
  if (permissions.includes('materials.read')) return '/materials'
  if (permissions.includes('reports.read')) return '/reports'
  if (permissions.includes('access.users.manage')) return '/settings/access'
  return '/forbidden'
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const isLogin = headers().get('x-sny-path') === '/login'
  const user = isLogin ? null : await requireUser()
  const permissions = user ? await userPermissionKeys(user.id) : []
  if (user && headers().get('x-sny-path') !== '/forbidden') {
    const path = headers().get('x-sny-path') ?? '/orders'
    const permission = permissionForRequest(path, 'GET')
    if (!permission) redirect('/forbidden')
    if (!permissions.includes(permission)) redirect('/forbidden')
  }
  return (
    <html lang="en" className={`${inter.variable} ${noto.variable}`}>
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" rel="stylesheet" />
      </head>
      <body className="font-inter">
        {/* Fixed top navigation bar */}
        {!isLogin && <TopNav email={user?.email} homeHref={homePath(permissions)} />}

        {/* Fixed left side navigation bar */}
        {!isLogin && <SideNav permissions={permissions} />}

        {/* Main content area — offset for nav bars */}
        <main className={isLogin ? '' : 'pl-[72px] xl:pl-[280px] pt-[64px] min-h-screen bg-background'}>
          {children}
        </main>
      </body>
    </html>
  )
}
