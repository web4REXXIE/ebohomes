'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { LayoutDashboard, Building2, KeyRound, Wallet, ShieldAlert, Archive, LogOut, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { AccountShell, navItemClass, type AccountNavGroup } from '@/components/account-shell'
import { SectionTabs } from '@/components/section-tabs'
import { ADMIN_SECTIONS } from '@/lib/admin-sections'

// The admin menu has six places instead of nine groups and 37 entries:
//   Overview, Properties, Rentals, Money, Trust & Issues and Records.
// The pages that used to have their own entry are now tabs at the top of their section
// (see lib/admin-sections.ts and components/section-tabs.tsx), and the entry stays highlighted on all of them.
// The access check below is unchanged: only a profile with role 'admin' gets in.
// Stage 17's shared shell draws the sidebar and the phone menu.
const NAV_GROUPS: AccountNavGroup[] = [
  {
    title: null,
    items: [
      { href: '/admin', label: 'Overview', icon: LayoutDashboard, exact: true },
      {
        href: '/admin/property-review', label: 'Properties', icon: Building2,
        alsoActive: [
          '/admin/listing-authority', '/admin/holds', '/admin/verify-landlords',
          '/admin/inspections', '/admin/remote-inspections', '/admin/remote-inspection-reviews', '/admin/surroundings',
        ],
      },
      {
        href: '/admin/applications', label: 'Rentals', icon: KeyRound,
        alsoActive: [
          '/admin/verify-tenants', '/admin/viewings', '/admin/offers', '/admin/reservations',
          '/admin/finalization', '/admin/handovers', '/admin/cases',
        ],
      },
      {
        href: '/admin/payment-submissions', label: 'Money', icon: Wallet,
        alsoActive: [
          '/admin/payments', '/admin/payouts', '/admin/payout-accounts', '/admin/payee-requests', '/admin/inspection-payouts',
        ],
      },
      {
        href: '/admin/operations', label: 'Trust & Issues', icon: ShieldAlert,
        alsoActive: [
          '/admin/risk', '/admin/trusted-landlords', '/admin/reports', '/admin/remote-inspection-disputes',
          '/admin/support', '/admin/contact-messages',
        ],
      },
      {
        href: '/admin/audit-log', label: 'Records', icon: Archive,
        alsoActive: ['/admin/users', '/admin/professionals', '/admin/organizations', '/admin/staff-roles'],
      },
    ],
  },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [checking, setChecking] = useState(true)
  const [authorized, setAuthorized] = useState(false)

  useEffect(() => {
    let active = true
    const check = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle()

      if (!active) return

      if (profile?.role !== 'admin') {
        router.push('/')
        return
      }
      setAuthorized(true)
      setChecking(false)
    }
    check()
    return () => { active = false }
  }, [router])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background" role="status" aria-label="Checking access">
        <Loader2 className="animate-spin text-primary" size={28} aria-hidden />
      </div>
    )
  }

  if (!authorized) return null

  return (
    <AccountShell
      groups={NAV_GROUPS}
      navLabel="Admin menu"
      menuButtonLabel="Open admin menu"
      mobileHomeHref="/admin"
      logoHref="/admin"
      tagline="Admin"
      identity={{ name: 'EboHomes Admin', roleLabel: 'Admin', fallbackInitial: 'A' }}
      badges={{}}
      unreadNotifs={0}
      mobileHeaderAction={
        <button
          type="button"
          onClick={handleLogout}
          aria-label="Log out"
          className="focus-ring flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground"
        >
          <LogOut size={18} aria-hidden />
        </button>
      }
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
    >
      <SectionTabs sections={ADMIN_SECTIONS} />
      <main>{children}</main>
    </AccountShell>
  )
}
