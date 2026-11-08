'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import {
  LayoutDashboard,
  List,
  Plus,
  MessageCircle,
  BarChart3,
  CreditCard,
  User,
  HelpCircle,
  Star,
  Bell,
  Menu,
  X,
  ShieldCheck,
  BadgeCheck,
  Building2,
  FileText,
  CalendarClock,
  ClipboardCheck,
  KeyRound,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { getUnreadMessageCount } from '@/lib/support'
import { useNotifications } from '@/components/notification-provider'
import { BRAND_LOGOS } from '@/lib/brand'

type NavItem = {
  label: string
  href: string
  icon: any
  badgeKey?: 'applications' | 'messages'
}

// Stage 16: the same 15 destinations as before, grouped so the menu is easier to scan.
// Nothing was removed or renamed. Badges and active-route rules are unchanged.
const NAV_GROUPS: { title: string | null; items: NavItem[] }[] = [
  {
    title: null,
    items: [{ label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard }],
  },
  {
    title: 'Properties',
    items: [
      { label: 'My Properties', href: '/dashboard/listings', icon: List },
      { label: 'Add New Listing', href: '/list-property', icon: Plus },
    ],
  },
  {
    title: 'Tenants and rent',
    items: [
      { label: 'Applications', href: '/dashboard/applications', icon: FileText, badgeKey: 'applications' },
      { label: 'Viewings', href: '/dashboard/viewings', icon: CalendarClock },
      { label: 'Inspection requests', href: '/dashboard/inspection-requests', icon: ClipboardCheck },
      { label: 'Tenancies', href: '/dashboard/tenancies', icon: KeyRound },
      { label: 'Payments', href: '/dashboard/payments', icon: CreditCard },
      { label: 'Messages', href: '/dashboard/messages', icon: MessageCircle, badgeKey: 'messages' },
    ],
  },
  {
    title: 'Trust and growth',
    items: [
      { label: 'Get Verified', href: '/dashboard/verify', icon: ShieldCheck },
      { label: 'Professional Profile', href: '/dashboard/professional', icon: BadgeCheck },
      { label: 'My Company', href: '/dashboard/company', icon: Building2 },
      { label: 'Analytics', href: '/dashboard/analytics', icon: BarChart3 },
    ],
  },
  {
    title: 'Account',
    items: [
      { label: 'Profile', href: '/dashboard/profile', icon: User },
      { label: 'Help & Support', href: '/contact', icon: HelpCircle },
    ],
  },
]

// The Dashboard link is active only on its own page. Every other link is also
// active on its nested pages, e.g. /dashboard/tenancies/123.
function isActive(pathname: string, href: string) {
  if (href === '/dashboard') return pathname === '/dashboard'
  return pathname === href || pathname.startsWith(href + '/')
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [unreadMessages, setUnreadMessages] = useState(0)
  const { unreadCount: unreadNotifs } = useNotifications()
  const [pendingApplications, setPendingApplications] = useState(0)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const wasOpen = useRef(false)

  useEffect(() => {
    let cancelled = false
    let redirected = false

    const checkAccess = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          redirected = true
          router.push('/login')
          return
        }

        const { data: profileData } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single()

        if (!profileData || profileData.role !== 'landlord') {
          redirected = true
          router.push('/')
          return
        }

        if (cancelled) return
        setProfile(profileData)

        const msgCount = await getUnreadMessageCount()

        // EboHomes decides every application. The badge counts open applications
        // where the landlord has not yet added a recommendation (optional, but helpful).
        const { count: pendingAppCount } = await supabase
          .from('applications')
          .select('*', { count: 'exact', head: true })
          .eq('landlord_id', user.id)
          .in('status', ['pending', 'info_requested'])
          .is('landlord_recommendation', null)

        if (cancelled) return
        setUnreadMessages(msgCount)
        setPendingApplications(pendingAppCount ?? 0)
      } catch (err) {
        console.error('Dashboard access check failed:', err)
      } finally {
        // Never leave the spinner up forever, even if a request fails
        if (!cancelled && !redirected) setLoading(false)
      }
    }

    checkAccess()
    return () => {
      cancelled = true
    }
  }, [router])

  // ---- keep the unread messages badge live without needing a page reload ----
  useEffect(() => {
    if (!profile?.id) return

    const refreshUnread = async () => {
      setUnreadMessages(await getUnreadMessageCount())
    }

    const channel = supabase
      .channel(`sidebar-unread-${profile.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, refreshUnread)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'support_messages' }, refreshUnread)
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [profile?.id])

  // Close the mobile menu when the page changes, and when Escape is pressed.
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

  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center bg-background"
        role="status"
        aria-label="Loading your dashboard"
      >
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const displayName: string = profile?.full_name ?? profile?.name ?? 'Landlord'

  const renderNav = (onNavigate?: () => void) => (
    <nav aria-label="Landlord menu" className="flex-1 space-y-4 overflow-y-auto px-3 py-4">
      {NAV_GROUPS.map((group, gi) => (
        <div key={group.title ?? `group-${gi}`} role="group" aria-label={group.title ?? 'Overview'} className="space-y-1">
          {group.title && <p className="px-3 pb-1 text-xs font-semibold text-muted-foreground">{group.title}</p>}
          {group.items.map((item) => {
            const active = isActive(pathname, item.href)
            const badge =
              item.badgeKey === 'messages' ? unreadMessages : item.badgeKey === 'applications' ? pendingApplications : 0
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? 'page' : undefined}
                className={`focus-ring relative flex min-h-11 items-center justify-between gap-3 rounded-button px-3 py-2.5 text-sm font-medium transition-colors ${
                  active
                    ? 'bg-primary/10 font-semibold text-primary before:absolute before:inset-y-2 before:left-0 before:w-1 before:rounded-full before:bg-primary'
                    : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
                }`}
              >
                <span className="flex items-center gap-3">
                  <item.icon size={17} aria-hidden />
                  {item.label}
                </span>
                {badge > 0 && (
                  <span
                    className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-bold text-primary-foreground"
                    aria-label={
                      item.badgeKey === 'messages'
                        ? `${badge} unread ${badge === 1 ? 'message' : 'messages'}`
                        : `${badge} ${badge === 1 ? 'application' : 'applications'} without your recommendation`
                    }
                  >
                    {badge}
                  </span>
                )}
              </Link>
            )
          })}
        </div>
      ))}
    </nav>
  )

  // Green lockup on light, white lockup on dark. Same two files and pattern as the site header.
  const Logo = ({ className }: { className: string }) => (
    <>
      <img src={BRAND_LOGOS.onLight} alt="EboHomes" width={1280} height={392} className={`w-auto dark:hidden ${className}`} />
      <img src={BRAND_LOGOS.onDark} alt="" aria-hidden="true" width={799} height={210} className={`hidden w-auto dark:block ${className}`} />
    </>
  )

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-border bg-card lg:flex">
        <div className="border-b border-border p-5">
          <Link href="/" className="focus-ring inline-flex rounded-md" aria-label="EboHomes home">
            <Logo className="h-9" />
          </Link>
        </div>

        {renderNav()}

        <div className="m-3 rounded-card bg-forest-gradient p-4 text-white">
          <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-full bg-amber-400/20">
            <Star size={16} className="text-amber-400" aria-hidden />
          </div>
          <p className="mb-1 text-sm font-bold">Feature Your Property</p>
          <p className="mb-3 text-xs leading-relaxed text-white/85">
            Get more visibility and attract serious tenants.
          </p>
          <Link
            href="/dashboard/listings"
            className="focus-ring flex min-h-11 items-center justify-center rounded-full bg-white text-xs font-bold text-forest"
          >
            Choose a property to feature
          </Link>
        </div>

        <div className="flex items-center gap-2.5 border-t border-border p-4">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary"
            aria-hidden
          >
            {displayName[0]?.toUpperCase() ?? 'L'}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{displayName}</p>
            <p className="text-xs text-muted-foreground">Landlord</p>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card px-4 py-2 sm:px-6 lg:hidden">
          <button
            ref={menuButtonRef}
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open menu"
            aria-expanded={mobileNavOpen}
            className="focus-ring flex h-11 w-11 items-center justify-center rounded-full bg-secondary"
          >
            <Menu size={18} aria-hidden />
          </button>
          <Link href="/dashboard" aria-label="EboHomes landlord dashboard" className="focus-ring inline-flex rounded-md">
            <Logo className="h-7" />
          </Link>
          <Link
            href="/notifications"
            aria-label={
              unreadNotifs > 0
                ? `Notifications, ${unreadNotifs} unread`
                : 'Notifications'
            }
            className="focus-ring relative flex h-11 w-11 items-center justify-center rounded-full bg-secondary"
          >
            <Bell size={16} aria-hidden />
            {unreadNotifs > 0 && (
              <span
                className="absolute right-0 top-0 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-xs font-bold text-primary-foreground"
                aria-hidden
              >
                {unreadNotifs}
              </span>
            )}
          </Link>
        </header>

        {mobileNavOpen && (
          <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Landlord menu">
            <button
              type="button"
              aria-label="Close menu"
              tabIndex={-1}
              className="absolute inset-0 bg-black/50"
              onClick={() => setMobileNavOpen(false)}
            />
            <div ref={panelRef} className="absolute left-0 top-0 flex h-dvh w-72 max-w-[85vw] flex-col bg-card shadow-xl">
              <div className="flex items-center justify-between border-b border-border p-3 pl-5">
                <Logo className="h-7" />
                <button
                  ref={closeButtonRef}
                  onClick={() => setMobileNavOpen(false)}
                  aria-label="Close menu"
                  className="focus-ring flex h-11 w-11 items-center justify-center rounded-full"
                >
                  <X size={20} aria-hidden />
                </button>
              </div>
              {renderNav(() => setMobileNavOpen(false))}
            </div>
          </div>
        )}

        {children}
      </div>
    </div>
  )
                }
