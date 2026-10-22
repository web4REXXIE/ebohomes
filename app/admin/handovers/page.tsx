'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, AlertTriangle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { adminState, validateResolve } from '@/lib/handover'

const when = (s?: string | null) => (s ? new Date(s).toLocaleString('en-NG') : 'n/a')
const field = 'w-full min-h-11 rounded-lg border border-border bg-input px-3 py-2 text-base'
const FILTERS = [{ key: 'attention', label: 'Disputed' }, { key: 'waiting', label: 'Waiting' }, { key: 'completed', label: 'Completed' }, { key: 'all', label: 'All' }]
const tone: Record<string, string> = {
  disputed: 'border-red-300 bg-red-50 text-red-900', waiting: 'border-amber-300 bg-amber-50 text-amber-900', completed: 'border-emerald-300 bg-emerald-50 text-emerald-900',
}

async function api(path: string, init?: RequestInit) {
  const t = (await supabase.auth.getSession()).data.session?.access_token ?? ''
  const res = await fetch(path, { ...init, headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' } })
  const j = await res.json().catch(() => null)
  return { ok: res.ok, j }
}

export default function AdminHandovers() {
  const [filter, setFilter] = useState('attention')
  const [items, setItems] = useState<any[] | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    setItems(null); setErr(null)
    const r = await api(`/api/admin/handovers?filter=${filter}`)
    if (!r.ok) { setErr(r.j?.error ?? 'Could not load the list.'); setItems([]); return }
    setItems(r.j.items)
  }, [filter])
  useEffect(() => { load() }, [load])

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <h1 className="text-xl font-bold text-foreground">Key handovers</h1>
      <p className="rounded-lg bg-secondary p-3 text-xs text-muted-foreground">A landlord payout stays on hold until the tenant and the landlord have both confirmed the handover, or you resolve a dispute. Payment confirmation is not proof of handover.</p>
      <div className="flex gap-2 overflow-x-auto pb-1" role="tablist">
        {FILTERS.map((f) => (
          <button key={f.key} role="tab" aria-selected={filter === f.key} onClick={() => { setFilter(f.key); setOpenId(null) }}
            className={`min-h-11 shrink-0 rounded-full border px-4 text-sm font-semibold ${filter === f.key ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card'}`}>{f.label}</button>))}
      </div>
      {err && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">{err}</p>}
      {items === null ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={16} className="animate-spin" aria-hidden /> Loading...</p>
        : items.length === 0 ? <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">Nothing here.</p>
        : <ul className="space-y-2">{items.map((s) => (
          <li key={s.tenancy_id} className="rounded-xl border border-border bg-card">
            <button className="flex w-full min-h-14 flex-wrap items-center justify-between gap-2 p-3 text-left text-sm" onClick={() => setOpenId(openId === s.tenancy_id ? null : s.tenancy_id)} aria-expanded={openId === s.tenancy_id}>
              <span><b>{s.tenancy_code}</b> · {s.landlord_name} / {s.tenant_name}
                {s.open_payouts > 0 && <AlertTriangle size={14} className="ml-1 inline text-amber-700" aria-label="A payout is waiting on this handover" />}</span>
              <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${tone[s.state]}`}>{adminState(s.state, s.tenant_confirmed_at, s.landlord_confirmed_at)}</span>
            </button>
            {openId === s.tenancy_id && <Detail s={s} onChanged={() => { setOpenId(null); load() }} />}
          </li>))}</ul>}
    </div>
  )
}

function Detail({ s, onChanged }: { s: any; onChanged: () => void }) {
  const [outcome, setOutcome] = useState<'reset' | 'admin_completed' | ''>('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const resolve = async () => {
    if (busy) return
    const v = validateResolve(outcome, note)
    if (!v.ok) { setMsg(v.error); return }
    setBusy(true); setMsg(null)
    const r = await api('/api/admin/handovers', { method: 'POST', body: JSON.stringify({ tenancy_id: s.tenancy_id, outcome, note }) })
    setBusy(false)
    if (!r.ok) { setMsg(r.j?.error ?? 'Failed. Nothing was changed.'); return }
    onChanged()
  }

  return (
    <div className="space-y-3 border-t border-border p-3 text-sm">
      <dl className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
        <div><dt className="text-xs text-muted-foreground">Property</dt><dd>{s.listing_title ?? 'n/a'} · {s.tenancy_code}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Payout status</dt><dd>{s.hold_reason ? `On hold: ${s.hold_reason}` : 'Not held by the handover'}{s.open_payouts > 0 ? ` · ${s.open_payouts} payout(s) waiting` : ''}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Tenant ({s.tenant_name})</dt><dd>{s.tenant_confirmed_at ? `Confirmed ${when(s.tenant_confirmed_at)}` : 'Not confirmed'}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Landlord ({s.landlord_name})</dt><dd>{s.landlord_confirmed_at ? `Confirmed ${when(s.landlord_confirmed_at)}` : 'Not confirmed'}</dd></div>
      </dl>
      {s.state === 'disputed' && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-red-900">Disputed by the {s.disputed_role} on {when(s.disputed_at)}: "{s.dispute_note}"</p>}
      {s.state === 'completed' && <p className="rounded-lg bg-emerald-50 p-3 text-emerald-900">Completed {when(s.completed_at)} ({s.completed_via === 'admin_review' ? 'after EboHomes review' : 'both parties confirmed'}).{s.resolution_note ? ` Note: ${s.resolution_note}` : ''}</p>}
      <ul className="space-y-1 text-xs">{s.events.map((e: any, i: number) => <li key={i} className="rounded-md border border-border p-2"><b>{String(e.event).replace(/_/g, ' ')}</b> · {e.by ?? 'n/a'} ({e.role}) · {when(e.at)}{e.note ? ` · "${e.note}"` : ''}</li>)}</ul>

      {s.state === 'disputed' && (
        <div className="space-y-3 rounded-xl border border-border p-3">
          <p className="font-bold">Resolve the dispute</p>
          <label className="flex items-start gap-2"><input type="radio" name={`o-${s.tenancy_id}`} className="mt-1 size-5" checked={outcome === 'reset'} onChange={() => setOutcome('reset')} /> <span><b>Reset.</b> Clear both confirmations. The tenant and the landlord must confirm again.</span></label>
          <label className="flex items-start gap-2"><input type="radio" name={`o-${s.tenancy_id}`} className="mt-1 size-5" checked={outcome === 'admin_completed'} onChange={() => setOutcome('admin_completed')} /> <span><b>Complete after review.</b> You checked and the handover did happen. This releases the payout hold. The recorded confirmations are not changed.</span></label>
          <div><label className="text-xs font-semibold" htmlFor="rn">Explanation for the record (required)</label>
            <textarea id="rn" rows={3} maxLength={1000} className={field} value={note} onChange={(e) => setNote(e.target.value)} /></div>
          <button disabled={busy} onClick={resolve} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary font-bold text-primary-foreground disabled:opacity-50">{busy && <Loader2 size={16} className="animate-spin" aria-hidden />}Record the decision</button>
        </div>)}
      {msg && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-red-900">{msg}</p>}
    </div>
  )
}