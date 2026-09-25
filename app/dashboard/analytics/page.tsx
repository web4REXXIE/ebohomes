'use client'

import { useEffect, useState } from 'react'
import { Eye, Heart, FileText, MessageSquare, Home, ShieldCheck } from 'lucide-react'
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

export default function LandlordAnalyticsPage() {
  const [loading, setLoading] = useState(true)
  const [listings, setListings] = useState<ListingPerf[]>([])
  const [totalViews, setTotalViews] = useState(0)
  const [totalSaves, setTotalSaves] = useState(0)
  const [totalApplications, setTotalApplications] = useState(0)
  const [totalMessages, setTotalMessages] = useState(0)
  const [applicationBreakdown, setApplicationBreakdown] = useState({ pending: 0, approved: 0, rejected: 0 })
  const [viewsByDay, setViewsByDay] = useState<{ day: string; count: number }[]>([])

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
        supabase.from('applications').select('listing_id, status').eq('landlord_id', user.id),
        supabase.from('messages').select('id', { count: 'exact', head: true }).eq('receiver_id', user.id),
      ])

      // Per-listing rollups
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

      // Views for the last 14 days
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
            <div key={i} className="h-24 bg-secondary rounded-lg" />
          ))}
        </div>
        <div className="h-48 bg-secondary rounded-lg" />
      </div>
    )
  }

  if (listings.length === 0) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-bold text-foreground mb-1">Analytics</h1>
        <div className="text-center py-16 border border-dashed border-border rounded-lg mt-4">
          <p className="text-muted-foreground text-sm">Add a property to start seeing performance data here.</p>
        </div>
      </div>
    )
  }

  const maxDayCount = Math.max(...viewsByDay.map((d) => d.count), 1)
  const appTotal = applicationBreakdown.pending + applicationBreakdown.approved + applicationBreakdown.rejected

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold text-foreground mb-1">Analytics</h1>
      <p className="text-sm text-muted-foreground mb-6">How your properties are performing.</p>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2">
            <Eye size={14} /> Total Views
          </div>
          <p className="text-2xl font-bold text-foreground">{totalViews}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2">
            <Heart size={14} /> Saves
          </div>
          <p className="text-2xl font-bold text-foreground">{totalSaves}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2">
            <FileText size={14} /> Applications
          </div>
          <p className="text-2xl font-bold text-foreground">{totalApplications}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2">
            <MessageSquare size={14} /> Messages
          </div>
          <p className="text-2xl font-bold text-foreground">{totalMessages}</p>
        </div>
      </div>

      {/* Views over last 14 days - CSS bar chart */}
      <div className="bg-card border border-border rounded-lg p-4 mb-6">
        <h2 className="text-sm font-semibold text-foreground mb-4">Views — last 14 days</h2>
        <div className="flex items-end gap-1.5 h-32">
          {viewsByDay.map((d, i) => (
            <div key={i} className="flex-1 flex flex-col items-center justify-end h-full group relative">
              <div
                className="w-full bg-primary/70 hover:bg-primary rounded-t-sm transition-colors"
                style={{ height: `${(d.count / maxDayCount) * 100}%`, minHeight: d.count > 0 ? '4px' : '2px' }}
              />
              <span className="absolute -top-5 text-[10px] text-foreground opacity-0 group-hover:opacity-100">
                {d.count}
              </span>
            </div>
          ))}
        </div>
        <div className="flex justify-between mt-2 text-[10px] text-muted-foreground">
          <span>{viewsByDay[0]?.day}</span>
          <span>{viewsByDay[viewsByDay.length - 1]?.day}</span>
        </div>
      </div>

      {/* Applications breakdown */}
      {appTotal > 0 && (
        <div className="bg-card border border-border rounded-lg p-4 mb-6">
          <h2 className="text-sm font-semibold text-foreground mb-4">Applications breakdown</h2>
          <div className="flex h-3 rounded-full overflow-hidden mb-3">
            <div className="bg-muted-foreground/40" style={{ width: `${(applicationBreakdown.pending / appTotal) * 100}%` }} />
            <div className="bg-primary" style={{ width: `${(applicationBreakdown.approved / appTotal) * 100}%` }} />
            <div className="bg-destructive" style={{ width: `${(applicationBreakdown.rejected / appTotal) * 100}%` }} />
          </div>
          <div className="flex gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-muted-foreground/40" /> Pending ({applicationBreakdown.pending})
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-primary" /> Approved ({applicationBreakdown.approved})
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-destructive" /> Rejected ({applicationBreakdown.rejected})
            </span>
          </div>
        </div>
      )}

      {/* Per-listing performance table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <h2 className="text-sm font-semibold text-foreground p-4 pb-2">Performance by property</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground text-xs border-t border-border">
                <th className="px-4 py-2 font-medium">Property</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium text-right">Views</th>
                <th className="px-4 py-2 font-medium text-right">Saves</th>
                <th className="px-4 py-2 font-medium text-right">Applications</th>
              </tr>
            </thead>
            <tbody>
              {listings.map((l) => (
                <tr key={l.id} className="border-t border-border">
                  <td className="px-4 py-3 text-foreground font-medium flex items-center gap-1.5">
                    <Home size={14} className="text-muted-foreground shrink-0" />
                    {l.title}
                    {l.verified && <ShieldCheck size={12} className="text-primary shrink-0" />}
                  </td>
                  <td className="px-4 py-3 capitalize text-muted-foreground">{l.status}</td>
                  <td className="px-4 py-3 text-right text-foreground">{l.views}</td>
                  <td className="px-4 py-3 text-right text-foreground">{l.saves}</td>
                  <td className="px-4 py-3 text-right text-foreground">{l.applications}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-muted-foreground mt-4">
        Payment and booking analytics will appear here once those systems are built (Phase 8).
      </p>
    </div>
  )
}