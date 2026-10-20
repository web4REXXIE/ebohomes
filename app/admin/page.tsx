'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Users, Home, ClipboardCheck, ShieldCheck, MessageSquare, Loader2,
  Wallet, ArrowRight, FileWarning, AlertTriangle,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { AdminNeedsAttention } from '@/components/admin-needs-attention'

type Stats = {
  totalUsers: number
  landlords: number
  tenants: number
  pendingReview: number
  pendingVerification: number
  totalListings: number
  unreadAdminMessages: number
  totalBookings: number
  totalRevenue: number
}

const BOOKING_COLORS: Record<string, string> = {
  completed: '#059669',
  upcoming: '#2563eb',
  cancelled: '#f59e0b',
  pending: '#a855f7',
}

const naira = (n: number) => `₦${n.toLocaleString('en-NG')}`

function listingBadge(status: string | null) {
  if (status === 'approved') return { label: 'Approved', cls: 'border-emerald-300 bg-emerald-50 text-emerald-900' }
  if (status === 'rejected') return { label: 'Rejected', cls: 'border-red-300 bg-red-50 text-red-900' }
  if (status === 'suspended') return { label: 'Suspended', cls: 'border-red-300 bg-red-50 text-red-900' }
  if (status === 'paused') return { label: 'Paused', cls: 'border-slate-300 bg-slate-100 text-slate-800' }
  if (status === 'inspection_required') return { label: 'Inspection needed', cls: 'border-amber-300 bg-amber-50 text-amber-900' }
  return { label: 'Needs review', cls: 'border-amber-300 bg-amber-50 text-amber-900' }
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [recentListings, setRecentListings] = useState<any[]>([])
  const [recentActivity, setRecentActivity] = useState<any[]>([])
  const [revenueTrend, setRevenueTrend] = useState<{ date: string; amount: number }[]>([])
  const [bookingBreakdown, setBookingBreakdown] = useState<{ name: string; value: number }[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    fetchDashboard()
  }, [])

  async function fetchDashboard() {
    setLoading(true)
    setFailed(false)

    try {
      const { data: { user } } = await supabase.auth.getUser()

      const [
        { count: totalUsers },
        { count: landlords },
        { count: tenants },
        { count: pendingReview },
        { count: pendingVerification },
        { count: totalListings },
        { count: totalBookings },
        unreadResult,
        { data: recent, error: recentErr },
        { data: payments, error: payErr },
        { data: bookings, error: bookErr },
      ] = await Promise.all([
        supabase.from('profiles').select('*', { count: 'exact', head: true }),
        supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'landlord'),
        supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'tenant'),
        supabase.from('listings').select('*', { count: 'exact', head: true }).or('status.eq.pending,status.is.null'),
        supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'landlord').eq('verification_status', 'pending'),
        supabase.from('listings').select('*', { count: 'exact', head: true }),
        supabase.from('bookings').select('*', { count: 'exact', head: true }),
        user
          ? supabase.from('support_messages').select('id', { count: 'exact', head: true }).eq('sender_kind', 'customer').is('read_at', null)
          : Promise.resolve({ count: 0 }),
        supabase.from('listings').select('id, title, location_text, price_monthly, status, created_at, photos').order('created_at', { ascending: false }).limit(5),
        // Verified revenue only: status = confirmed AND a real verified_by.
        supabase
          .from('payments')
          .select('id, amount, created_at, verified_at')
          .eq('status', 'confirmed')
          .not('verified_by', 'is', null)
          .order('created_at', { ascending: true }),
        supabase.from('bookings').select('status, created_at').order('created_at', { ascending: false }).limit(200),
      ])

      if (recentErr || payErr || bookErr) setFailed(true)

      // One entry per payment id, so a payment can never be counted twice.
      const verifiedPayments = Array.from(new Map((payments ?? []).map((p: any) => [p.id, p])).values())
      const totalRevenue = verifiedPayments.reduce((sum, p: any) => sum + (Number(p.amount) || 0), 0)

      // Group verified revenue by the day it was verified (falls back to the recorded day)
      const byDay = new Map<string, number>()
      verifiedPayments.forEach((p: any) => {
        const day = new Date(p.verified_at ?? p.created_at).toLocaleDateString('en-NG', { month: 'short', day: 'numeric' })
        byDay.set(day, (byDay.get(day) ?? 0) + (Number(p.amount) || 0))
      })
      setRevenueTrend(Array.from(byDay.entries()).map(([date, amount]) => ({ date, amount })).slice(-14))

      // Group bookings by status for the donut
      const byStatus = new Map<string, number>()
      ;(bookings ?? []).forEach((b: any) => {
        const s = b.status ?? 'pending'
        byStatus.set(s, (byStatus.get(s) ?? 0) + 1)
      })
      setBookingBreakdown(Array.from(byStatus.entries()).map(([name, value]) => ({ name, value })))

      // Best-effort activity feed
      const activity: any[] = []
      ;(recent ?? []).slice(0, 3).forEach((l: any) =>
        activity.push({ type: 'listing', text: `New listing: ${l.title || 'Untitled'}`, at: l.created_at })
      )
      ;(bookings ?? []).slice(0, 3).forEach((b: any) =>
        activity.push({ type: 'booking', text: `Booking ${b.status ?? 'pending'}`, at: b.created_at })
      )
      verifiedPayments.slice(-3).forEach((p: any) =>
        activity.push({ type: 'payment', text: `Verified payment: ${naira(Number(p.amount || 0))}`, at: p.verified_at ?? p.created_at })
      )
      activity.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      setRecentActivity(activity.slice(0, 6))

      setStats({
        totalUsers: totalUsers ?? 0,
        landlords: landlords ?? 0,
        tenants: tenants ?? 0,
        pendingReview: pendingReview ?? 0,
        pendingVerification: pendingVerification ?? 0,
        totalListings: totalListings ?? 0,
        unreadAdminMessages: (unreadResult as any)?.count ?? 0,
        totalBookings: totalBookings ?? 0,
        totalRevenue,
      })
      setRecentListings(recent ?? [])
    } catch (err) {
      console.error('Admin dashboard failed to load:', err)
      setFailed(true)
      setStats((s) => s ?? {
        totalUsers: 0, landlords: 0, tenants: 0, pendingReview: 0, pendingVerification: 0,
        totalListings: 0, unreadAdminMessages: 0, totalBookings: 0, totalRevenue: 0,
      })
    }
    setLoading(false)
  }

  if (loading || !stats) {
    return (
      <div className="flex items-center justify-center h-full py-20" role="status" aria-label="Loading dashboard">
        <Loader2 className="animate-spin text-primary" size={28} aria-hidden />
      </div>
    )
  }

  const pendingActionsTotal = stats.pendingReview + stats.pendingVerification + stats.unreadAdminMessages
  const maxRevenue = Math.max(...revenueTrend.map((r) => r.amount), 1)
  const totalBookingsForDonut = bookingBreakdown.reduce((sum, b) => sum + b.value, 0) || 1
  const revenueInChart = revenueTrend.reduce((sum, r) => sum + r.amount, 0)

  // Build conic-gradient stops for the CSS donut
  let cumulative = 0
  const donutStops = bookingBreakdown.map((b) => {
    const start = (cumulative / totalBookingsForDonut) * 360
    cumulative += b.value
    const end = (cumulative / totalBookingsForDonut) * 360
    return `${BOOKING_COLORS[b.name] ?? '#94a3b8'} ${start}deg ${end}deg`
  })
  const donutBackground = donutStops.length > 0
    ? `conic-gradient(${donutStops.join(', ')})`
    : '#e5e7eb'

  const cards = [
    { label: 'Total users', value: stats.totalUsers.toLocaleString('en-NG'), icon: Users, tint: 'text-primary bg-primary/10', href: '/admin/users' },
    { label: 'All listings', value: stats.totalListings.toLocaleString('en-NG'), icon: Home, tint: 'text-emerald-700 bg-emerald-50', href: '/admin/property-review' },
    { label: 'Total bookings', value: stats.totalBookings.toLocaleString('en-NG'), icon: ClipboardCheck, tint: 'text-blue-700 bg-blue-50', href: '/admin/reports' },
    { label: 'Verified revenue', value: naira(stats.totalRevenue), icon: Wallet, tint: 'text-amber-700 bg-amber-50', href: '/admin/payments' },
    { label: 'Pending actions', value: pendingActionsTotal.toLocaleString('en-NG'), icon: AlertTriangle, tint: 'text-purple-700 bg-purple-50', href: '/admin/property-review' },
  ]

  const pendingActions = [
    { label: 'Property reviews', value: stats.pendingReview, icon: ClipboardCheck, href: '/admin/property-review' },
    { label: 'Verify landlords', value: stats.pendingVerification, icon: ShieldCheck, href: '/admin/verify-landlords' },
    { label: 'Unread support messages', value: stats.unreadAdminMessages, icon: MessageSquare, href: '/admin/support' },
  ]

  const quickAccess = [
    { label: 'Property Review', icon: ClipboardCheck, href: '/admin/property-review' },
    { label: 'Verify Landlords', icon: ShieldCheck, href: '/admin/verify-landlords' },
    { label: 'Manage Users', icon: Users, href: '/admin/users' },
    { label: 'Reports', icon: FileWarning, href: '/admin/reports' },
    { label: 'Support Inbox', icon: MessageSquare, href: '/admin/support' },
  ]

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold text-foreground mb-1">Dashboard</h1>
      <p className="text-sm text-muted-foreground mb-6">What needs your attention first, then an overview of platform activity.</p>

      {failed && (
        <div role="alert" className="mb-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm font-medium text-red-900">
          Some dashboard numbers could not load, so they may be wrong or empty.{' '}
          <button onClick={fetchDashboard} className="min-h-11 font-semibold underline">Try again</button>
        </div>
      )}

      <AdminNeedsAttention />

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 md:gap-4 mb-8">
        {cards.map((c) => (
          <Link
            key={c.label}
            href={c.href}
            className="bg-card border border-border rounded-xl p-4 flex items-center gap-3 hover:border-primary transition-colors"
          >
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${c.tint}`}>
              <c.icon size={18} aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-bold text-foreground truncate">{c.value}</p>
              <p className="text-xs text-muted-foreground">{c.label}</p>
            </div>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Revenue: CSS bar chart, no library */}
        <div className="lg:col-span-2 bg-card border border-border rounded-xl p-5">
          <h2 className="font-semibold text-foreground mb-1">Verified revenue overview</h2>
          <p className="text-xs text-muted-foreground mb-4">Only payments that EboHomes has verified are counted.</p>
          {revenueTrend.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-12">No verified payments yet.</p>
          ) : (
            <>
              <div
                className="flex items-end gap-1.5 sm:gap-2 h-48"
                role="img"
                aria-label={`Verified revenue over the last ${revenueTrend.length} days with payments: ${naira(revenueInChart)} in total.`}
              >
                {revenueTrend.map((r) => (
                  <div key={r.date} className="flex-1 flex flex-col items-center justify-end h-full group relative" title={`${r.date}: ${naira(r.amount)}`}>
                    <div
                      className="w-full bg-primary/80 hover:bg-primary rounded-t-md transition-all"
                      style={{ height: `${(r.amount / maxRevenue) * 100}%`, minHeight: r.amount > 0 ? '4px' : '0px' }}
                    />
                    <span className="hidden sm:block text-[9px] text-muted-foreground mt-1.5 -rotate-45 origin-top-left whitespace-nowrap">
                      {r.date}
                    </span>
                    <div className="absolute -top-7 bg-foreground text-background text-[10px] font-medium px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                      {naira(r.amount)}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex justify-between text-[11px] text-muted-foreground sm:hidden">
                <span>{revenueTrend[0]?.date}</span>
                <span>{revenueTrend[revenueTrend.length - 1]?.date}</span>
              </div>
              <p className="mt-3 text-xs text-muted-foreground sm:mt-6">
                {naira(revenueInChart)} verified across the {revenueTrend.length} most recent {revenueTrend.length === 1 ? 'day' : 'days'} with payments.
              </p>
            </>
          )}
        </div>

        {/* Bookings: CSS conic-gradient donut, no library */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="font-semibold text-foreground mb-4">Bookings overview</h2>
          {bookingBreakdown.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-12">No bookings yet.</p>
          ) : (
            <>
              <div className="flex justify-center mb-4">
                <div
                  className="relative w-36 h-36 rounded-full flex items-center justify-center"
                  style={{ background: donutBackground }}
                  role="img"
                  aria-label={`${totalBookingsForDonut} bookings: ${bookingBreakdown.map((b) => `${b.value} ${b.name}`).join(', ')}.`}
                >
                  <div className="w-20 h-20 rounded-full bg-card flex flex-col items-center justify-center">
                    <p className="text-lg font-bold text-foreground">{totalBookingsForDonut}</p>
                    <p className="text-[10px] text-muted-foreground">Total</p>
                  </div>
                </div>
              </div>
              <ul className="space-y-1.5">
                {bookingBreakdown.map((b) => (
                  <li key={b.name} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 capitalize text-muted-foreground">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: BOOKING_COLORS[b.name] ?? '#94a3b8' }} aria-hidden />
                      {b.name}
                    </span>
                    <span className="font-medium text-foreground">
                      {b.value} ({Math.round((b.value / totalBookingsForDonut) * 100)}%)
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent activity */}
        <div className="lg:col-span-2 bg-card border border-border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-border">
            <h2 className="font-semibold text-foreground">Recent activity</h2>
          </div>
          {recentActivity.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground text-center">No recent activity.</p>
          ) : (
            <ul className="divide-y divide-border">
              {recentActivity.map((a, i) => (
                <li key={i} className="flex items-center gap-3 p-4">
                  <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center shrink-0">
                    {a.type === 'listing' && <Home size={14} className="text-emerald-700" aria-hidden />}
                    {a.type === 'booking' && <ClipboardCheck size={14} className="text-blue-700" aria-hidden />}
                    {a.type === 'payment' && <Wallet size={14} className="text-amber-700" aria-hidden />}
                  </div>
                  <p className="text-sm text-foreground flex-1 min-w-0 truncate">{a.text}</p>
                  <p className="text-[11px] text-muted-foreground shrink-0">
                    {new Date(a.at).toLocaleDateString('en-NG')}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Quick access */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="font-semibold text-foreground mb-4">Quick access</h2>
          <div className="grid grid-cols-2 gap-3 mb-6">
            {quickAccess.map((q) => (
              <Link
                key={q.label}
                href={q.href}
                className="flex min-h-16 flex-col items-center justify-center gap-1.5 border border-border rounded-lg py-3 text-center hover:border-primary hover:bg-secondary/40 transition-colors"
              >
                <q.icon size={16} className="text-primary" aria-hidden />
                <span className="text-[11px] font-medium text-foreground">{q.label}</span>
              </Link>
            ))}
          </div>

          <h3 className="text-sm font-semibold text-foreground mb-2">Pending actions</h3>
          <ul className="space-y-1">
            {pendingActions.map((p) => (
              <li key={p.label}>
                <Link
                  href={p.href}
                  className="flex min-h-11 items-center justify-between text-sm hover:text-primary transition-colors"
                >
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <p.icon size={14} aria-hidden /> {p.label}
                  </span>
                  <span className="font-semibold text-foreground">{p.value}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden mt-6">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="font-semibold text-foreground">Recently submitted listings</h2>
          <Link href="/admin/property-review" className="inline-flex min-h-11 items-center text-xs text-primary font-semibold gap-1 hover:underline">
            Review all <ArrowRight size={12} aria-hidden />
          </Link>
        </div>
        {recentListings.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground text-center">No listings yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {recentListings.map((l) => {
              const badge = listingBadge(l.status)
              return (
                <li key={l.id} className="flex items-center gap-3 p-4">
                  {l.photos?.[0] ? (
                    <img src={l.photos[0]} alt="" loading="lazy" className="w-12 h-12 rounded-lg object-cover bg-secondary shrink-0" />
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-secondary shrink-0" aria-hidden />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">{l.title || 'Untitled listing'}</p>
                    <p className="text-xs text-muted-foreground truncate">{l.location_text}</p>
                    <p className="text-sm font-semibold text-primary sm:hidden">{l.price_monthly != null ? naira(Number(l.price_monthly)) : '—'}</p>
                  </div>
                  <p className="hidden sm:block text-sm font-semibold text-primary shrink-0">
                    {l.price_monthly != null ? naira(Number(l.price_monthly)) : '—'}
                  </p>
                  <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border whitespace-nowrap shrink-0 ${badge.cls}`}>
                    {badge.label}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}