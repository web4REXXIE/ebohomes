'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  LayoutDashboard, ClipboardCheck, ClipboardList, Users, ShieldCheck, BadgeCheck,
  BarChart3, CreditCard, MessageSquare, LogOut, Building2, Loader2, Menu, X, ShieldAlert, MapPin,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'

type NavItem = { href: string; label: string; icon: typeof LayoutDashboard }
const NAV_GROUPS: { title: string | null; items: NavItem[] }[] = [
  { title: null, items: [{ href: '/admin', label: 'Dashboard', icon: LayoutDashboard }] },
  { title: 'Reviews', items: [
    { href: '/admin/operations', label: 'Trust Operations', icon: ShieldCheck },
    { href: '/admin/property-review', label: 'Property Review', icon: ClipboardCheck },
    { href: '/admin/listing-authority', label: 'Listing Authority', icon: ShieldCheck },
    { href: '/admin/risk', label: 'Risk Alerts', icon: ShieldAlert },
    { href: '/admin/inspections', label: 'Inspections', icon: ClipboardList },
    { href: '/admin/remote-inspections', label: 'Remote Inspections', icon: ClipboardList },
    { href: '/admin/remote-inspection-reviews', label: 'Remote Reviews', icon: ClipboardCheck },
    { href: '/admin/remote-inspection-disputes', label: 'Remote Disputes', icon: ClipboardList },
    { href: '/admin/inspection-payouts', label: 'Inspector Payouts', icon: CreditCard },
    { href: '/admin/surroundings', label: 'Surroundings', icon: MapPin },
    { href: '/admin/verify-landlords', label: 'Verify Landlords', icon: ShieldCheck },
    { href: '/admin/professionals', label: 'Professionals', icon: BadgeCheck },
    { href: '/admin/organizations', label: 'Companies', icon: Building2 },
    { href: '/admin/payout-accounts', label: 'Payout Accounts', icon: CreditCard },
    { href: '/admin/payee-requests', label: 'Rent Payees', icon: CreditCard },
  ] },
  { title: 'Rentals', items: [
    { href: '/admin/applications', label: 'Applications', icon: ClipboardCheck },
    { href: '/admin/offers', label: 'Rental Offers', icon: ClipboardList },
    { href: '/admin/reservations', label: 'Reservations', icon: ShieldCheck },
    { href: '/admin/finalization', label: 'Rental Finalization', icon: ShieldAlert },
    { href: '/admin/viewings', label: 'Viewings', icon: ClipboardList },
    { href: '/admin/handovers', label: 'Handovers', icon: ShieldCheck },
    { href: '/admin/cases', label: 'Cases', icon: ClipboardList },
    { href: '/admin/disputes', label: 'Disputes', icon: ShieldCheck },
    { href: '/admin/holds', label: 'Property Holds', icon: ShieldCheck },
  ] },
  { title: 'Money', items: [
    { href: '/admin/payments', label: 'Payments', icon: CreditCard },
    { href: '/admin/payment-submissions', label: 'Payment Evidence', icon: ShieldCheck },
    { href: '/admin/payouts', label: 'Landlord Payouts', icon: CreditCard },
  ] },
  { title: 'People', items: [
    { href: '/admin/users', label: 'Manage Users', icon: Users },
    { href: '/admin/trust', label: 'Landlord Trust', icon: BarChart3 },
    { href: '/admin/staff-roles', label: 'Staff Roles', icon: ShieldCheck },
  ] },
  { title: 'Messages', items: [
    { href: '/admin/support', label: 'Support Inbox', icon: MessageSquare },
    { href: '/admin/messages', label: 'Message History', icon: MessageSquare },
    { href: '/admin/contact-messages', label: 'Contact Messages', icon: MessageSquare },
  ] },
  { title: 'Records', items: [
    { href: '/admin/reports', label: 'Reports', icon: BarChart3 },
    { href: '/admin/audit-log', label: 'Audit Log', icon: ClipboardList },
  ] },
]

// Dashboard is active only on its own page. Every other link is also active on its nested pages.
function isActive(pathname: string | null, href: string) {
  if (!pathname) return false
  if (href === '/admin') return pathname === '/admin'
  return pathname === href || pathname.startsWith(href + '/')
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [checking, setChecking] = useState(true)
  const [authorized, setAuthorized] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

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

  // Close the phone menu when the page changes.
  useEffect(() => {
    setMenuOpen(false)
  }, [pathname])

  // Escape closes the phone menu.
  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen])

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

  const renderNav = () => (
    <nav aria-label="Admin menu" className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
      {NAV_GROUPS.map((group, gi) => (
        <div key={group.title ?? gi} className={gi === 0 ? '' : 'pt-3'}>
          {group.title && <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.title}</p>}
          <div className="space-y-1">
      {group.items.map((item) => {
        const active = isActive(pathname, item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={`flex min-h-11 items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              active
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
            }`}
          >
            <item.icon size={16} aria-hidden />
            {item.label}
          </Link>
        )
      })}
          </div>
        </div>
      ))}
    </nav>
  )

  const logoutButton = (
    <button
      onClick={handleLogout}
      className="flex min-h-11 items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
    >
      <LogOut size={16} aria-hidden />
      Logout
    </button>
  )

  return (
    <div className="min-h-screen flex bg-background">
      {/* Sidebar (large screens) */}
      <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-border bg-card h-screen sticky top-0">
        <div className="flex items-center gap-2 px-5 py-5 border-b border-border">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <Building2 size={16} className="text-primary-foreground" aria-hidden />
          </div>
          <div>
            <p className="font-bold text-foreground leading-none">EboHomes</p>
            <p className="text-[10px] text-muted-foreground">Admin</p>
          </div>
        </div>

        {renderNav()}

        <div className="p-3 border-t border-border">{logoutButton}</div>
      </aside>

      {/* Main content */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="md:hidden sticky top-0 z-10 flex items-center justify-between px-4 py-2 border-b border-border bg-card">
          <button
            onClick={() => setMenuOpen(true)}
            aria-label="Open admin menu"
            aria-expanded={menuOpen}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-secondary"
          >
            <Menu size={18} aria-hidden />
          </button>
          <p className="font-bold text-foreground">EboHomes Admin</p>
          <button
            onClick={handleLogout}
            aria-label="Log out"
            className="flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground"
          >
            <LogOut size={18} aria-hidden />
          </button>
        </header>

        {menuOpen && (
          <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Admin menu">
            <button
              type="button"
              aria-label="Close menu"
              className="absolute inset-0 bg-black/50"
              onClick={() => setMenuOpen(false)}
            />
            <div className="absolute left-0 top-0 flex h-full w-72 max-w-[85vw] flex-col bg-card shadow-xl">
              <div className="flex items-center justify-between border-b border-border p-3 pl-5">
                <span className="font-extrabold text-primary">EboHomes Admin</span>
                <button
                  onClick={() => setMenuOpen(false)}
                  aria-label="Close menu"
                  className="flex h-11 w-11 items-center justify-center"
                >
                  <X size={20} aria-hidden />
                </button>
              </div>
              {renderNav()}
              <div className="border-t border-border p-3">{logoutButton}</div>
            </div>
          </div>
        )}

        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  )
}
