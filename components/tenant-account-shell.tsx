'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
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
  BellRing,
  ShieldCheck,
  LogOut,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { getUnreadMessageCount } from '@/lib/support'
import { useNotifications } from '@/components/notification-provider'
import { AccountShell, navItemClass, type AccountNavGroup } from '@/components/account-shell'
import { tenantVerificationState } from '@/lib/tenant-verification'

// Stage 15: the tenant dashboard frame.
// - The links match the tenant links in lib/dashboard-links.ts (same labels and routes), plus Search, Saved and Profile.
// - The second bottom bar this layout used to draw is gone. The app already has one bottom bar (components/bottom-nav.tsx),
//   and two stacked bars covered the page and each other on phones.
// - Access check, unread counters, live updates and logout are unchanged.
// Stage 17: the sidebar, phone header and phone menu now come from components/account-shell.tsx.
// Stage 18b: this file moved here from app/home/layout.tsx so /tenancies can use the same tenant shell.
// It still runs its own access check: landlords are sent to /dashboard, signed-out visitors to /login.
// New: "ID Verification" and "My Alerts" are now in the menu. ID Verification shows a small marker only when the tenant
// still has something to do (nothing submitted, or the last submission was not approved).
const NAV_GROUPS: AccountNavGroup[] = [
  { title: null, items: [{ label: 'Dashboard', href: '/home', icon: LayoutDashboard, exact: true }] },
  {
    title: 'Find a home',
    items: [
      { label: 'Search Homes', href: '/search', icon: Search },
      { label: 'Saved Homes', href: '/saved', icon: Heart },
      { label: 'My Alerts', href: '/alerts', icon: BellRing },
    ],
  },
  {
    title: 'My rental',
    items: [
      { label: 'My Rental Journey', href: '/journey', icon: KeyRound },
      { label: 'My Applications', href: '/applications', icon: FileText },
      { label: 'Tenancy & Payments', href: '/tenancies', icon: Key },
      { label: 'My Viewings', href: '/viewings', icon: CalendarClock },
      { label: 'My Inspections', href: '/inspections', icon: ClipboardCheck },
    ],
  },
  {
    title: 'Account',
    items: [
      { label: 'Messages', href: '/messages', icon: MessageCircle, badgeKey: 'messages' },
      { label: 'Notifications', href: '/notifications', icon: Bell, badgeKey: 'notifications' },
      { label: 'ID Verification', href: '/verify-account', icon: ShieldCheck, badgeKey: 'verification' },
      { label: 'My Profile', href: '/profile', icon: User },
    ],
  },
]

export function TenantAccountShell({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [unreadMessages, setUnreadMessages] = useState(0)
  const { unreadCount: unreadNotifs } = useNotifications()

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

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  // Only point at verification when the tenant has something to do. Submitted and verified show no marker.
  const verificationState = tenantVerificationState(profile)
  const verificationNeedsAction = verificationState === 'not_submitted' || verificationState === 'rejected'

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background" role="status" aria-label="Loading your dashboard">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <AccountShell
      groups={NAV_GROUPS}
      navLabel="Tenant dashboard"
      menuButtonLabel="Open dashboard menu"
      mobileHomeHref="/"
      identity={{
        name: profile?.full_name ?? 'Tenant',
        roleLabel: 'Tenant · View profile',
        fallbackInitial: profile?.full_name?.[0]?.toUpperCase() ?? 'T',
        avatarUrl: profile?.avatar_url,
        href: '/profile',
      }}
      badges={{
        messages: { count: unreadMessages, label: (n) => `${n} unread` },
        notifications: { count: unreadNotifs, label: (n) => `${n} unread` },
        verification: { count: verificationNeedsAction ? 1 : 0, label: () => 'Action needed' },
      }}
      unreadNotifs={unreadNotifs}
      navFooter={
        <button
          type="button"
          onClick={handleLogout}
          className={`${navItemClass} w-full justify-start text-muted-foreground hover:bg-secondary/50 hover:text-foreground`}
        >
          <span className="flex items-center gap-3">
            <LogOut size={17} aria-hidden />
            Logout
          </span>
        </button>
      }
      sidebarPromo={
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
      }
    >
      {children}
    </AccountShell>
  )
}
