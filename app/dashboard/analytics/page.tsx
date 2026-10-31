'use client'

import { useEffect, useState } from 'react'
import { Eye, Heart, FileText, MessageSquare, Home, ShieldCheck, Clock } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { listingStatusInfo } from '@/lib/listing-status'
import { TONE_CLASS } from '@/lib/viewing-status'
import { fetchTenantNames } from '@/lib/tenant-names'

type ListingPerf = {
  id: string
  title: string
  status: string
  verified: boolean
  views: number
  saves: number
  applications: number
}

type ActivityItem = {
  id: string
  tenantName: string
  listingTitle: string
  status: string
  created_at: string
}

const APP_STATUS_LABEL: Record<string, string> = {
  pending: 'With EboHomes',
  info_requested: 'Waiting for tenant',
  approved: 'Approved',
  rejected: 'Declined',
  withdrawn: 'Withdrawn',
}

// Catmull-Rom to smooth SVG path for the area chart
function smoothPath(points: { x: number; y: number }[]) {
  if (points.length < 2) return ''
  let d = `M ${points[0].x} ${points[0].y}`
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] || points[i]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[i + 2] || p2
    const cp1x = p1.x + (p2.x - p0.x) / 6
    const cp1y = p1.y + (p2.y - p0.y) / 6
    const cp2x = p2.x - (p3.x - p1.x) / 6
    const cp2y = p2.y - (p3.y - p1.y) / 6
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`
  }
  return d
}

function StatusPill({ status }: { status: string }) {
  const info = listingStatusInfo(status)
  return (
    <span className={`inline-block whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold ${TONE_CLASS[info.tone]}`}>
      {info.label}
    </span>
  )
}

export default function LandlordAnalyticsPage() {
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [listings, setListings] = useState<ListingPerf[]>([])
  const [totalViews, setTotalViews] = useState(0)
  const [totalSaves, setTotalSaves] = useState(0)
  const [totalApplications, setTotalApplications] = useState(0)
  const [totalMessages, setTotalMessages] = useState(0)
  const [applicationBreakdown, setApplicationBreakdown] = useState({ pending: 0, approved: 0, rejected: 0 })
  const [viewsByDay, setViewsByDay] = useState<{ day: string; count: number }[]>([])
  const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([])

  useEffect(() => {
    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        setLoading(false)
        return
      }

      const { data: myListings, error: listingsError } = await supabase
        .from('listings')
        .select('id, title, status, verified')
        .eq('landlord_id', user.id)

      if (listingsError) {
        setFailed(true)
        setLoading(false)
        return
      }

      if (!myListings || myListings.length === 0) {
        setLoading(false)
        return
      }

      const listingIds = myListings.map((l) => l.id)

      const [{ data: views }, { data: saves }, { data: applications }, { count: messageCount }] = await Promise.all([
        supabase.from('property_views').select('listing_id, created_at').in('listing_id', listingIds),
        supabase.from('saved_properties').select('listing_id').in('listing_id', listingIds),
        supabase.from('applications').select('id, listing_id, tenant_id, status, created_at').eq('landlord_id', user.id),
        supabase.from('messages').select('id', { count: 'exact', head: true }).eq('receiver_id', user.id),
      ])

      const perf: ListingPerf[] = myListings.map((l) => ({
        id: l.id,
        title: l.title,
        status: l.status,
        verified: l.verified,
        views: views?.filter((v) => v.listing_id === l.id).length ?? 0,
        saves: saves?.filter((s) => s.listing_id === l.id).length ?? 0,
        applications: applications?.filter((a) => a.listing_id === l.id).length ?? 0,
      }))
      perf.sort((a, b) => b.views - a.views)
      setListings(perf)

      setTotalViews(views?.length ?? 0)
      setTotalSaves(saves?.length ?? 0)
      setTotalApplications(applications?.length ?? 0)
      setTotalMessages(messageCount ?? 0)

      setApplicationBreakdown({
        pending: applications?.filter((a) => a.status === 'pending').length ?? 0,
        approved: applications?.filter((a) => a.status === 'approved').length ?? 0,
        rejected: applications?.filter((a) => a.status === 'rejected').length ?? 0,
      })

      const days: { day: string; count: number }[] = []
      for (let i = 13; i >= 0; i--) {
        const d = new Date()
        d.setDate(d.getDate() - i)
        const dayKey = d.toISOString().slice(0, 10)
        const label = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
        const count = views?.filter((v) => v.created_at?.slice(0, 10) === dayKey).length ?? 0
        days.push({ day: label, count })
      }
      setViewsByDay(days)

      // Recent activity: last 5 applications with tenant + listing names
      if (applications && applications.length > 0) {
        const recent = [...applications].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)).slice(0, 5)
        const tenantIds = [...new Set(recent.map((a) => a.tenant_id))]
        const tenantNames = await fetchTenantNames(tenantIds)
        const tenants = Object.entries(tenantNames).map(([id, full_name]) => ({ id, full_name }))

        setRecentActivity(
          recent.map((a) => ({
            id: a.id,
            tenantName: tenants?.find((t) => t.id === a.tenant_id)?.full_name ?? 'A tenant',
            listingTitle: myListings.find((l) => l.id === a.listing_id)?.title ?? 'a listing',
            status: a.status,
            created_at: a.created_at,
          }))
        )
      }

      setLoading(false)
    }

    load()
  }, [])

  if (loading) {
    return (
      <div className="animate-pulse space-y-4 p-6" aria-busy="true" aria-label="Loading analytics">
        <div className="h-6 w-1/4 rounded bg-secondary" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 rounded-xl bg-secondary" />
          ))}
        </div>
        <div className="h-56 rounded-xl bg-secondary" />
      </div>
    )
  }

  if (failed) {
    return (
      <div className="p-6">
        <h1 className="mb-1 text-xl font-bold text-foreground">Analytics</h1>
        <p role="alert" className="mt-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm font-medium text-red-900">
          We could not load your analytics. Please refresh the page.
        </p>
      </div>
    )
  }

  if (listings.length === 0) {
    return (
      <div className="p-6">
        <h1 className="mb-1 text-xl font-bold text-foreground">Analytics</h1>
        <div className="mt-4 rounded-xl border border-dashed border-border py-16 text-center">
          <Home size={30} className="mx-auto mb-3 text-muted-foreground" aria-hidden />
          <p className="text-sm text-muted-foreground">Add a property to start seeing performance data here.</p>
        </div>
      </div>
    )
  }

  // --- Chart geometry ---
  const chartW = 600
  const chartH = 140
  const maxDayCount = Math.max(...viewsByDay.map((d) => d.count), 1)
  const stepX = chartW / (viewsByDay.length - 1)
  const points = viewsByDay.map((d, i) => ({
    x: i * stepX,
    y: chartH - (d.count / maxDayCount) * (chartH - 20) - 10,
  }))
  const linePath = smoothPath(points)
  const areaPath = `${linePath} L ${chartW} ${chartH} L 0 ${chartH} Z`
  const viewsLast14 = viewsByDay.reduce((sum, d) => sum + d.count, 0)

  // --- Donut geometry ---
  const appTotal = applicationBreakdown.pending + applicationBreakdown.approved + applicationBreakdown.rejected
  const radius = 60
  const circumference = 2 * Math.PI * radius
  const segments = [
    { label: 'Approved', value: applicationBreakdown.approved, color: '#16a34a' },
    { label: 'With EboHomes', value: applicationBreakdown.pending, color: '#f59e0b' },
    { label: 'Declined', value: applicationBreakdown.rejected, color: '#ef4444' },
  ]
  let cumulative = 0

  const statCards = [
    { label: 'Total views', value: totalViews, icon: Eye, color: '#2563eb', bg: '#2563eb1a' },
    { label: 'Saves', value: totalSaves, icon: Heart, color: '#e11d48', bg: '#e11d481a' },
    { label: 'Applications', value: totalApplications, icon: FileText, color: '#d97706', bg: '#d977061a' },
    { label: 'Messages received', value: totalMessages, icon: MessageSquare, color: '#7c3aed', bg: '#7c3aed1a' },
  ]

  return (
    <div className="p-4 sm:p-6">
      <h1 className="mb-1 text-xl font-bold text-foreground">Analytics</h1>
      <p className="mb-6 text-sm text-muted-foreground">How your properties are performing.</p>

      {/* Stat cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {statCards.map((card) => (
          <div key={card.label} className="rounded-xl border border-border bg-card p-4">
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg" style={{ backgroundColor: card.bg }}>
              <card.icon size={16} style={{ color: card.color }} aria-hidden />
            </div>
            <p className="text-2xl font-bold leading-tight text-foreground">{card.value}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{card.label}</p>
          </div>
        ))}
      </div>

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Area chart */}
        <div className="rounded-xl border border-border bg-card p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Views in the last 14 days</h2>
            <span className="rounded-full bg-secondary px-2 py-1 text-xs text-muted-foreground">Daily</span>
          </div>
          <svg
            viewBox={`0 0 ${chartW} ${chartH}`}
            className="h-36 w-full"
            preserveAspectRatio="none"
            role="img"
            aria-label={`Daily views over the last 14 days. ${viewsLast14} views in total.`}
          >
            <defs>
              <linearGradient id="viewsGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--primary, #16a34a)" stopOpacity="0.35" />
                <stop offset="100%" stopColor="var(--primary, #16a34a)" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={areaPath} fill="url(#viewsGradient)" stroke="none" />
            <path d={linePath} fill="none" stroke="var(--primary, #16a34a)" strokeWidth="2.5" strokeLinecap="round" />
            {points.map((p, i) =>
              viewsByDay[i].count > 0 ? <circle key={i} cx={p.x} cy={p.y} r="2.5" fill="var(--primary, #16a34a)" /> : null
            )}
          </svg>
          <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
            <span>{viewsByDay[0]?.day}</span>
            <span>{viewsByDay[viewsByDay.length - 1]?.day}</span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{viewsLast14} views in the last 14 days.</p>
        </div>

        {/* Donut chart */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-4 text-sm font-semibold text-foreground">Applications</h2>
          {appTotal === 0 ? (
            <p className="py-8 text-center text-xs text-muted-foreground">No applications yet.</p>
          ) : (
            <>
              <div className="relative mb-4 flex items-center justify-center">
                <svg
                  viewBox="0 0 160 160"
                  className="h-36 w-36 -rotate-90"
                  role="img"
                  aria-label={`${appTotal} applications: ${segments.map((s) => `${s.value} ${s.label.toLowerCase()}`).join(', ')}.`}
                >
                  {segments.map((seg) => {
                    if (seg.value === 0) return null
                    const fraction = seg.value / appTotal
                    const dash = fraction * circumference
                    const offset = -cumulative * circumference
                    cumulative += fraction
                    return (
                      <circle
                        key={seg.label}
                        cx="80"
                        cy="80"
                        r={radius}
                        fill="none"
                        stroke={seg.color}
                        strokeWidth="18"
                        strokeDasharray={`${dash} ${circumference - dash}`}
                        strokeDashoffset={offset}
                      />
                    )
                  })}
                </svg>
                <div className="absolute flex flex-col items-center">
                  <span className="text-2xl font-bold text-foreground">{appTotal}</span>
                  <span className="text-[11px] text-muted-foreground">Total</span>
                </div>
              </div>
              <ul className="space-y-1.5">
                {segments.map((seg) => (
                  <li key={seg.label} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: seg.color }} aria-hidden />
                      {seg.label}
                    </span>
                    <span className="font-medium text-foreground">{seg.value}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Performance by property */}
        <div className="overflow-hidden rounded-xl border border-border bg-card lg:col-span-2">
          <h2 className="p-5 pb-3 text-sm font-semibold text-foreground">Performance by property</h2>

          {/* Phones: one card per property, no sideways scrolling */}
          <ul className="divide-y divide-border border-t border-border sm:hidden">
            {listings.map((l) => (
              <li key={l.id} className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-foreground">
                    <Home size={14} className="shrink-0 text-muted-foreground" aria-hidden />
                    <span className="truncate">{l.title}</span>
                    {l.verified && (
                      <ShieldCheck size={13} className="shrink-0 text-primary" aria-label="Verified listing" />
                    )}
                  </p>
                  <StatusPill status={l.status} />
                </div>
                <dl className="grid grid-cols-3 gap-2 rounded-lg bg-secondary/60 p-3 text-center">
                  <div>
                    <dt className="text-[11px] text-muted-foreground">Views</dt>
                    <dd className="text-base font-bold text-foreground">{l.views}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-muted-foreground">Saves</dt>
                    <dd className="text-base font-bold text-foreground">{l.saves}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-muted-foreground">Applications</dt>
                    <dd className="text-base font-bold text-foreground">{l.applications}</dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>

          {/* Larger screens: the table */}
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full text-sm">
              <caption className="sr-only">Views, saves and applications for each of your properties</caption>
              <thead>
                <tr className="border-t border-border text-left text-xs text-muted-foreground">
                  <th scope="col" className="px-5 py-2 font-medium">Property</th>
                  <th scope="col" className="px-5 py-2 font-medium">Status</th>
                  <th scope="col" className="px-5 py-2 text-right font-medium">Views</th>
                  <th scope="col" className="px-5 py-2 text-right font-medium">Saves</th>
                  <th scope="col" className="px-5 py-2 text-right font-medium">Applications</th>
                </tr>
              </thead>
              <tbody>
                {listings.map((l) => (
                  <tr key={l.id} className="border-t border-border">
                    <td className="px-5 py-3 font-medium text-foreground">
                      <span className="flex items-center gap-1.5">
                        <Home size={14} className="shrink-0 text-muted-foreground" aria-hidden />
                        {l.title}
                        {l.verified && <ShieldCheck size={12} className="shrink-0 text-primary" aria-label="Verified listing" />}
                      </span>
                    </td>
                    <td className="px-5 py-3"><StatusPill status={l.status} /></td>
                    <td className="px-5 py-3 text-right text-foreground">{l.views}</td>
                    <td className="px-5 py-3 text-right text-foreground">{l.saves}</td>
                    <td className="px-5 py-3 text-right text-foreground">{l.applications}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent activity */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-4 text-sm font-semibold text-foreground">Recent applications</h2>
          {recentActivity.length === 0 ? (
            <p className="py-8 text-center text-xs text-muted-foreground">No recent applications.</p>
          ) : (
            <ul className="space-y-4">
              {recentActivity.map((item) => (
                <li key={item.id} className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary">
                    <Clock size={12} className="text-muted-foreground" aria-hidden />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm leading-snug text-foreground">
                      <span className="font-medium">{item.tenantName}</span> applied to{' '}
                      <span className="font-medium">{item.listingTitle}</span>
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {new Date(item.created_at).toLocaleDateString('en-NG')} · {APP_STATUS_LABEL[item.status] ?? item.status}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}