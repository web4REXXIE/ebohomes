'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { fmtDateTime, label, toIso } from '@/lib/case-status'

type Props = { role: 'tenant' | 'landlord' }

const OPEN = ['requested', 'scheduled']

export function ViewingsManager({ role }: Props) {
  const [viewings, setViewings] = useState<any[]>([])
  const [apps, setApps] = useState<any[]>([])
  const [titles, setTitles] = useState<Record<string, string>>({})
  const [names, setNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [when, setWhen] = useState<Record<string, string>>({})
  const [note, setNote] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    const { data: v, error } = await supabase.from('viewings').select('*').order('created_at', { ascending: false }).limit(200)
    if (error) {
      setMsg({ text: 'Could not load viewings. Run the batch 5 SQL first, then refresh.', ok: false })
      setLoading(false)
      return
    }
    const list = v ?? []
    setViewings(list)

    let appList: any[] = []
    if (role === 'tenant') {
      const { data: a } = await supabase.from('applications').select('id, status, listing_id').in('status', ['pending', 'info_requested', 'approved'])
      appList = a ?? []
      setApps(appList)
    }
    const listingIds = Array.from(new Set([...list.map((x: any) => x.listing_id), ...appList.map((x: any) => x.listing_id)]))
    if (listingIds.length) {
      const { data: l } = await supabase.from('listings').select('id, title').in('id', listingIds)
      setTitles(Object.fromEntries((l ?? []).map((x: any) => [x.id, x.title || 'Property'])))
    }
    if (role === 'landlord' && list.length) {
      const ids = Array.from(new Set(list.map((x: any) => x.tenant_id)))
      const { data: p } = await supabase.from('profiles').select('id, full_name').in('id', ids)
      setNames(Object.fromEntries((p ?? []).map((x: any) => [x.id, x.full_name || 'Tenant'])))
    }
    setLoading(false)
  }, [role])

  useEffect(() => {
    load()
  }, [load])

  const call = async (fn: string, args: Record<string, any>, ok: string, confirmText?: string) => {
    if (busy) return
    if (confirmText && !window.confirm(confirmText)) return
    setBusy(true)
    setMsg(null)
    const { error } = await supabase.rpc(fn, args)
    setMsg(error ? { text: error.message, ok: false } : { text: ok, ok: true })
    setBusy(false)
    if (!error) await load()
  }

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="animate-spin text-primary" size={26} /></div>

  const openFor = (appId: string) => viewings.some((v) => v.application_id === appId && OPEN.includes(v.status))

  return (
    <div className="max-w-3xl mx-auto w-full px-4 py-8">
      <h1 className="text-xl font-bold text-foreground mb-1">Viewings</h1>
      <p className="text-sm text-muted-foreground mb-4">
        {role === 'tenant'
          ? 'See the property in person before you pay anything. EboHomes or the landlord confirms the time.'
          : 'Confirm a time for applicants who ask to view your property, and mark the viewing when it is done.'}
      </p>
      {msg && <p className={`text-sm rounded-md p-3 mb-4 ${msg.ok ? 'text-primary bg-primary/10' : 'text-destructive bg-destructive/10'}`}>{msg.text}</p>}

      {role === 'tenant' && apps.filter((a) => !openFor(a.id)).length > 0 && (
        <div className="space-y-3 mb-6">
          <p className="text-xs font-semibold text-muted-foreground">Request a viewing</p>
          {apps.filter((a) => !openFor(a.id)).map((a) => (
            <div key={a.id} className="bg-card border border-border rounded-lg p-4 text-sm space-y-2">
              <p className="font-medium text-foreground">{titles[a.listing_id] ?? 'Property'}</p>
              <input type="datetime-local" value={when[a.id] ?? ''} onChange={(e) => setWhen((p) => ({ ...p, [a.id]: e.target.value }))} className="w-full bg-input border border-border rounded-md px-3 py-2 text-xs" />
              <input value={note[a.id] ?? ''} onChange={(e) => setNote((p) => ({ ...p, [a.id]: e.target.value }))} maxLength={300} placeholder="Anything we should know? (optional)" className="w-full bg-input border border-border rounded-md px-3 py-2 text-xs" />
              <button
                disabled={busy}
                onClick={() => call('request_viewing', { p_application: a.id, p_preferred: toIso(when[a.id] ?? ''), p_note: (note[a.id] ?? '').trim() || null }, 'Viewing requested. You will be told when a time is set.')}
                className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs disabled:opacity-50"
              >
                Request viewing
              </button>
            </div>
          ))}
        </div>
      )}

      {viewings.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-10 border border-dashed border-border rounded-lg">No viewings yet.</p>
      ) : (
        <div className="space-y-3">
          {viewings.map((v) => (
            <div key={v.id} className="bg-card border border-border rounded-lg p-4 text-sm space-y-2">
              <div className="flex justify-between gap-2">
                <div>
                  <p className="font-semibold text-foreground">{titles[v.listing_id] ?? 'Property'}</p>
                  {role === 'landlord' && <p className="text-xs text-muted-foreground">Applicant: {names[v.tenant_id] ?? '—'}</p>}
                </div>
                <span className="text-xs border border-border rounded-full px-2 py-1 h-fit capitalize">{label(v.status)}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {v.scheduled_for ? `Set for ${fmtDateTime(v.scheduled_for)}` : v.preferred_at ? `Tenant prefers ${fmtDateTime(v.preferred_at)}` : 'No time chosen yet'}
              </p>
              {v.tenant_note && <p className="bg-secondary rounded-md p-2 text-xs">{v.tenant_note}</p>}
              {v.outcome_note && <p className="text-xs text-muted-foreground">Note: {v.outcome_note}</p>}

              {role === 'landlord' && OPEN.includes(v.status) && (
                <div className="space-y-2 pt-1">
                  <input type="datetime-local" value={when[v.id] ?? ''} onChange={(e) => setWhen((p) => ({ ...p, [v.id]: e.target.value }))} className="w-full bg-input border border-border rounded-md px-3 py-2 text-xs" />
                  <input value={note[v.id] ?? ''} onChange={(e) => setNote((p) => ({ ...p, [v.id]: e.target.value }))} maxLength={300} placeholder="Note (optional)" className="w-full bg-input border border-border rounded-md px-3 py-2 text-xs" />
                  <div className="flex flex-wrap gap-2">
                    <button disabled={busy || !toIso(when[v.id] ?? '')} onClick={() => call('schedule_viewing', { p_viewing: v.id, p_when: toIso(when[v.id] ?? ''), p_note: (note[v.id] ?? '').trim() || null }, v.status === 'scheduled' ? 'Viewing moved.' : 'Viewing scheduled.')} className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs disabled:opacity-50">
                      {v.status === 'scheduled' ? 'Move to this time' : 'Confirm this time'}
                    </button>
                    {v.status === 'scheduled' && (
                      <>
                        <button disabled={busy} onClick={() => call('complete_viewing', { p_viewing: v.id, p_outcome: 'completed', p_note: (note[v.id] ?? '').trim() || null }, 'Viewing marked as done.', 'Mark this viewing as done?')} className="px-3 py-1.5 rounded-md border border-border text-xs disabled:opacity-50">Mark done</button>
                        <button disabled={busy} onClick={() => call('complete_viewing', { p_viewing: v.id, p_outcome: 'no_show', p_note: (note[v.id] ?? '').trim() || null }, 'Marked as missed.', 'Mark this viewing as missed?')} className="px-3 py-1.5 rounded-md border border-border text-xs disabled:opacity-50">Tenant did not come</button>
                      </>
                    )}
                  </div>
                </div>
              )}
              {OPEN.includes(v.status) && (
                <button disabled={busy} onClick={() => call('cancel_viewing', { p_viewing: v.id, p_note: null }, 'Viewing cancelled.', 'Cancel this viewing?')} className="text-xs text-muted-foreground hover:text-destructive hover:underline">Cancel viewing</button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}