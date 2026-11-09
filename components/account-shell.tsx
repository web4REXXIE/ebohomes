'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { Bell, Menu, X, type LucideIcon } from 'lucide-react'
import { BRAND_LOGOS } from '@/lib/brand'

// Stage 17: the one account shell for tenant and landlord dashboards.
// It draws the sidebar, the phone header and the phone menu. It does NOT decide who may see a page:
// each layout keeps its own access check, redirects and live counters, and passes in its own links.

export type AccountNavItem = {
  label: string
  href: string
  icon: LucideIcon
  badgeKey?: string
  // Exact: active only on this exact path (the dashboard home), not on nested pages.
  exact?: boolean
}
export type AccountNavGroup = { title: string | null; items: AccountNavItem[] }
export type AccountBadge = { count: number; label: (n: number) => string }

export function isNavActive(pathname: string, item: Pick<AccountNavItem, 'href' | 'exact'>) {
  if (item.exact) return pathname === item.href
  return pathname === item.href || pathname.startsWith(item.href + '/')
}

export const navItemClass =
  'focus-ring relative flex min-h-11 items-center justify-between gap-3 rounded-button px-3 py-2.5 text-sm font-medium transition-colors'

const countText = (n: number) => (n > 99 ? '99+' : String(n))

export type AccountIdentity = {
  name: string
  roleLabel: string
  fallbackInitial: string
  avatarUrl?: string | null
  // When set, the identity card in the sidebar links here.
  href?: string
}

export function AccountShell({
  groups,
  navLabel,
  menuButtonLabel,
  mobileHomeHref,
  identity,
  badges,
  unreadNotifs,
  sidebarPromo,
  navFooter,
  children,
}: {
  groups: AccountNavGroup[]
  navLabel: string
  menuButtonLabel: string
  mobileHomeHref: string
  identity: AccountIdentity
  badges: Record<string, AccountBadge>
  unreadNotifs: number
  sidebarPromo?: ReactNode
  navFooter?: ReactNode
  children: ReactNode
}) {
  const pathname = usePathname()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const wasOpen = useRef(false)

  // The menu closes when the page changes.
  useEffect(() => {
    setMobileNavOpen(false)
  }, [pathname])

  // Mobile menu: Escape closes it, Tab stays inside it, focus moves in when it opens and
  // returns to the Menu button when it closes. The page behind does not scroll while it is open.
  useEffect(() => {
    if (!mobileNavOpen) {
      if (wasOpen.current) menuButtonRef.current?.focus()
      wasOpen.current = false
      return
    }
    wasOpen.current = true
    closeButtonRef.current?.focus()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileNavOpen(false)
        return
      }
      if (e.key !== 'Tab' || !panelRef.current) return
      const focusable = panelRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
    }
  }, [mobileNavOpen])

  // Green lockup on light, white lockup on dark. Same two files and pattern as the site header.
  const Logo = ({ className }: { className: string }) => (
    <>
      <img src={BRAND_LOGOS.onLight} alt="" width={1280} height={392} className={`w-auto dark:hidden ${className}`} />
      <img src={BRAND_LOGOS.onDark} alt="" aria-hidden="true" width={799} height={210} className={`hidden w-auto dark:block ${className}`} />
    </>
  )

  const renderNav = (onNavigate?: () => void) => (
    <nav aria-label={navLabel} className="flex-1 space-y-4 overflow-y-auto px-3 py-4">
      {groups.map((group, gi) => (
        <div key={group.title ?? `group-${gi}`} role="group" aria-label={group.title ?? 'Overview'} className="space-y-1">
          {group.title && <p className="px-3 pb-1 text-xs font-semibold text-muted-foreground">{group.title}</p>}
          {group.items.map((item) => {
            const active = isNavActive(pathname, item)
            const badge = item.badgeKey ? badges[item.badgeKey] : undefined
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? 'page' : undefined}
                className={`${navItemClass} ${
                  active
                    ? 'bg-primary/10 font-semibold text-primary before:absolute before:inset-y-2 before:left-0 before:w-1 before:rounded-full before:bg-primary'
                    : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
                }`}
              >
                <span className="flex min-w-0 items-center gap-3">
                  <item.icon size={17} aria-hidden />
                  <span className="truncate">{item.label}</span>
                </span>
                {badge && badge.count > 0 && (
                  <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-bold text-primary-foreground">
                    <span aria-hidden>{countText(badge.count)}</span>
                    <span className="sr-only">{badge.label(badge.count)}</span>
                  </span>
                )}
              </Link>
            )
          })}
        </div>
      ))}
      {navFooter && <div className="space-y-1">{navFooter}</div>}
    </nav>
  )

  const avatar = identity.avatarUrl ? (
    <img src={identity.avatarUrl} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
  ) : (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary" aria-hidden>
      {identity.fallbackInitial}
    </span>
  )
  const identityBody = (
    <>
      {avatar}
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-foreground">{identity.name}</span>
        <span className="block text-xs text-muted-foreground">{identity.roleLabel}</span>
      </span>
    </>
  )

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar (large screens) */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-border bg-card lg:flex">
        <div className="border-b border-border p-5">
          <Link href="/" aria-label="EboHomes home" className="focus-ring inline-flex rounded-chip">
            <Logo className="h-9" />
          </Link>
          <p className="mt-2 text-xs text-muted-foreground">Find Homes. Skip the Stress.</p>
        </div>

        {renderNav()}

        {sidebarPromo}

        {identity.href ? (
          <Link href={identity.href} className="focus-ring flex items-center gap-3 border-t border-border p-4 hover:bg-muted">
            {identityBody}
          </Link>
        ) : (
          <div className="flex items-center gap-3 border-t border-border p-4">{identityBody}</div>
        )}
      </aside>

      {/* Main content */}
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-card px-4 py-2 sm:px-6 lg:hidden">
          <button
            ref={menuButtonRef}
            type="button"
            onClick={() => setMobileNavOpen(true)}
            aria-label={menuButtonLabel}
            aria-expanded={mobileNavOpen}
            aria-controls="account-mobile-menu"
            className="focus-ring flex h-11 w-11 items-center justify-center rounded-full bg-secondary"
          >
            <Menu size={20} aria-hidden />
          </button>
          <Link href={mobileHomeHref} aria-label="EboHomes" className="focus-ring inline-flex rounded-chip">
            <Logo className="h-7" />
          </Link>
          <Link
            href="/notifications"
            aria-label={unreadNotifs > 0 ? `Notifications, ${unreadNotifs} unread` : 'Notifications'}
            className="focus-ring relative flex h-11 w-11 items-center justify-center rounded-full bg-secondary"
          >
            <Bell size={18} aria-hidden />
            {unreadNotifs > 0 && (
              <span aria-hidden className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-xs font-bold text-primary-foreground">
                {countText(unreadNotifs)}
              </span>
            )}
          </Link>
        </header>

        {mobileNavOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <button
              type="button"
              aria-label="Close menu"
              tabIndex={-1}
              className="absolute inset-0 bg-forest/60"
              onClick={() => setMobileNavOpen(false)}
            />
            <div
              id="account-mobile-menu"
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-label={navLabel}
              className="absolute left-0 top-0 flex h-dvh w-[min(20rem,88vw)] flex-col bg-card shadow-overlay"
              style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
            >
              <div className="flex items-center justify-between border-b border-border p-3 pl-5">
                <Logo className="h-7" />
                <button
                  ref={closeButtonRef}
                  type="button"
                  onClick={() => setMobileNavOpen(false)}
                  aria-label="Close menu"
                  className="focus-ring flex h-11 w-11 items-center justify-center rounded-full hover:bg-muted"
                >
                  <X size={20} aria-hidden />
                </button>
              </div>
              <div className="border-b border-border px-5 py-2.5">
                <p className="text-xs text-muted-foreground">Signed in as</p>
                <p className="truncate text-sm font-semibold text-foreground">{identity.name}</p>
              </div>
              {renderNav(() => setMobileNavOpen(false))}
            </div>
          </div>
        )}

        {/* The app-wide bottom bar (components/bottom-nav.tsx) and the root layout's bottom spacing already cover phones. */}
        <div>{children}</div>
      </div>
    </div>
  )
}
