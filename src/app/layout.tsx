// src/app/layout.tsx
// Root layout — imports Google Fonts via next/font/google for Inter + Noto Sans KR.
// Material Symbols Outlined is loaded via @import in globals.css.
// Structure: fixed TopNav (64px) + fixed SideNav (280px) + scrollable main.

import type { Metadata } from 'next'
import { Inter, Noto_Sans_KR } from 'next/font/google'
import './globals.css'
import TopNav from '@/components/layout/TopNav'
import SideNav from '@/components/layout/SideNav'

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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${inter.variable} ${noto.variable}`}>
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" rel="stylesheet" />
      </head>
      <body className="font-inter">
        {/* Fixed top navigation bar */}
        <TopNav />

        {/* Fixed left side navigation bar */}
        <SideNav />

        {/* Main content area — offset for nav bars */}
        <main className="pl-[280px] pt-[64px] min-h-screen bg-background">
          {children}
        </main>
      </body>
    </html>
  )
}
