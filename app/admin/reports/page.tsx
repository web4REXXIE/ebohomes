'use client'

import { useEffect, useState } from 'react'
import { Flag, Clock, CheckCircle2, XCircle, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'

type ReportRow = {
  id: string
  reason: string
  details: string | null
  status: string
  resolution_notes: string | null
  created_at: string
  listing_id: string | null
  reporter_id: string
  listing?: { title: string; location_text: string; landlord_id: string }
  reporter?: { full_name: string; email: string }
}

const TABS = ['open', 'resolved', 'dismissed', 'all'] as const

export default function AdminReportsPage() {
  const [reports, setReports] = useState<ReportRow[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<(typeof TABS)[number]>('open')
  const [actingOn, setActingOn] = useState<string | null>(null)
  const [notesDraft, setNotesDraft] = useState<Record<string, string>>({})

  const loadReports = async () => {
    setLoading(true)

    const { data: reps } = await supabase
      .from('reports')
      .select('id, reason, details, status, resolution_notes, created_at, listing_id, reporter_id')
      .order('created_at', { ascending: false })

    if (!reps || reps.length === 0) {
      setReports([])
      setLoading(false)
      return
    }

    const listingIds = [...new Set(reps.map((r) => r.listing_id).filter(Boolean))] as string[]
    const reporterIds = [...new Set(reps.map((r) => r.reporter_id))]

    const [{ data: listings }, { data: reporters }] = await Promise.all([
      listingIds.length
        ? supabase.from('listings').select('id, title, location_text, landlord_id').in('id', listingIds)
        : Promise.resolve({ data: [] }),
      supabase.from('profiles').select('id, full_name, email').in('id', reporterIds),
    ])

    const merged = reps.map((r) => ({
      ...r,
      listing: listings?.find((l) => l.id === r.listing_id),
      reporter: reporters?.find((p) => p.id === r.reporter_id),
    }))

    setReports(merged)
    setLoading(false)
  }

  useEffect(() => {
    loadReports()
  }, [])

  const handleResolve = async (reportId: string, status: 'resolved' | 'dismissed') => {
    setActingOn(reportId)

    const {
      data: { user },
    } = await supabase.auth.getUser()

    const { error } = await supabase
      .from('reports')
      .update({
        status,
        reviewed_by: user?.id,
        reviewed_at: new Date().toISOString(),
        resolution_notes: notesDraft[reportId] || null,
      })
      .eq('id', reportId)

    if (!error) {
      setReports((prev) =>
        prev.map((r) => (r.id === reportId ? { ...r, status, resolution_notes: notesDraft[reportId] || null } : r))
      )
    }

    setActingOn(null)
  }

  const filtered = tab === 'all' ? reports : reports.filter((r) => r.status === tab)

  const statusBadge = (status: string) => {
    if (status === 'resolved')
      return (
        <span className="flex items-center gap-1 text-xs font-medium text-primary bg-primary/10 px-2 py-1 rounded-full">
          <CheckCircle2 size={12} /> Resolved
        </span>
      )
    if (status === 'dismissed')
      return (
        <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground bg-secondary px-2 py-1 rounded-full">
          <XCircle size={12} /> Dismissed
        </span>
      )
    return (
      <span className="flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-100 px-2 py-1 rounded-full">
        <Clock size={12} /> Open
      </span>
    )
  }

  const openCount = reports.filter((r) => r.status === 'open').length

  return (
    <div className="p-6">
      <div className="flex items-center gap-2 mb-1">
        <h1 className="text-xl font-bold text-foreground">Reports</h1>
        {openCount > 0 && (
          <span className="text-xs font-semibold bg-destructive text-white px-2 py-0.5 rounded-full">{openCount} open</span>
        )}
      </div>
      <p className="text-sm text-muted-foreground mb-6">User-submitted reports on listings.</p>

      <div className="flex gap-2 mb-6 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-2 text-sm font-medium capitalize border-b-2 -mb-px transition-colors ${
              tab === t ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3 animate-pulse">
          <div className="h-28 bg-secondary rounded-lg" />
          <div className="h-28 bg-secondary rounded-lg" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-border rounded-lg">
          <Flag size={28} className="text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">No {tab === 'all' ? '' : tab} reports.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((r) => (
            <div key={r.id} className="bg-card border border-border rounded-lg p-4">
              <div className="flex items-start justify-between gap-4 mb-2">
                <div>
                  <p className="font-semibold text-foreground">{r.reason}</p>
                  {r.listing ? (
                    <a
                      href={`/listing/${r.listing_id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-primary hover:underline flex items-center gap-1"
                    >
                      {r.listing.title} · {r.listing.location_text} <ExternalLink size={10} />
                    </a>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">Listing no longer exists</p>
                  )}
                </div>
                {statusBadge(r.status)}
              </div>

              <p className="text-sm text-foreground mb-1">
                Reported by <span className="font-medium">{r.reporter?.full_name ?? 'Unknown user'}</span>
              </p>

              {r.details && <p className="text-sm text-muted-foreground italic mb-2">"{r.details}"</p>}

              <p className="text-xs text-muted-foreground mb-3">{new Date(r.created_at).toLocaleString()}</p>

              {r.status === 'open' ? (
                <div className="space-y-2">
                  <textarea
                    placeholder="Resolution notes (optional)"
                    value={notesDraft[r.id] ?? ''}
                    onChange={(e) => setNotesDraft((p) => ({ ...p, [r.id]: e.target.value }))}
                    rows={2}
                    className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background resize-none"
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleResolve(r.id, 'resolved')}
                      disabled={actingOn === r.id}
                      className="font-semibold"
                    >
                      Mark Resolved
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleResolve(r.id, 'dismissed')}
                      disabled={actingOn === r.id}
                      className="font-semibold"
                    >
                      Dismiss
                    </Button>
                  </div>
                </div>
              ) : (
                r.resolution_notes && (
                  <p className="text-xs text-muted-foreground border-t border-border pt-2 mt-2">
                    <span className="font-medium">Note:</span> {r.resolution_notes}
                  </p>
                )
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}