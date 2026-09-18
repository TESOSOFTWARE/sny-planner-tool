'use client'

// src/components/layout/SideNav.tsx
// Fixed 280px left side navigation bar.
// Active state derived from current pathname via usePathname.

import Link from 'next/link'
import { usePathname } from 'next/navigation'

// ── Nav item definitions ──────────────────────────────────────────────────────

type ActiveNavItem = {
  kind: 'link'
  icon: string
  label: string
  href: string
}

type DisabledNavItem = {
  kind: 'disabled'
  icon: string
  label: string
}

type NavItem = ActiveNavItem | DisabledNavItem

const NAV_ITEMS: NavItem[] = [
  { kind: 'link',     icon: 'factory',        label: 'Production', href: '/orders'    },
  { kind: 'link',     icon: 'group',          label: 'Customers',  href: '/customers' },
  { kind: 'link',     icon: 'calendar_month', label: 'Schedule',   href: '/schedule'  },
  { kind: 'link',     icon: 'inventory_2',    label: 'Materials',  href: '/materials' },
  { kind: 'disabled', icon: 'assessment',     label: 'Reports'                        },
  { kind: 'disabled', icon: 'settings',       label: 'Settings'                       },
]

// ── Phase 2 badge ─────────────────────────────────────────────────────────────

function Phase2Badge() {
  return (
    <span className="text-xs bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded-full ml-auto">
      Phase 2
    </span>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SideNav() {
  const pathname = usePathname()

  return (
    <aside className="fixed left-0 top-[64px] z-40 w-[280px] h-[calc(100vh-64px)] bg-surface-container-low border-r border-[0.5px] border-outline-variant flex flex-col">

      {/* User info */}
      <div className="px-md pt-lg pb-md flex items-center gap-3 border-b border-[0.5px] border-outline-variant">
        <div className="w-10 h-10 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center text-label-md font-inter font-semibold shrink-0">
          PA
        </div>
        <div className="min-w-0">
          <p className="text-label-md font-inter font-semibold text-on-surface truncate">
            Planner Admin
          </p>
          <p className="text-label-sm font-inter text-secondary truncate">
            SNY VINA Plant
          </p>
        </div>
      </div>

      {/* Nav items */}
      <nav className="flex-1 px-sm py-md space-y-xs overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          if (item.kind === 'disabled') {
            return (
              <div
                key={item.label}
                className="flex items-center gap-3 px-md py-sm rounded-lg opacity-40 cursor-not-allowed pointer-events-none text-on-surface-variant"
              >
                <span className="material-symbols-outlined text-[20px] shrink-0">{item.icon}</span>
                <span className="text-label-sm font-inter font-medium">{item.label}</span>
                <Phase2Badge />
              </div>
            )
          }

          // Active when pathname matches exactly, or starts with href/ for sub-routes
          const active =
            item.href === '/orders'
              ? (pathname === '/orders' || pathname.startsWith('/orders/'))
              : item.href === '/customers'
              ? (pathname === '/customers' || pathname.startsWith('/customers/'))
              : pathname === item.href

          return (
            <Link
              key={item.label}
              href={item.href}
              className={[
                'flex items-center gap-3 px-md py-sm rounded-lg transition-colors',
                active
                  ? 'bg-primary-container text-on-primary-container'
                  : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface',
              ].join(' ')}
            >
              <span className="material-symbols-outlined text-[20px] shrink-0">{item.icon}</span>
              <span className="text-label-sm font-inter font-medium">{item.label}</span>
            </Link>
          )
        })}
      </nav>

      {/* Bottom version tag */}
      <div className="px-md py-md border-t border-[0.5px] border-outline-variant">
        <p className="text-label-sm font-inter text-outline">v1.0 — Phase 1</p>
      </div>
    </aside>
  )
}
