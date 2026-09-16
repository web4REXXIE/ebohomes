'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Users, Home, ClipboardCheck, ShieldCheck, MessageSquare, Loader2,
  Wallet, ArrowRight, FileWarning, AlertTriangle,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'

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

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [recentListings, setRecentListings] = useState<any[]>([])
  const [recentActivity, setRecentActivity] = useState<any[]>([])
  const [revenueTrend, setRevenueTrend] = useState<{ date: string; amount: number }[]>([])
  const [bookingBreakdown, setBookingBreakdown] = useState<{ name: string; value: number }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchDashboard()
  }, [])

  async function fetchDashboard() {
    setLoading(true)

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
      { data: recent },
      { data: payments },
      { data: bookings },
    ] = await Promise.all([
      supabase.from('profiles').select('*', { count: 'exact', head: true }),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'landlord'),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'tenant'),
      supabase.from('listings').select('*', { count: 'exact', head: true }).or('status.eq.pending,status.is.null'),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'landlord').eq('verification_status', 'pending'),
      supabase.from('listings').select('*', { count: 'exact', head: true }),
      supabase.from('bookings').select('*', { count: 'exact', head: true }),
      user
        ? supabase.from('messages').select('*', { count: 'exact', head: true }).eq('receiver_id', user.id).is('read_at', null)
        : Promise.resolve({ count: 0 }),
      supabase.from('listings').select('id, title, location_text, price_monthly, status, created_at, photos').order('created_at', { ascending: false }).limit(5),
      // ⚠️ assumes a column called `amount` — adjust once you confirm the real column name
      supabase.from('payments').select('amount, created_at').order('created_at', { ascending: true }),
      supabase.from('bookings').select('status, created_at').order('created_at', { ascending: false }).limit(200),
    ])

    const totalRevenue = (payments ?? []).reduce((sum, p: any) => sum + (Number(p.amount) || 0), 0)

    // Group revenue by day for the bar chart
    const byDay = new Map<string, number>()
    ;(payments ?? []).forEach((p: any) => {
      const day = new Date(p.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
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
    ;(payments ?? []).slice(-3).forEach((p: any) =>
      activity.push({ type: 'payment', text: `Payment received: ₦${Number(p.amount || 0).toLocaleString()}`, at: p.created_at })
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
    setLoading(false)
  }

  if (loading || !stats) {
    return (
      <div className="flex items-center justify-center h-full py-20">
        <Loader2 className="animate-spin text-primary" size={28} />
      </div>
    )
  }

  const pendingActionsTotal = stats.pendingReview + stats.pendingVerification + stats.unreadAdminMessages
  const maxRevenue = Math.max(...revenueTrend.map((r) => r.amount), 1)
  const totalBookingsForDonut = bookingBreakdown.reduce((sum, b) => sum + b.value, 0) || 1

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
    { label: 'Total Users', value: stats.totalUsers, icon: Users, tint: 'text-primary bg-primary/10', href: '/admin/users' },
    { label: 'Active Listings', value: stats.totalListings, icon: Home, tint: 'text-emerald-600 bg-emerald-50', href: '/admin/property-review' },
    { label: 'Total Bookings', value: stats.totalBookings, icon: ClipboardCheck, tint: 'text-blue-600 bg-blue-50', href: '/admin/reports' },
    { label: 'Total Revenue', value: `₦${stats.totalRevenue.toLocaleString()}`, icon: Wallet, tint: 'text-amber-600 bg-amber-50', href: '/admin/payments' },
    { label: 'Pending Actions', value: pendingActionsTotal, icon: AlertTriangle, tint: 'text-purple-600 bg-purple-50', href: '/admin/property-review' },
  ]

  const pendingActions = [
    { label: 'Property Reviews', value: stats.pendingReview, icon: ClipboardCheck, href: '/admin/property-review' },
    { label: 'Verify Landlords', value: stats.pendingVerification, icon: ShieldCheck, href: '/admin/verify-landlords' },
    { label: 'Unread Messages', value: stats.unreadAdminMessages, icon: MessageSquare, href: '/admin/messages' },
  ]

  const quickAccess = [
    { label: 'Property Review', icon: ClipboardCheck, href: '/admin/property-review' },
    { label: 'Verify Landlords', icon: ShieldCheck, href: '/admin/verify-landlords' },
    { label: 'Manage Users', icon: Users, href: '/admin/users' },
    { label: 'Reports', icon: FileWarning, href: '/admin/reports' },
    { label: 'Payments', icon: Wallet, href: '/admin/payments' },
    { label: 'Messages', icon: MessageSquare, href: '/admin/messages' },
  ]

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold text-foreground mb-1">Dashboard</h1>
      <p className="text-sm text-muted-foreground mb-6">Overview of platform activity.</p>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        {cards.map((c) => (
          <Link
            key={c.label}
            href={c.href}
            className="bg-card border border-border rounded-xl p-4 flex items-center gap-3 hover:border-primary transition-colors"
          >
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${c.tint}`}>
              <c.icon size={18} />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-bold text-foreground truncate">{c.value.toLocaleString?.() ?? c.value}</p>
              <p className="text-xs text-muted-foreground">{c.label}</p>
            </div>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Revenue — CSS bar chart, no library */}
        <div className="lg:col-span-2 bg-card border border-border rounded-xl p-5">
          <h2 className="font-semibold text-foreground mb-4">Revenue Overview</h2>
          {revenueTrend.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-12">No payment records yet.</p>
          ) : (
            <div className="flex items-end gap-2 h-48">
              {revenueTrend.map((r) => (
                <div key={r.date} className="flex-1 flex flex-col items-center justify-end h-full group relative">
                  <div
                    className="w-full bg-primary/80 hover:bg-primary rounded-t-md transition-all"
                    style={{ height: `${(r.amount / maxRevenue) * 100}%`, minHeight: r.amount > 0 ? '4px' : '0px' }}
                  />
                  <span className="text-[9px] text-muted-foreground mt-1.5 -rotate-45 origin-top-left whitespace-nowrap">
                    {r.date}
                  </span>
                  <div className="absolute -top-7 bg-foreground text-background text-[10px] font-medium px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                    ₦{r.amount.toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Bookings — CSS conic-gradient donut, no library */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="font-semibold text-foreground mb-4">Bookings Overview</h2>
          {bookingBreakdown.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-12">No bookings yet.</p>
          ) : (
            <>
              <div className="flex justify-center mb-4">
                <div
                  className="relative w-36 h-36 rounded-full flex items-center justify-center"
                  style={{ background: donutBackground }}
                >
                  <div className="w-20 h-20 rounded-full bg-card flex flex-col items-center justify-center">
                    <p className="text-lg font-bold text-foreground">{totalBookingsForDonut}</p>
                    <p className="text-[9px] text-muted-foreground">Total</p>
                  </div>
                </div>
              </div>
              <div className="space-y-1.5">
                {bookingBreakdown.map((b) => (
                  <div key={b.name} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 capitalize text-muted-foreground">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: BOOKING_COLORS[b.name] ?? '#94a3b8' }} />
                      {b.name}
                    </span>
                    <span className="font-medium text-foreground">
                      {b.value} ({Math.round((b.value / totalBookingsForDonut) * 100)}%)
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent activity */}
        <div className="lg:col-span-2 bg-card border border-border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-border">
            <h2 className="font-semibold text-foreground">Recent Activity</h2>
          </div>
          {recentActivity.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground text-center">No recent activity.</p>
          ) : (
            <div className="divide-y divide-border">
              {recentActivity.map((a, i) => (
                <div key={i} className="flex items-center gap-3 p-4">
                  <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center shrink-0">
                    {a.type === 'listing' && <Home size={14} className="text-emerald-600" />}
                    {a.type === 'booking' && <ClipboardCheck size={14} className="text-blue-600" />}
                    {a.type === 'payment' && <Wallet size={14} className="text-amber-600" />}
                  </div>
                  <p className="text-sm text-foreground flex-1 truncate">{a.text}</p>
                  <p className="text-[11px] text-muted-foreground shrink-0">
                    {new Date(a.at).toLocaleDateString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick access */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="font-semibold text-foreground mb-4">Quick Access</h2>
          <div className="grid grid-cols-2 gap-3 mb-6">
            {quickAccess.map((q) => (
              <Link
                key={q.label}
                href={q.href}
                className="flex flex-col items-center justify-center gap-1.5 border border-border rounded-lg py-3 text-center hover:border-primary hover:bg-secondary/40 transition-colors"
              >
                <q.icon size={16} className="text-primary" />
                <span className="text-[11px] font-medium text-foreground">{q.label}</span>
              </Link>
            ))}
          </div>

          <h3 className="text-sm font-semibold text-foreground mb-2">Pending Actions</h3>
          <div className="space-y-2">
            {pendingActions.map((p) => (
              <Link
                key={p.label}
                href={p.href}
                className="flex items-center justify-between text-sm hover:text-primary transition-colors"
              >
                <span className="flex items-center gap-2 text-muted-foreground">
                  <p.icon size={14} /> {p.label}
                </span>
                <span className="font-semibold text-foreground">{p.value}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden mt-6">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="font-semibold text-foreground">Recently Submitted Listings</h2>
          <Link href="/admin/property-review" className="text-xs text-primary font-medium flex items-center gap-1 hover:underline">
            Review all <ArrowRight size={12} />
          </Link>
        </div>
        {recentListings.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground text-center">No listings yet.</p>
        ) : (
          <div className="divide-y divide-border">
            {recentListings.map((l) => (
              <div key={l.id} className="flex items-center gap-3 p-4">
                {l.photos?.[0] ? (
                  <img src={l.photos[0]} className="w-12 h-12 rounded-lg object-cover bg-secondary shrink-0" />
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-secondary shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">{l.title || 'Untitled listing'}</p>
                  <p className="text-xs text-muted-foreground truncate">{l.location_text}</p>
                </div>
                <p className="text-sm font-semibold text-primary shrink-0">₦{l.price_monthly?.toLocaleString()}</p>
                <span className={`text-[10px] font-medium px-2 py-1 rounded-full capitalize shrink-0 ${
                  l.status === 'approved' ? 'bg-emerald-50 text-emerald-700'
                  : l.status === 'rejected' ? 'bg-red-50 text-red-700'
                  : 'bg-amber-50 text-amber-700'
                }`}>
                  {l.status || 'pending'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}