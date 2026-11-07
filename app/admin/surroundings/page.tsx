'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, MapPin } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { AdminLocationPanel } from '@/components/admin-location-panel'
import { categoryLabel } from '@/lib/surroundings'

type Tab = 'pending' | 'flagged' | 'old'
const field = 'w-full px-3 py-2 rounded-lg border border-border bg-background text-sm'
const day = (s?: string | null) => (s ? new Date(s).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' }) : '—')

type Group = { listingId: string; title: string; location: string; count: number; oldest: string; cats: string[] }

export default function AdminSurroundingsPage() {
  const [tab, setTab] = useState<Tab>('pending')
  const [groups, setGroups] = useState<Group[] | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const [months, setMonths] = useState<number | null>(null)
  const [monthsInput, setMonthsInput] = useState('')
  const [monthsReason, setMonthsReason] = useState('')

  const load = useCallback(async () => {
    setGroups(null); setErr('')
    let rows: { listing_id: string; category: string; observed_at: string; title?: string | null }[] = []
    if (tab === 'old') {
      const { data, error } = await supabase.rpc('admin_surroundings_stale')
      if (error) { setErr(error.message); setGroups([]); return }
      rows = ((data ?? []) as any[]).map((r) => ({ listing_id: r.listing_id, category: r.category, observed_at: r.observed_at, title: r.title }))
    } else {
      const { data, error } = await supabase.from('listing_surroundings').select('listing_id, category, observed_at').eq('review_status', tab).order('observed_at').limit(500)
      if (error) { setErr(error.message); setGroups([]); return }
      rows = (data ?? []) as any[]
    }
    const ids = Array.from(new Set(rows.map((r) => r.listing_id)))
    const info = new Map<string, { title: string; location: string }>()
    if (ids.length > 0) {
      const { data: ls } = await supabase.from('listings').select('id, title, location_text').in('id', ids)
      ;(ls ?? []).forEach((x: any) => info.set(x.id, { title: x.title ?? 'Untitled listing', location: x.location_text ?? '' }))
    }
    const byListing = new Map<string, Group>()
    rows.forEach((r) => {
      const g = byListing.get(r.listing_id) ?? {
        listingId: r.listing_id, title: info.get(r.listing_id)?.title ?? r.title ?? 'Listing', location: info.get(r.listing_id)?.location ?? '',
        count: 0, oldest: r.observed_at, cats: [],
      }
      g.count += 1
      if (r.observed_at < g.oldest) g.oldest = r.observed_at
      const label = categoryLabel(r.category)
      if (!g.cats.includes(label)) g.cats.push(label)
      byListing.set(r.listing_id, g)
    })
    setGroups(Array.from(byListing.values()).sort((a, b) => (a.oldest < b.oldest ? -1 : 1)))
  }, [tab])

  useEffect(() => { setOpenId(null); void load() }, [load])
  useEffect(() => {
    supabase.from('surroundings_settings').select('stale_months').maybeSingle().then(({ data }) => setMonths(data?.stale_months ?? null))
  }, [])

  async function saveMonths() {
    setErr(''); setMsg('')
    const n = Number(monthsInput)
    if (!Number.isInteger(n)) { setErr('Enter a whole number of months.'); return }
    const { error } = await supabase.rpc('admin_set_surroundings_stale_months', { p_months: n, p_reason: monthsReason })
    if (error) { setErr(error.message); return }
    setMsg('Updated.'); setMonths(n); setMonthsInput(''); setMonthsReason('')
    if (tab === 'old') void load()
  }

  const TABS: { key: Tab; label: string }[] = [
    { key: 'pending', label: 'Waiting for review' }, { key: 'flagged', label: 'Flagged' }, { key: 'old', label: 'Old information' },
  ]

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><MapPin size={22} /> Surroundings</h1>
        <p className="text-sm text-muted-foreground">
          Review what inspectors recorded about roads, drainage, utilities and nearby facilities. Nothing reaches tenants until an administrator publishes it. Facts are observations, not proof. Distances are straight-line only.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 min-h-11 rounded-lg text-sm font-semibold ${tab === t.key ? 'bg-primary text-primary-foreground' : 'bg-card border border-border text-muted-foreground'}`}>{t.label}</button>
        ))}
      </div>

      {tab === 'old' && (
        <div className="bg-card border border-border rounded-lg p-4 space-y-2 text-sm">
          <p className="font-semibold">When information counts as old</p>
          <p className="text-xs text-muted-foreground">Published facts observed more than {months ?? '—'} months ago show an &quot;old information&quot; warning to tenants and appear here. Allowed: 1 to 60 months. Changes are recorded with your reason.</p>
          <input className={field} value={monthsInput} inputMode="numeric" onChange={(e) => setMonthsInput(e.target.value)} placeholder="New number of months" />
          <input className={field} value={monthsReason} onChange={(e) => setMonthsReason(e.target.value)} placeholder="Reason (required)" />
          <Button variant="outline" onClick={saveMonths} disabled={!monthsInput || !monthsReason.trim()}>Update</Button>
        </div>
      )}

      {err && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">{err}</p>}
      {msg && <p role="status" className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">{msg}</p>}

      {groups === null ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={16} className="animate-spin" /> Loading…</p>
      ) : groups.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">Nothing here.</p>
      ) : (
        <ul className="space-y-3">
          {groups.map((g) => (
            <li key={g.listingId} className="rounded-xl border border-border bg-card">
              <button className="flex w-full min-h-14 flex-col items-start gap-0.5 p-3 text-left text-sm" aria-expanded={openId === g.listingId}
                onClick={() => setOpenId(openId === g.listingId ? null : g.listingId)}>
                <span className="font-semibold">{g.title}</span>
                <span className="text-xs text-muted-foreground">{g.location}</span>
                <span className="text-xs">{g.count} fact(s): {g.cats.join(', ')} · oldest observed {day(g.oldest)}</span>
              </button>
              {openId === g.listingId && <div className="border-t border-border p-3"><AdminLocationPanel listingId={g.listingId} /></div>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
