'use client'

import { useState, useEffect } from 'react'
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
  FileText,
  CalendarClock,
  KeyRound,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { getUnreadMessageCount } from '@/lib/support'
import { useNotifications } from '@/components/notification-provider'

type NavItem = {
  label: string
  href: string
  icon: any
  badgeKey?: 'applications' | 'messages'
}

const NAV: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'My Properties', href: '/dashboard/listings', icon: List },
  { label: 'Applications', href: '/dashboard/applications', icon: FileText, badgeKey: 'applications' },
  { label: 'Viewings', href: '/dashboard/viewings', icon: CalendarClock },
  { label: 'Tenancies', href: '/dashboard/tenancies', icon: KeyRound },
  { label: 'Payments', href: '/dashboard/payments', icon: CreditCard },
  { label: 'Messages', href: '/dashboard/messages', icon: MessageCircle, badgeKey: 'messages' },
  { label: 'Analytics', href: '/dashboard/analytics', icon: BarChart3 },
  { label: 'Get Verified', href: '/dashboard/verify', icon: ShieldCheck },
  { label: 'Add New Listing', href: '/list-property', icon: Plus },
  { label: 'Profile', href: '/dashboard/profile', icon: User },
  { label: 'Help & Support', href: '/contact', icon: HelpCircle },
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

  useEffect(() => {
    if (!mobileNavOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileNavOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
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
    <nav aria-label="Landlord menu" className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
      {NAV.map((item) => {
        const active = isActive(pathname, item.href)
        const badge =
          item.badgeKey === 'messages' ? unreadMessages : item.badgeKey === 'applications' ? pendingApplications : 0
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={`flex min-h-11 items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
              active
                ? 'bg-primary/10 text-primary font-semibold'
                : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
            }`}
          >
            <span className="flex items-center gap-3">
              <item.icon size={17} aria-hidden />
              {item.label}
            </span>
            {badge > 0 && (
              <span
                className="bg-primary text-primary-foreground text-[10px] font-bold min-w-5 h-5 px-1 rounded-full flex items-center justify-center"
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
    </nav>
  )

  return (
    <div className="min-h-screen flex bg-background">
      {/* Sidebar */}
      <aside className="hidden lg:flex flex-col w-64 border-r border-border bg-card shrink-0 h-screen sticky top-0">
        <div className="p-5 border-b border-border">
          <Link href="/" className="flex items-center gap-2" aria-label="EboHomes home">
            <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center">
              <List size={18} className="text-primary-foreground" aria-hidden />
            </div>
            <div>
              <p className="font-extrabold text-foreground text-sm leading-none">EboHomes</p>
              <p className="text-[10px] text-muted-foreground leading-none mt-0.5">Find Homes. Skip the Stress.</p>
            </div>
          </Link>
        </div>

        {renderNav()}

        <div className="p-4 m-3 rounded-2xl bg-gradient-to-br from-emerald-950 to-primary text-white">
          <div className="w-9 h-9 rounded-full bg-amber-400/20 flex items-center justify-center mb-3">
            <Star size={16} className="text-amber-400" aria-hidden />
          </div>
          <p className="font-bold text-sm mb-1">Feature Your Property</p>
          <p className="text-xs text-white/80 mb-3 leading-relaxed">
            Get more visibility and attract serious tenants.
          </p>
          <Link
            href="/dashboard/listings"
            className="flex min-h-11 items-center justify-center bg-white text-foreground text-xs font-bold rounded-full"
          >
            Choose a property to feature
          </Link>
        </div>

        <div className="p-4 border-t border-border flex items-center gap-2.5">
          <div
            className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0"
            aria-hidden
          >
            {displayName[0]?.toUpperCase() ?? 'L'}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{displayName}</p>
            <p className="text-xs text-muted-foreground">Landlord</p>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        <header className="sticky top-0 z-10 bg-card border-b border-border px-4 sm:px-6 py-2 flex items-center justify-between lg:hidden">
          <button
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open menu"
            aria-expanded={mobileNavOpen}
            className="w-11 h-11 rounded-full bg-secondary flex items-center justify-center"
          >
            <Menu size={18} aria-hidden />
          </button>
          <span className="font-extrabold text-primary">EboHomes</span>
          <Link
            href="/notifications"
            aria-label={
              unreadNotifs > 0
                ? `Notifications, ${unreadNotifs} unread`
                : 'Notifications'
            }
            className="relative w-11 h-11 rounded-full bg-secondary flex items-center justify-center"
          >
            <Bell size={16} aria-hidden />
            {unreadNotifs > 0 && (
              <span
                className="absolute top-0 right-0 bg-primary text-primary-foreground text-[9px] font-bold min-w-4 h-4 px-1 rounded-full flex items-center justify-center"
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
              className="absolute inset-0 bg-black/50"
              onClick={() => setMobileNavOpen(false)}
            />
            <div className="absolute left-0 top-0 h-full w-72 max-w-[85vw] bg-card shadow-xl flex flex-col">
              <div className="p-3 pl-5 border-b border-border flex items-center justify-between">
                <span className="font-extrabold text-primary">EboHomes</span>
                <button
                  onClick={() => setMobileNavOpen(false)}
                  aria-label="Close menu"
                  className="w-11 h-11 flex items-center justify-center"
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