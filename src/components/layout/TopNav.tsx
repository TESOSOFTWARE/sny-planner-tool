'use client'

// src/components/layout/TopNav.tsx
// Fixed 64px top navigation bar.
// Navigation tabs removed — side nav is the single navigation source.

import Link from 'next/link'

export default function TopNav() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-[64px] bg-surface border-b border-[0.5px] border-outline-variant">
      <div className="max-w-[1440px] mx-auto px-container-margin h-full flex items-center justify-between">

        {/* Left: brand */}
        <Link href="/orders" className="flex items-center gap-2 shrink-0">
          <span className="text-headline-md font-inter font-semibold text-primary tracking-tight">
            SNY<span className="text-on-surface-variant font-medium"> Planner</span>
          </span>
        </Link>

        {/* Right: phase badge + icons */}
        <div className="flex items-center gap-3">
          <span className="text-label-sm font-inter font-medium text-on-surface-variant bg-surface-variant rounded-full px-3 py-1">
            Phase 1
          </span>
          <button
            aria-label="Notifications"
            className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-surface-container text-on-surface-variant transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">notifications</span>
          </button>
          <button
            aria-label="Account"
            className="w-9 h-9 flex items-center justify-center rounded-full bg-primary-container text-on-primary-container text-label-sm font-inter font-semibold hover:opacity-90 transition-opacity"
          >
            PA
          </button>
        </div>
      </div>
    </header>
  )
}
