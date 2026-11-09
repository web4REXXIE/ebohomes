'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  LayoutDashboard, ClipboardCheck, ClipboardList, Users, ShieldCheck, BadgeCheck,
  BarChart3, CreditCard, MessageSquare, LogOut, Building2, Loader2, ShieldAlert, MapPin,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { AccountShell, navItemClass, type AccountNavGroup } from '@/components/account-shell'

// Stage 18: the same 36 admin destinations as before, regrouped by the job they belong to.
// Nothing was removed, renamed or added. Stage 17's shared shell draws the sidebar and the phone menu.
// The access check below is unchanged: only a profile with role 'admin' gets in.
const NAV_GROUPS: AccountNavGroup[] = [
  { title: null, items: [{ href: '/admin', label: 'Dashboard', icon: LayoutDashboard, exact: true }] },
  { title: 'Users and organisations', items: [
    { href: '/admin/users', label: 'Manage Users', icon: Users },
    { href: '/admin/professionals', label: 'Professionals', icon: BadgeCheck },
    { href: '/admin/organizations', label: 'Companies', icon: Building2 },
    { href: '/admin/trust', label: 'Landlord Trust', icon: BarChart3 },
    { href: '/admin/staff-roles', label: 'Staff Roles', icon: ShieldCheck },
  ] },
  { title: 'Properties and listings', items: [
    { href: '/admin/property-review', label: 'Property Review', icon: ClipboardCheck },
    { href: '/admin/listing-authority', label: 'Listing Authority', icon: ShieldCheck },
    { href: '/admin/surroundings', label: 'Surroundings', icon: MapPin },
    { href: '/admin/holds', label: 'Property Holds', icon: ShieldCheck },
  ] },
  { title: 'Verification and trust', items: [
    { href: '/admin/verify-landlords', label: 'Verify Landlords', icon: ShieldCheck },
    { href: '/admin/operations', label: 'Trust Operations', icon: ShieldCheck },
    { href: '/admin/risk', label: 'Risk Alerts', icon: ShieldAlert },
    { href: '/admin/cases', label: 'Cases', icon: ClipboardList },
    { href: '/admin/disputes', label: 'Disputes', icon: ShieldCheck },
  ] },
  { title: 'Inspections', items: [
    { href: '/admin/inspections', label: 'Inspections', icon: ClipboardList },
    { href: '/admin/remote-inspections', label: 'Remote Inspections', icon: ClipboardList },
    { href: '/admin/remote-inspection-reviews', label: 'Remote Reviews', icon: ClipboardCheck },
    { href: '/admin/remote-inspection-disputes', label: 'Remote Disputes', icon: ClipboardList },
    { href: '/admin/inspection-payouts', label: 'Inspector Payouts', icon: CreditCard },
  ] },
  { title: 'Applications and rentals', items: [
    { href: '/admin/applications', label: 'Applications', icon: ClipboardCheck },
    { href: '/admin/offers', label: 'Rental Offers', icon: ClipboardList },
    { href: '/admin/reservations', label: 'Reservations', icon: ShieldCheck },
    { href: '/admin/finalization', label: 'Rental Finalization', icon: ShieldAlert },
    { href: '/admin/viewings', label: 'Viewings', icon: ClipboardList },
    { href: '/admin/handovers', label: 'Handovers', icon: ShieldCheck },
  ] },
  { title: 'Transactions and payments', items: [
    { href: '/admin/payments', label: 'Payments', icon: CreditCard },
    { href: '/admin/payment-submissions', label: 'Payment Evidence', icon: ShieldCheck },
    { href: '/admin/payouts', label: 'Landlord Payouts', icon: CreditCard },
    { href: '/admin/payout-accounts', label: 'Payout Accounts', icon: CreditCard },
    { href: '/admin/payee-requests', label: 'Rent Payees', icon: CreditCard },
  ] },
  { title: 'Messages', items: [
    { href: '/admin/support', label: 'Support Inbox', icon: MessageSquare },
    { href: '/admin/messages', label: 'Message History', icon: MessageSquare },
    { href: '/admin/contact-messages', label: 'Contact Messages', icon: MessageSquare },
  ] },
  { title: 'Reports and records', items: [
    { href: '/admin/reports', label: 'Reports', icon: BarChart3 },
    { href: '/admin/audit-log', label: 'Audit Log', icon: ClipboardList },
  ] },
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
      <main>{children}</main>
    </AccountShell>
  )
}
