'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Home, Search, Heart, LayoutDashboard, ChevronUp } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { dashboardLinks, isDashboardPath } from '@/lib/dashboard-links'

export function BottomNav() {
  const pathname = usePathname()
  const router = useRouter()
  const [loggedIn, setLoggedIn] = useState(false)
  const [role, setRole] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const fetchRole = async (userId: string) => {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .maybeSingle()
      setRole(profile?.role ?? null)
    }

    supabase.auth.getUser().then(({ data }) => {
      const userId = data?.user?.id
      if (userId) { setLoggedIn(true); fetchRole(userId) }
      else { setLoggedIn(false); setRole(null) }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session?.user) { setLoggedIn(true); fetchRole(session.user.id) }
      else { setLoggedIn(false); setRole(null) }
    })

    return () => subscription.unsubscribe()
  }, [])

  // close the Dashboard drop-down when the page changes or when you tap outside it
  useEffect(() => { setSheetOpen(false) }, [pathname])
  useEffect(() => {
    if (!sheetOpen) return
    const onDown = (e: Event) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setSheetOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
    }
  }, [sheetOpen])

  const guard = (e: React.MouseEvent) => {
    if (!loggedIn) {
      e.preventDefault()
      router.push('/login')
    }
  }

  const links = dashboardLinks(role)
  const dashActive = isDashboardPath(pathname)

  // Home, Search, Dashboard, Saved. Active tab is green, the rest are grey.
  const tabBase = 'flex-1 flex flex-col items-center justify-center gap-1 py-2.5'
  const iconCls = (active: boolean) => (active ? 'text-primary' : 'text-muted-foreground')
  const labelCls = (active: boolean) => `text-[11px] font-medium ${active ? 'text-primary' : 'text-muted-foreground'}`

  const simpleTab = (href: string, label: string, Icon: any, active: boolean, protect = false) => (
    <Link
      key={label}
      href={href}
      onClick={protect ? guard : undefined}
      aria-current={active ? 'page' : undefined}
      className={tabBase}
    >
      <Icon size={22} className={iconCls(active)} strokeWidth={active ? 2.4 : 2} />
      <span className={labelCls(active)}>{label}</span>
    </Link>
  )

  return (
    <div ref={wrapRef} className="md:hidden">
      {sheetOpen && loggedIn && (
        <div
          role="menu"
          className="fixed left-3 right-3 z-40 overflow-hidden rounded-2xl border border-border bg-card shadow-xl"
          style={{ bottom: 'calc(64px + env(safe-area-inset-bottom))' }}
        >
          {links.map((l, i) => {
            const active = pathname === l.href
            return (
              <Link
                key={l.href}
                href={l.href}
                role="menuitem"
                className={`flex min-h-12 items-center justify-between px-4 text-sm font-medium ${
                  i > 0 ? 'border-t border-border' : ''
                } ${active ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-muted'}`}
              >
                {l.label}
              </Link>
            )
          })}
        </div>
      )}

      <nav
        className="fixed bottom-0 left-0 right-0 z-40 bg-card border-t border-border flex items-stretch"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {simpleTab('/', 'Home', Home, pathname === '/')}
        {simpleTab('/search', 'Search', Search, pathname.startsWith('/search'))}

        {/* Dashboard: tap to open a drop-down with the tools inside it */}
        <button
          type="button"
          onClick={(e) => {
            if (!loggedIn) { guard(e); return }
            setSheetOpen((o) => !o)
          }}
          aria-haspopup="menu"
          aria-expanded={sheetOpen}
          className={tabBase}
        >
          <span className="relative">
            <LayoutDashboard size={22} className={iconCls(dashActive || sheetOpen)} strokeWidth={dashActive || sheetOpen ? 2.4 : 2} />
            <ChevronUp
              size={10}
              className={`absolute -right-3 -top-1 transition-transform ${sheetOpen ? '' : 'rotate-180'} ${iconCls(dashActive || sheetOpen)}`}
            />
          </span>
          <span className={labelCls(dashActive || sheetOpen)}>Dashboard</span>
        </button>

        {simpleTab('/saved', 'Saved', Heart, pathname === '/saved', true)}
      </nav>
    </div>
  )
}