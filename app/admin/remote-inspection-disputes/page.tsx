'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Loader2, Scale } from 'lucide-react'
import { friendlyError } from '@/lib/remote-inspection'

const field = 'w-full px-3 py-2 rounded-lg border border-border bg-background text-sm'
const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' }) : '—')

type Row = {
  id: string; request_id: string; ref: string; title?: string | null; location_text?: string | null; raised_by_role: 'tenant' | 'admin'; reason: string
  created_at: string; inspector_name?: string | null; verdict?: string | null; released_at?: string | null; payout_status?: string | null; involved: boolean
}

// Disputes about a released remote report. The tenant's words are shown here; the internal note below is never shown to the tenant.
export default function RemoteInspectionDisputesPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [note, setNote] = useState<Record<string, string>>({})
  const [tell, setTell] = useState<Record<string, string>>({})
  const [raiseRef, setRaiseRef] = useState('')
  const [raiseReason, setRaiseReason] = useState('')

  const flash = (text: string, ok = true) => { setMsg({ text, ok }); setTimeout(() => setMsg(null), 6000) }
  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('admin_remote_dispute_queue')
    if (error) flash(friendlyError(error.message), false)
    setRows((data ?? []) as Row[])
    setLoading(false)
  }, [])
  useEffect(() => { void load() }, [load])

  async function resolve(r: Row, resolution: 'report_stands' | 'another_visit' | 'report_withdrawn') {
    if ((note[r.id] ?? '').trim().length < 5) { flash('Write the internal reason, at least 5 characters.', false); return }
    setBusy(true)
    const { error } = await supabase.rpc('admin_remote_dispute_resolve', {
      p_dispute: r.id, p_resolution: resolution, p_note: note[r.id].trim(), p_tenant_message: (tell[r.id] ?? '').trim() || null,
    })
    setBusy(false)
    if (error) { flash(friendlyError(error.message), false); return }
    flash('Decision saved.'); await load()
  }

  async function raise() {
    setBusy(true)
    const { error } = await supabase.rpc('admin_remote_raise_dispute', { p_ref: raiseRef.trim(), p_reason: raiseReason.trim() })
    setBusy(false)
    if (error) { flash(friendlyError(error.message), false); return }
    setRaiseRef(''); setRaiseReason(''); flash('Dispute opened.'); await load()
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2"><Scale size={20} /> Remote report disputes</h1>
        <p className="text-sm text-muted-foreground">Decide whether a released report stands, needs another visit, or is withdrawn. Nothing is charged to a tenant. A payout still waiting is cancelled if the report does not stand.</p>
      </div>
      {msg && <div role={msg.ok ? 'status' : 'alert'} className={`text-sm rounded-lg border px-3 py-2 ${msg.ok ? 'border-border bg-secondary' : 'border-destructive/40 text-destructive'}`}>{msg.text}</div>}
      {loading && <Loader2 className="animate-spin text-muted-foreground" aria-label="Loading" />}
      {!loading && rows.length === 0 && <p className="text-sm text-muted-foreground">No open disputes.</p>}

      {rows.map((r) => (
        <div key={r.id} className="bg-card border border-border rounded-lg p-3 text-sm space-y-2">
          <p className="font-semibold">{r.title ?? 'Property'} <span className="text-xs font-normal text-muted-foreground">{r.ref}</span></p>
          <p className="text-xs text-muted-foreground">
            Raised by the {r.raised_by_role} {fmt(r.created_at)} · inspector {r.inspector_name ?? '—'} · verdict {(r.verdict ?? '').toUpperCase()}
            {r.payout_status ? ` · payout ${r.payout_status}` : ''}
          </p>
          <p>{r.reason}</p>
          {r.involved ? <p className="text-xs text-amber-800">You are part of this request, so another administrator must decide.</p> : (
            <div className="space-y-2 border-t border-border pt-2">
              <input className={field} maxLength={500} placeholder="Internal reason (required). The tenant never sees it." value={note[r.id] ?? ''} onChange={(e) => setNote({ ...note, [r.id]: e.target.value })} />
              <input className={field} maxLength={500} placeholder="Message to the tenant (optional)" value={tell[r.id] ?? ''} onChange={(e) => setTell({ ...tell, [r.id]: e.target.value })} />
              <div className="flex flex-wrap gap-2">
                <Button size="sm" disabled={busy} onClick={() => resolve(r, 'report_stands')}>Report stands</Button>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => resolve(r, 'another_visit')}>Another visit</Button>
                <Button size="sm" variant="outline" className="text-destructive border-destructive" disabled={busy} onClick={() => resolve(r, 'report_withdrawn')}>Withdraw report</Button>
              </div>
            </div>
          )}
        </div>
      ))}

      <div className="bg-card border border-border rounded-lg p-3 text-sm space-y-2">
        <p className="font-semibold">Open a dispute yourself</p>
        <p className="text-xs text-muted-foreground">For example, suspected fake evidence or a complaint received elsewhere. The tenant is not told that you opened it.</p>
        <input className={field} placeholder="Request reference, for example EBO-RI-000123" value={raiseRef} onChange={(e) => setRaiseRef(e.target.value)} />
        <input className={field} maxLength={1000} placeholder="Reason (10+ characters)" value={raiseReason} onChange={(e) => setRaiseReason(e.target.value)} />
        <Button size="sm" variant="outline" disabled={busy || raiseReason.trim().length < 10} onClick={raise}>Open dispute</Button>
      </div>
    </div>
  )
}
