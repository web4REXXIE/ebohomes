'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import {
  LayoutDashboard,
  Search,
  Heart,
  MessageCircle,
  FileText,
  CalendarClock,
  ClipboardCheck,
  KeyRound,
  Key,
  User,
  Bell,
  LogOut,
  Menu,
  X,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { getUnreadMessageCount } from '@/lib/support'
import { useNotifications } from '@/components/notification-provider'
import { BRAND_LOGOS } from '@/lib/brand'

// Stage 15: the tenant dashboard frame.
// - The links match the tenant links in lib/dashboard-links.ts (same labels and routes), plus Search, Saved and Profile.
// - The second bottom bar this layout used to draw is gone. The app already has one bottom bar (components/bottom-nav.tsx),
//   and two stacked bars covered the page and each other on phones.
// - Access check, unread counters, live updates and logout are unchanged.
const NAV = [
  { label: 'Dashboard', href: '/home', icon: LayoutDashboard },
  { label: 'Search Homes', href: '/search', icon: Search },
  { label: 'Saved Homes', href: '/saved', icon: Heart },
  { label: 'My Rental Journey', href: '/journey', icon: KeyRound },
  { label: 'My Applications', href: '/applications', icon: FileText },
  { label: 'Tenancy & Payments', href: '/tenancies', icon: Key },
  { label: 'My Viewings', href: '/viewings', icon: CalendarClock },
  { label: 'My Inspections', href: '/inspections', icon: ClipboardCheck },
  { label: 'Messages', href: '/messages', icon: MessageCircle, badgeKey: 'messages' },
  { label: 'Notifications', href: '/notifications', icon: Bell, badgeKey: 'notifications' },
  { label: 'My Profile', href: '/profile', icon: User },
] as const

const isActive = (pathname: string, href: string) =>
  href === '/home' ? pathname === '/home' : pathname === href || pathname.startsWith(href + '/')

const countText = (n: number) => (n > 99 ? '99+' : String(n))

export default function HomeLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [unreadMessages, setUnreadMessages] = useState(0)
  const { unreadCount: unreadNotifs } = useNotifications()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

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

      const msgCount = await getUnreadMessageCount()
      setUnreadMessages(msgCount)

      setLoading(false)
    }

    checkAccess()
  }, [router])

  // ---- keep badges live ----
  useEffect(() => {
    if (!profile?.id) return

    const refreshMessages = async () => {
      setUnreadMessages(await getUnreadMessageCount())
    }

    // Notification counts come from the shared NotificationProvider.
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

  // The menu closes when the page changes, on Escape, and focus goes back to the button that opened it.
  useEffect(() => { setMobileNavOpen(false) }, [pathname])
  useEffect(() => {
    if (!mobileNavOpen) return
    closeButtonRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileNavOpen(false)
        menuButtonRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [mobileNavOpen])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background" role="status" aria-label="Loading your dashboard">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  const badgeFor = (key?: string) => (key === 'messages' ? unreadMessages : key === 'notifications' ? unreadNotifs : 0)
  const firstName = ((profile?.full_name ?? '') as string).trim().split(/\s+/)[0]

  const navItems = (onNavigate?: () => void) =>
    NAV.map((item) => {
      const active = isActive(pathname, item.href)
      const badge = badgeFor('badgeKey' in item ? item.badgeKey : undefined)
      return (
        <Link
          key={item.href}
          href={item.href}
          onClick={onNavigate}
          aria-current={active ? 'page' : undefined}
          className={`focus-ring flex min-h-11 items-center justify-between gap-3 rounded-button px-3 text-sm font-medium transition-colors ${
            active ? 'bg-primary text-primary-foreground' : 'text-foreground-secondary hover:bg-muted hover:text-foreground'
          }`}
        >
          <span className="flex min-w-0 items-center gap-3">
            <item.icon size={18} aria-hidden />
            <span className="truncate">{item.label}</span>
          </span>
          {badge > 0 && (
            <span
              className={`flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-xs font-bold ${
                active ? 'bg-primary-foreground text-primary' : 'bg-primary text-primary-foreground'
              }`}
            >
              <span aria-hidden>{countText(badge)}</span>
              <span className="sr-only">{badge} unread</span>
            </span>
          )}
        </Link>
      )
    })

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar (large screens) */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-border bg-card lg:flex">
        <div className="border-b border-border p-5">
          <Link href="/" aria-label="EboHomes home" className="focus-ring block rounded-chip">
            <img src={BRAND_LOGOS.onLight} alt="" width={1280} height={392} className="h-8 w-auto dark:hidden" />
            <img src={BRAND_LOGOS.onDark} alt="" aria-hidden="true" width={799} height={210} className="hidden h-8 w-auto dark:block" />
          </Link>
          <p className="mt-2 text-xs text-muted-foreground">Find Homes. Skip the Stress.</p>
        </div>

        <nav aria-label="Tenant dashboard" className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {navItems()}
          <button
            type="button"
            onClick={handleLogout}
            className="focus-ring flex min-h-11 w-full items-center gap-3 rounded-button px-3 text-sm font-medium text-foreground-secondary hover:bg-muted hover:text-foreground"
          >
            <LogOut size={18} aria-hidden />
            Logout
          </button>
        </nav>

        <div className="m-3 rounded-card bg-forest p-4 text-white">
          <p className="mb-1 text-sm font-bold">Own a property?</p>
          <p className="mb-3 text-xs leading-relaxed text-white/80">
            Landlords can list a property on EboHomes for review.
          </p>
          <Link
            href="/list-property"
            className="focus-ring flex min-h-11 items-center justify-center rounded-button bg-white text-xs font-bold text-forest"
          >
            List a property
          </Link>
        </div>

        <Link
          href="/profile"
          className="focus-ring flex items-center gap-3 border-t border-border p-4 hover:bg-muted"
        >
          {profile?.avatar_url ? (
            <img src={profile.avatar_url} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
          ) : (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary" aria-hidden>
              {profile?.full_name?.[0]?.toUpperCase() ?? 'T'}
            </span>
          )}
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-foreground">{profile?.full_name ?? 'Tenant'}</span>
            <span className="block text-xs text-muted-foreground">Tenant · View profile</span>
          </span>
        </Link>
      </aside>

      {/* Main content */}
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-card px-4 py-2 sm:px-6 lg:hidden">
          <button
            ref={menuButtonRef}
            type="button"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open dashboard menu"
            aria-expanded={mobileNavOpen}
            aria-controls="tenant-mobile-menu"
            className="focus-ring flex h-11 w-11 items-center justify-center rounded-full bg-secondary"
          >
            <Menu size={20} aria-hidden />
          </button>
          <Link href="/" aria-label="EboHomes home" className="focus-ring rounded-chip">
            <img src={BRAND_LOGOS.onLight} alt="" width={1280} height={392} className="h-7 w-auto dark:hidden" />
            <img src={BRAND_LOGOS.onDark} alt="" aria-hidden="true" width={799} height={210} className="hidden h-7 w-auto dark:block" />
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
            <div className="absolute inset-0 bg-forest/60" onClick={() => setMobileNavOpen(false)} aria-hidden />
            <div
              id="tenant-mobile-menu"
              role="dialog"
              aria-modal="true"
              aria-label="Dashboard menu"
              className="absolute left-0 top-0 flex h-full w-[min(20rem,88vw)] flex-col bg-card shadow-overlay"
              style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
            >
              <div className="flex items-center justify-between border-b border-border p-4">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Signed in as</p>
                  <p className="truncate text-sm font-semibold text-foreground">{firstName || 'Tenant'}</p>
                </div>
                <button
                  ref={closeButtonRef}
                  type="button"
                  onClick={() => { setMobileNavOpen(false); menuButtonRef.current?.focus() }}
                  aria-label="Close menu"
                  className="focus-ring flex h-11 w-11 items-center justify-center rounded-full hover:bg-muted"
                >
                  <X size={20} aria-hidden />
                </button>
              </div>
              <nav aria-label="Tenant dashboard" className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
                {navItems(() => setMobileNavOpen(false))}
                <button
                  type="button"
                  onClick={handleLogout}
                  className="focus-ring flex min-h-11 w-full items-center gap-3 rounded-button px-3 text-sm font-medium text-foreground-secondary hover:bg-muted"
                >
                  <LogOut size={18} aria-hidden />
                  Logout
                </button>
              </nav>
            </div>
          </div>
        )}

        {/* The app-wide bottom bar (components/bottom-nav.tsx) and the root layout's bottom spacing already cover phones. */}
        <div>{children}</div>
      </div>
    </div>
  )
        }
