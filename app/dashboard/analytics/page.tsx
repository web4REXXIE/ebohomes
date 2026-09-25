'use client'

import { useEffect, useState } from 'react'
import { Eye, Heart, FileText, MessageSquare, Home, ShieldCheck, Clock } from 'lucide-react'
import { supabase } from '@/lib/supabase'

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

export default function LandlordAnalyticsPage() {
  const [loading, setLoading] = useState(true)
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

      const { data: myListings } = await supabase
        .from('listings')
        .select('id, title, status, verified')
        .eq('landlord_id', user.id)

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
        const { data: tenants } = await supabase.from('profiles').select('id, full_name').in('id', tenantIds)

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
      <div className="p-6 animate-pulse space-y-4">
        <div className="h-6 bg-secondary rounded w-1/4" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 bg-secondary rounded-xl" />
          ))}
        </div>
        <div className="h-56 bg-secondary rounded-xl" />
      </div>
    )
  }

  if (listings.length === 0) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-bold text-foreground mb-1">Analytics</h1>
        <div className="text-center py-16 border border-dashed border-border rounded-xl mt-4">
          <p className="text-muted-foreground text-sm">Add a property to start seeing performance data here.</p>
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

  // --- Donut geometry ---
  const appTotal = applicationBreakdown.pending + applicationBreakdown.approved + applicationBreakdown.rejected
  const radius = 60
  const circumference = 2 * Math.PI * radius
  const segments = [
    { label: 'Approved', value: applicationBreakdown.approved, color: '#16a34a' },
    { label: 'Pending', value: applicationBreakdown.pending, color: '#f59e0b' },
    { label: 'Rejected', value: applicationBreakdown.rejected, color: '#ef4444' },
  ]
  let cumulative = 0

  const statCards = [
    { label: 'Total Views', value: totalViews, icon: Eye, color: '#2563eb', bg: '#2563eb1a' },
    { label: 'Saves', value: totalSaves, icon: Heart, color: '#e11d48', bg: '#e11d481a' },
    { label: 'Applications', value: totalApplications, icon: FileText, color: '#d97706', bg: '#d977061a' },
    { label: 'Messages', value: totalMessages, icon: MessageSquare, color: '#7c3aed', bg: '#7c3aed1a' },
  ]

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold text-foreground mb-1">Analytics</h1>
      <p className="text-sm text-muted-foreground mb-6">How your properties are performing.</p>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {statCards.map((card) => (
          <div key={card.label} className="bg-card border border-border rounded-xl p-4">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center mb-3"
              style={{ backgroundColor: card.bg }}
            >
              <card.icon size={16} style={{ color: card.color }} />
            </div>
            <p className="text-2xl font-bold text-foreground leading-tight">{card.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{card.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Area chart */}
        <div className="lg:col-span-2 bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-foreground">Views — last 14 days</h2>
            <span className="text-xs text-muted-foreground bg-secondary px-2 py-1 rounded-full">Daily</span>
          </div>
          <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full h-36" preserveAspectRatio="none">
            <defs>
              <linearGradient id="viewsGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--primary, #16a34a)" stopOpacity="0.35" />
                <stop offset="100%" stopColor="var(--primary, #16a34a)" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={areaPath} fill="url(#viewsGradient)" stroke="none" />
            <path d={linePath} fill="none" stroke="var(--primary, #16a34a)" strokeWidth="2.5" strokeLinecap="round" />
            {points.map((p, i) =>
              viewsByDay[i].count > 0 ? (
                <circle key={i} cx={p.x} cy={p.y} r="2.5" fill="var(--primary, #16a34a)" />
              ) : null
            )}
          </svg>
          <div className="flex justify-between mt-1 text-[10px] text-muted-foreground">
            <span>{viewsByDay[0]?.day}</span>
            <span>{viewsByDay[viewsByDay.length - 1]?.day}</span>
          </div>
        </div>

        {/* Donut chart */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">Applications</h2>
          {appTotal === 0 ? (
            <p className="text-xs text-muted-foreground py-8 text-center">No applications yet.</p>
          ) : (
            <>
              <div className="relative flex items-center justify-center mb-4">
                <svg viewBox="0 0 160 160" className="w-36 h-36 -rotate-90">
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
                  <span className="text-[10px] text-muted-foreground">Total</span>
                </div>
              </div>
              <div className="space-y-1.5">
                {segments.map((seg) => (
                  <div key={seg.label} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: seg.color }} />
                      {seg.label}
                    </span>
                    <span className="text-foreground font-medium">{seg.value}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Performance table */}
        <div className="lg:col-span-2 bg-card border border-border rounded-xl overflow-hidden">
          <h2 className="text-sm font-semibold text-foreground p-5 pb-2">Performance by property</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground text-xs border-t border-border">
                  <th className="px-5 py-2 font-medium">Property</th>
                  <th className="px-5 py-2 font-medium">Status</th>
                  <th className="px-5 py-2 font-medium text-right">Views</th>
                  <th className="px-5 py-2 font-medium text-right">Saves</th>
                  <th className="px-5 py-2 font-medium text-right">Applications</th>
                </tr>
              </thead>
              <tbody>
                {listings.map((l) => (
                  <tr key={l.id} className="border-t border-border">
                    <td className="px-5 py-3 text-foreground font-medium">
                      <span className="flex items-center gap-1.5">
                        <Home size={14} className="text-muted-foreground shrink-0" />
                        {l.title}
                        {l.verified && <ShieldCheck size={12} className="text-primary shrink-0" />}
                      </span>
                    </td>
                    <td className="px-5 py-3 capitalize text-muted-foreground">{l.status}</td>
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
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">Recent Activity</h2>
          {recentActivity.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">No recent applications.</p>
          ) : (
            <div className="space-y-4">
              {recentActivity.map((item) => (
                <div key={item.id} className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center shrink-0 mt-0.5">
                    <Clock size={12} className="text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-foreground leading-snug">
                      <span className="font-medium">{item.tenantName}</span> applied to{' '}
                      <span className="font-medium">{item.listingTitle}</span>
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {new Date(item.created_at).toLocaleDateString()} · <span className="capitalize">{item.status}</span>
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <p className="text-xs text-muted-foreground mt-4">
        Payment and booking analytics will appear here once those systems are built (Phase 8).
      </p>
    </div>
  )
}