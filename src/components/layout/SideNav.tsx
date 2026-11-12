'use client'

import Link from 'next/link'
import { useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { useScheduleModalFocus } from '@/components/schedule/useModalFocus'
import type { PermissionKey } from '@/lib/auth/permissions'

type ActiveNavItem = {
  kind: 'link'
  icon: string
  label: string
  href: string
  permissions: PermissionKey[]
}

type DisabledNavItem = {
  kind: 'disabled'
  icon: string
  label: string
}

type NavItem = ActiveNavItem | DisabledNavItem

const NAV_ITEMS: NavItem[] = [
  { kind: 'link', icon: 'factory', label: 'Production', href: '/orders', permissions: ['orders.read', 'output.read'] },
  { kind: 'link', icon: 'group', label: 'Customers', href: '/customers', permissions: ['customers.read'] },
  { kind: 'link', icon: 'calendar_month', label: 'Schedule', href: '/schedule', permissions: ['schedule.read'] },
  { kind: 'link', icon: 'inventory_2', label: 'Materials', href: '/materials', permissions: ['materials.read'] },
  { kind: 'link', icon: 'assessment', label: 'Report', href: '/reports', permissions: ['reports.read'] },
  { kind: 'link', icon: 'admin_panel_settings', label: 'Account & Permissions', href: '/settings/access', permissions: ['access.users.manage'] },
]

function isActive(pathname: string, href: string) {
  if (href === '/orders' || href === '/customers') {
    return pathname === href || pathname.startsWith(`${href}/`)
  }

  return pathname === href
}

function NavigationContent({
  pathname,
  permissions,
  compact = false,
  onNavigate,
}: {
  pathname: string
  permissions: PermissionKey[]
  compact?: boolean
  onNavigate?: () => void
}) {
  return (
    <>
      <div className={compact ? 'px-sm py-md flex justify-center border-b border-[0.5px] border-outline-variant' : 'px-md pt-lg pb-md flex items-center gap-3 border-b border-[0.5px] border-outline-variant'}>
        <div className="w-10 h-10 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center text-label-md font-inter font-semibold shrink-0" aria-label="SNY Planner">
          SP
        </div>
        {!compact && (
          <div className="min-w-0">
            <p className="text-label-md font-inter font-semibold text-on-surface truncate">SNY Planner</p>
            <p className="text-label-sm font-inter text-secondary truncate">SNY VINA Plant</p>
          </div>
        )}
      </div>

      <nav className="flex-1 px-sm py-md space-y-xs overflow-y-auto" aria-label="Điều hướng chính">
        {NAV_ITEMS.filter(item => item.kind === 'disabled' || item.permissions.some(permission => permissions.includes(permission))).map((item) => {
          const itemTitle = item.kind === 'disabled' ? `${item.label} - Giai đoạn 2` : item.label

          if (item.kind === 'disabled') {
            return (
              <div
                key={item.label}
                aria-label={itemTitle}
                title={itemTitle}
                className={[
                  'flex items-center rounded-lg opacity-40 cursor-not-allowed pointer-events-none text-on-surface-variant',
                  compact ? 'justify-center px-sm py-sm' : 'gap-3 px-md py-sm',
                ].join(' ')}
              >
                <span className="material-symbols-outlined text-[20px] shrink-0">{item.icon}</span>
                {!compact && <span className="text-label-sm font-inter font-medium">{item.label}</span>}
                {compact ? <span className="w-1.5 h-1.5 rounded-full bg-current" aria-hidden="true" /> : <span className="text-xs bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded-full ml-auto">Phase 2</span>}
              </div>
            )
          }

          const href = item.href === '/orders' && !permissions.includes('orders.read') ? '/orders/production' : item.href
          const active = isActive(pathname, href)

          return (
            <Link
              key={item.label}
              href={href}
              onClick={onNavigate}
              aria-label={item.label}
              aria-current={active ? 'page' : undefined}
              title={compact ? item.label : undefined}
              tabIndex={0}
              className={[
                'flex items-center rounded-lg transition-colors',
                compact ? 'justify-center px-sm py-sm' : 'gap-3 px-md py-sm',
                active
                  ? 'bg-primary-container text-on-primary-container'
                  : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface',
              ].join(' ')}
            >
              <span className="material-symbols-outlined text-[20px] shrink-0">{item.icon}</span>
              {!compact && <span className="text-label-sm font-inter font-medium">{item.label}</span>}
            </Link>
          )
        })}
      </nav>

      {!compact && (
        <div className="px-md py-md border-t border-[0.5px] border-outline-variant">
          <p className="text-label-sm font-inter text-outline">v1.0 — Phase 1</p>
        </div>
      )}
    </>
  )
}

export default function SideNav({ permissions }: { permissions: PermissionKey[] }) {
  const pathname = usePathname()
  const [expanded, setExpanded] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  function closeOverlay() {
    setExpanded(false)
  }

  useScheduleModalFocus(expanded, closeOverlay, overlayRef)

  return (
    <>
      <aside className="fixed left-0 top-[64px] z-40 w-[72px] xl:w-[280px] h-[calc(100vh-64px)] bg-surface-container-low border-r border-[0.5px] border-outline-variant flex flex-col">
        <button
          ref={triggerRef}
          type="button"
          aria-label="Mở menu điều hướng"
          title="Mở menu điều hướng"
          aria-expanded={expanded}
          className="xl:hidden h-12 flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
          onClick={() => setExpanded(true)}
        >
          <span className="material-symbols-outlined text-[24px]" aria-hidden="true">menu</span>
        </button>

        <div className="hidden xl:flex flex-1 flex-col min-h-0">
          <NavigationContent pathname={pathname} permissions={permissions} />
        </div>
        <div className="flex xl:hidden flex-1 flex-col min-h-0">
          <NavigationContent pathname={pathname} permissions={permissions} compact />
        </div>
      </aside>

      {expanded && (
        <>
          <button
            type="button"
            aria-label="Đóng menu điều hướng"
            className="fixed left-0 right-0 top-[64px] bottom-0 z-50 bg-black/30"
            onClick={closeOverlay}
          />
          <div
            ref={overlayRef}
            role="dialog"
            aria-modal="true"
            aria-label="Menu điều hướng"
            className="fixed left-0 top-[64px] bottom-0 z-[60] w-[280px] bg-surface-container-low border-r border-[0.5px] border-outline-variant flex flex-col shadow-xl"
          >
            <div className="h-12 px-sm flex items-center justify-end border-b border-[0.5px] border-outline-variant">
              <button
                type="button"
                aria-label="Thu gọn menu điều hướng"
                title="Thu gọn menu điều hướng"
                className="w-10 h-10 flex items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container-high focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                onClick={closeOverlay}
              >
                <span className="material-symbols-outlined text-[24px]" aria-hidden="true">close</span>
              </button>
            </div>
            <NavigationContent pathname={pathname} permissions={permissions} onNavigate={closeOverlay} />
          </div>
        </>
      )}
    </>
  )
}
