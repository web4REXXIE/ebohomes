'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
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
  ShieldCheck,
  BadgeCheck,
  Building2,
  FileText,
  CalendarClock,
  ClipboardCheck,
  KeyRound,
  LogOut,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { getUnreadMessageCount } from '@/lib/support'
import { useNotifications } from '@/components/notification-provider'
import { AccountShell, navItemClass, type AccountNavGroup } from '@/components/account-shell'
import { landlordVerificationDisplay } from '@/lib/landlord-verification'

// Landlord menu: the same 16 destinations as before, now in 4 groups instead of 5, in the same order of use
// as the tenant menu. Nothing was removed.
// - Inspection requests and Analytics sit under Properties, because both are about the landlord's properties.
// - Professional Profile and My Company sit under Account.
// - "Get Verified" is now "Verification" (it reads wrongly once the landlord is verified). It keeps its
//   small "Action needed" marker, which only shows while the landlord still has something to do.
// Badges, active-route rules, the access check and logout are unchanged.
const NAV_GROUPS: AccountNavGroup[] = [
  {
    title: null,
    items: [{ label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, exact: true }],
  },
  {
    title: 'Properties',
    items: [
      { label: 'My Properties', href: '/dashboard/listings', icon: List },
      { label: 'Add New Listing', href: '/list-property', icon: Plus },
      { label: 'My Estates', href: '/dashboard/estates', icon: Building2 },
      { label: 'Inspection requests', href: '/dashboard/inspection-requests', icon: ClipboardCheck },
      { label: 'Analytics', href: '/dashboard/analytics', icon: BarChart3 },
    ],
  },
  {
    title: 'Tenants and rent',
    items: [
      { label: 'Applications', href: '/dashboard/applications', icon: FileText, badgeKey: 'applications' },
      { label: 'Viewings', href: '/dashboard/viewings', icon: CalendarClock },
      { label: 'Tenancies', href: '/dashboard/tenancies', icon: KeyRound },
      { label: 'Payments', href: '/dashboard/payments', icon: CreditCard },
      { label: 'Messages', href: '/dashboard/messages', icon: MessageCircle, badgeKey: 'messages' },
    ],
  },
  {
    title: 'Account',
    items: [
      { label: 'Notifications', href: '/notifications', icon: Bell, badgeKey: 'notifications' },
      { label: 'Verification', href: '/dashboard/verify', icon: ShieldCheck, badgeKey: 'verification' },
      { label: 'Profile', href: '/dashboard/profile', icon: User },
      { label: 'Professional Profile', href: '/dashboard/professional', icon: BadgeCheck },
      { label: 'My Company', href: '/dashboard/company', icon: Building2 },
      { label: 'Help & Support', href: '/contact', icon: HelpCircle },
    ],
  },
]

// The sidebar, phone header and phone menu come from components/account-shell.tsx.
// The Dashboard link is active only on its own page (exact: true). Every other link is also active on nested pages.

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [unreadMessages, setUnreadMessages] = useState(0)
  const { unreadCount: unreadNotifs } = useNotifications()
  const [pendingApplications, setPendingApplications] = useState(0)

  useEffect(() => {
    let cancelled = false
    let redirected = false

    const checkAccess = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          redirected = true
          router.push('/login?redirect=/dashboard')
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

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  // Uses the same checks as the Verification page, so the marker and that page always agree.
  const verificationNeedsAction = landlordVerificationDisplay(profile).needsAction

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

  return (
    <AccountShell
      groups={NAV_GROUPS}
      navLabel="Landlord menu"
      menuButtonLabel="Open menu"
      mobileHomeHref="/dashboard"
      identity={{
        name: displayName,
        roleLabel: 'Landlord',
        fallbackInitial: displayName[0]?.toUpperCase() ?? 'L',
        avatarUrl: profile?.avatar_url,
      }}
      badges={{
        messages: { count: unreadMessages, label: (n) => `${n} unread ${n === 1 ? 'message' : 'messages'}` },
        notifications: { count: unreadNotifs, label: (n) => `${n} unread ${n === 1 ? 'notification' : 'notifications'}` },
        verification: { count: verificationNeedsAction ? 1 : 0, label: () => 'Action needed' },
        applications: {
          count: pendingApplications,
          label: (n) => `${n} ${n === 1 ? 'application' : 'applications'} without your recommendation`,
        },
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
      }
    >
      {children}
    </AccountShell>
  )
}
