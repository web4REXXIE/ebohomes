'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  LayoutDashboard,
  Building2,
  KeyRound,
  CreditCard,
  MessageCircle,
  Bell,
  User,
  Star,
  LogOut,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { getUnreadMessageCount } from '@/lib/support'
import { useNotifications } from '@/components/notification-provider'
import { AccountShell, navItemClass, type AccountNavGroup } from '@/components/account-shell'
import { SectionTabs } from '@/components/section-tabs'
import { landlordVerificationDisplay } from '@/lib/landlord-verification'

// Landlord menu, simplified: six places instead of sixteen.
//   Home, Properties, Rentals, Money, Inbox (Messages and Notifications) and Account.
// Nothing was removed. The pages that used to have their own entry are now tabs at the top of their section
// (see lib/landlord-sections.ts and components/section-tabs.tsx), and the entry stays highlighted on all of them:
//   Properties: List a property, Inspection requests, Analytics (and the edit and authority pages)
//   Rentals:    Viewings, Tenancies
//   Money:      Payouts, Payout account
//   Account:    Verification, Professional profile, My company, Help
// Badges, the access check and logout are unchanged. The Applications badge sits on Rentals, the Verification
// "Action needed" marker sits on Account.
const NAV_GROUPS: AccountNavGroup[] = [
  {
    title: null,
    items: [
      { label: 'Home', href: '/dashboard', icon: LayoutDashboard, exact: true },
      {
        label: 'Properties',
        href: '/dashboard/listings',
        icon: Building2,
        alsoActive: ['/dashboard/estates', '/dashboard/edit', '/dashboard/authority', '/dashboard/inspection-requests', '/dashboard/analytics'],
      },
      {
        label: 'Rentals',
        href: '/dashboard/applications',
        icon: KeyRound,
        badgeKey: 'applications',
        alsoActive: ['/dashboard/viewings', '/dashboard/tenancies'],
      },
      {
        label: 'Money',
        href: '/dashboard/payments',
        icon: CreditCard,
        alsoActive: ['/dashboard/payouts', '/dashboard/payout-account'],
      },
    ],
  },
  {
    title: 'Inbox',
    items: [
      { label: 'Messages', href: '/dashboard/messages', icon: MessageCircle, badgeKey: 'messages' },
      { label: 'Notifications', href: '/notifications', icon: Bell, badgeKey: 'notifications' },
    ],
  },
  {
    title: null,
    items: [
      {
        label: 'Account',
        href: '/dashboard/profile',
        icon: User,
        badgeKey: 'verification',
        alsoActive: ['/dashboard/verify', '/dashboard/professional', '/dashboard/company', '/dashboard/settings'],
      },
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
      <SectionTabs />
      {children}
    </AccountShell>
  )
}
