'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import {
  Home as HomeIcon,
  Search,
  Heart,
  MessageCircle,
  FileText,
  CalendarClock,
  Key,
  Bell,
  Settings,
  User,
  LogOut,
  Menu,
  X,
  ChevronDown,
  Building2,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { getUnreadMessageCount } from '@/lib/support'
import { useNotifications } from '@/components/notification-provider'
import { NotificationBell } from '@/components/notification-bell'

// Main bar (desktop) — the same six places shown in the home page design.
const MAIN_NAV = [
  { label: 'Home', href: '/home', icon: HomeIcon },
  { label: 'Search', href: '/search', icon: Search },
  { label: 'Saved', href: '/saved', icon: Heart },
  { label: 'Applications', href: '/applications', icon: FileText },
  { label: 'Tenancies', href: '/tenancies', icon: Key },
  { label: 'Messages', href: '/messages', icon: MessageCircle, badgeKey: 'messages' as const },
]

// Everything else the old sidebar offered stays reachable from the menu.
const MORE_NAV = [
  { label: 'My Viewings', href: '/viewings', icon: CalendarClock },
  { label: 'Notifications', href: '/notifications', icon: Bell, badgeKey: 'notifications' as const },
  { label: 'My Profile', href: '/profile', icon: User },
  { label: 'Settings', href: '/settings', icon: Settings },
  { label: 'List a property', href: '/list-property', icon: Building2 },
]

export default function HomeLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [unreadMessages, setUnreadMessages] = useState(0)
  const { unreadCount: unreadNotifs } = useNotifications()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const checkAccess = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      if (!profileData || profileData.role === 'landlord') {
        router.push('/dashboard')
        return
      }

      setProfile(profileData)
      setUnreadMessages(await getUnreadMessageCount())
      setLoading(false)
    }

    checkAccess()
  }, [router])

  // ---- keep message badge live ----
  useEffect(() => {
    if (!profile?.id) return

    const refreshMessages = async () => {
      setUnreadMessages(await getUnreadMessageCount())
    }

    const channel = supabase
      .channel(`home-live-${profile.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages', filter: `receiver_id=eq.${profile.id}` },
        refreshMessages
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'support_messages' }, refreshMessages)
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [profile?.id])

  // close the profile menu on outside click
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  // close menus when the page changes
  useEffect(() => {
    setDrawerOpen(false)
    setMenuOpen(false)
  }, [pathname])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  const isActive = (href: string) => (href === '/home' ? pathname === '/home' : pathname === href || pathname.startsWith(href + '/'))
  const badgeFor = (key?: 'messages' | 'notifications') =>
    key === 'messages' ? unreadMessages : key === 'notifications' ? unreadNotifs : 0
  const firstName = (profile?.full_name ?? '').trim().split(/\s+/)[0] || 'there'
  const initial = (profile?.full_name?.[0] ?? 'T').toUpperCase()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:h-[72px] lg:px-8">
          {/* Left: menu button (mobile) + logo */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setDrawerOpen(true)}
              className="-ml-2 flex h-11 w-11 items-center justify-center rounded-xl text-foreground hover:bg-muted lg:hidden"
              aria-label="Open menu"
            >
              <Menu size={22} />
            </button>
            <Link href="/" className="flex shrink-0 items-center">
              <img
                src="/logo-horizontal-compact.png"
                alt="EboHomes"
                className="h-10 w-auto sm:h-11 lg:h-12 mix-blend-multiply dark:mix-blend-normal"
              />
            </Link>
          </div>

          {/* Centre: main nav (desktop) */}
          <nav className="hidden items-center gap-1 lg:flex" aria-label="Main">
            {MAIN_NAV.map((item) => {
              const active = isActive(item.href)
              const badge = badgeFor(item.badgeKey)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={`relative rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    active ? 'text-primary' : 'text-foreground/70 hover:text-primary'
                  }`}
                >
                  {item.label}
                  {badge > 0 && (
                    <span className="ml-1.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-none text-primary-foreground">
                      {badge > 99 ? '99+' : badge}
                    </span>
                  )}
                  {active && <span className="absolute inset-x-3 -bottom-[13px] h-0.5 rounded-full bg-primary" />}
                </Link>
              )
            })}
          </nav>

          {/* Right: bell + profile */}
          <div className="flex items-center gap-1 sm:gap-2">
            <NotificationBell />

            <div className="relative hidden lg:block" ref={menuRef}>
              <button
                onClick={() => setMenuOpen((o) => !o)}
                className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-muted"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                  {initial}
                </span>
                <span className="text-sm font-medium text-foreground">Hi, {firstName}</span>
                <ChevronDown size={14} className="text-muted-foreground" />
              </button>

              {menuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-full mt-2 w-60 overflow-hidden rounded-2xl border border-border bg-card shadow-lg"
                >
                  <div className="border-b border-border px-4 py-3">
                    <p className="truncate text-sm font-semibold text-foreground">{profile?.full_name ?? 'Tenant'}</p>
                    <p className="text-xs text-muted-foreground">Tenant</p>
                  </div>
                  <div className="p-1.5">
                    {MORE_NAV.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        role="menuitem"
                        className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-foreground hover:bg-muted"
                      >
                        <item.icon size={16} className="text-muted-foreground" />
                        {item.label}
                      </Link>
                    ))}
                    <button
                      onClick={handleLogout}
                      role="menuitem"
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-foreground hover:bg-muted"
                    >
                      <LogOut size={16} className="text-muted-foreground" />
                      Log out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Mobile drawer: every place in the app, as the old sidebar had */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDrawerOpen(false)} />
          <div className="absolute left-0 top-0 flex h-full w-72 flex-col bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border p-4">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                  {initial}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">{profile?.full_name ?? 'Tenant'}</p>
                  <p className="text-xs text-muted-foreground">Tenant</p>
                </div>
              </div>
              <button onClick={() => setDrawerOpen(false)} aria-label="Close menu" className="flex h-10 w-10 items-center justify-center rounded-xl hover:bg-muted">
                <X size={20} />
              </button>
            </div>
            <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
              {[...MAIN_NAV, ...MORE_NAV].map((item) => {
                const active = isActive(item.href)
                const badge = badgeFor((item as any).badgeKey)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-sm font-medium ${
                      active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
                    }`}
                  >
                    <span className="flex items-center gap-3"><item.icon size={17} />{item.label}</span>
                    {badge > 0 && (
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                        {badge}
                      </span>
                    )}
                  </Link>
                )
              })}
              <button
                onClick={handleLogout}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
              >
                <LogOut size={17} />
                Log out
              </button>
            </nav>
          </div>
        </div>
      )}

      {/* The phone bottom bar comes from the root layout (BottomNav), so this layout adds none. */}
      <main>{children}</main>
    </div>
  )
}