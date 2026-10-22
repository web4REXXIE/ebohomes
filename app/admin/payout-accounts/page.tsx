'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, AlertTriangle, ShieldCheck } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { validatePayoutReview } from '@/lib/payout-account'

const when = (s?: string | null) => (s ? new Date(s).toLocaleString('en-NG') : 'n/a')
const field = 'w-full min-h-11 rounded-lg border border-border bg-input px-3 py-2 text-base'
const FILTERS = [{ key: 'pending', label: 'Awaiting review' }, { key: 'scheduled', label: 'Approved, waiting' }, { key: 'all', label: 'All' }]
const tone: Record<string, string> = {
  pending_review: 'border-amber-300 bg-amber-50 text-amber-900', approved: 'border-emerald-300 bg-emerald-50 text-emerald-900',
  rejected: 'border-red-300 bg-red-50 text-red-900', cancelled: 'border-slate-300 bg-slate-100 text-slate-700',
}
const label: Record<string, string> = { pending_review: 'Awaiting review', approved: 'Approved', rejected: 'Rejected', cancelled: 'Cancelled' }

async function api(path: string, init?: RequestInit) {
  const t = (await supabase.auth.getSession()).data.session?.access_token ?? ''
  const res = await fetch(path, { ...init, headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' } })
  const j = await res.json().catch(() => null)
  return { ok: res.ok, j }
}

export default function AdminPayoutAccounts() {
  const [filter, setFilter] = useState('pending')
  const [items, setItems] = useState<any[] | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    setItems(null); setErr(null)
    const r = await api(`/api/admin/payout-accounts?filter=${filter}`)
    if (!r.ok) { setErr(r.j?.error ?? 'Could not load the queue.'); setItems([]); return }
    setItems(r.j.items)
  }, [filter])
  useEffect(() => { load() }, [load])

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <h1 className="text-xl font-bold text-foreground">Landlord payout accounts</h1>
      <p className="rounded-lg bg-secondary p-3 text-xs text-muted-foreground">Fraud control: approve only after confirming the account name matches the landlord's verified identity. For a change to an existing account, also confirm it with the landlord by phone or another trusted channel.</p>
      <div className="flex gap-2 overflow-x-auto pb-1" role="tablist">
        {FILTERS.map((f) => (
          <button key={f.key} role="tab" aria-selected={filter === f.key} onClick={() => { setFilter(f.key); setOpenId(null) }}
            className={`min-h-11 shrink-0 rounded-full border px-4 text-sm font-semibold ${filter === f.key ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card'}`}>{f.label}</button>))}
      </div>
      {err && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">{err}</p>}
      {items === null ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={16} className="animate-spin" aria-hidden /> Loading...</p>
        : items.length === 0 ? <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">Nothing here.</p>
        : <ul className="space-y-2">{items.map((s) => (
          <li key={s.id} className="rounded-xl border border-border bg-card">
            <button className="flex w-full min-h-14 flex-wrap items-center justify-between gap-2 p-3 text-left text-sm" onClick={() => setOpenId(openId === s.id ? null : s.id)} aria-expanded={openId === s.id}>
              <span><b>{s.landlord_name}</b> · {s.bank_name}
                {!s.name_match && <AlertTriangle size={14} className="ml-1 inline text-amber-700" aria-label="Name does not match profile" />}
                {s.has_current && <span className="ml-2 rounded bg-sky-100 px-1.5 py-0.5 text-xs text-sky-900">Change</span>}</span>
              <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${tone[s.status]}`}>{label[s.status]}</span>
            </button>
            {openId === s.id && <Row s={s} onChanged={() => { setOpenId(null); load() }} />}
          </li>))}</ul>}
    </div>
  )
}

function Row({ s, onChanged }: { s: any; onChanged: () => void }) {
  const [mode, setMode] = useState<null | 'approve' | 'reject'>(null)
  const [note, setNote] = useState('')
  const [a, setA] = useState({ identity_matches: false, confirmed_with_landlord: false })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const pending = s.status === 'pending_review'

  const act = async (action: 'approve' | 'reject') => {
    if (busy) return
    const v = validatePayoutReview(action, note, action === 'approve' ? a : null, { has_current: s.has_current, name_match: s.name_match })
    if (!v.ok) { setMsg(v.error); return }
    setBusy(true); setMsg(null)
    const r = await api('/api/admin/payout-accounts', { method: 'POST', body: JSON.stringify({ id: s.id, action, note, attest: action === 'approve' ? a : undefined }) })
    setBusy(false)
    if (!r.ok) { setMsg(r.j?.error ?? 'Failed. Nothing was changed.'); return }
    onChanged()
  }

  return (
    <div className="space-y-3 border-t border-border p-3 text-sm">
      <dl className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
        <div><dt className="text-xs text-muted-foreground">Landlord (profile)</dt><dd>{s.landlord_name} · {s.landlord_phone ?? 'no phone'} · {s.landlord_email ?? 'no email'}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Requested</dt><dd>{when(s.requested_at)}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Bank</dt><dd>{s.bank_name}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Account number</dt><dd className="font-mono font-bold">{s.account_number}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Account name</dt><dd><b>{s.account_name}</b></dd></div>
        <div><dt className="text-xs text-muted-foreground">Current account in use</dt><dd>{s.current_masked ?? 'None (first account)'}</dd></div>
        {s.effective_at && <div><dt className="text-xs text-muted-foreground">Takes effect</dt><dd>{when(s.effective_at)}</dd></div>}
      </dl>
      {!s.name_match && <p role="alert" className="flex items-start gap-2 rounded-lg border border-amber-400 bg-amber-50 p-3 text-amber-900"><AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden /> The account name does not contain the words in the landlord's profile name. Approving needs a written explanation.</p>}
      {s.review_note && <p className="rounded-md bg-secondary p-2 text-xs">Review note: {s.review_note}</p>}
      <ul className="space-y-1 text-xs">{s.events.map((e: any, i: number) => <li key={i} className="rounded-md border border-border p-2"><b>{String(e.event).replace(/_/g, ' ')}</b> · {e.by ?? 'n/a'} · {when(e.at)}{e.note ? ` · "${e.note}"` : ''}</li>)}</ul>
      {s.status === 'approved' && <p className="flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-emerald-900"><ShieldCheck size={16} aria-hidden /> Approved. {new Date(s.effective_at) > new Date() ? 'Waiting period still running.' : 'In effect.'}</p>}

      {pending && !mode && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <button onClick={() => setMode('reject')} className="min-h-12 flex-1 rounded-lg border border-red-300 font-semibold text-red-800">Reject</button>
          <button onClick={() => setMode('approve')} className="min-h-12 flex-1 rounded-lg bg-primary font-bold text-primary-foreground">Approve</button>
        </div>)}

      {pending && mode && (
        <div className="space-y-3 rounded-xl border border-border p-3">
          {mode === 'approve' && (<>
            <label className="flex items-start gap-2"><input type="checkbox" className="mt-1 size-5" checked={a.identity_matches} onChange={(e) => setA({ ...a, identity_matches: e.target.checked })} /> The account name matches this landlord's verified identity.</label>
            {s.has_current && <label className="flex items-start gap-2"><input type="checkbox" className="mt-1 size-5" checked={a.confirmed_with_landlord} onChange={(e) => setA({ ...a, confirmed_with_landlord: e.target.checked })} /> I confirmed this change with the landlord through a separate trusted channel (phone call or in person).</label>}
          </>)}
          <div><label className="text-xs font-semibold" htmlFor="pn">{mode === 'reject' ? 'Reason for the landlord (required)' : s.name_match ? 'Internal note (optional)' : 'Note (required, explain the name difference)'}</label>
            <textarea id="pn" rows={3} maxLength={1000} className={field} value={note} onChange={(e) => setNote(e.target.value)} /></div>
          <div className="flex gap-2">
            <button disabled={busy} onClick={() => act(mode)} className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-lg bg-primary font-bold text-primary-foreground disabled:opacity-50">{busy && <Loader2 size={16} className="animate-spin" aria-hidden />}Confirm</button>
            <button disabled={busy} onClick={() => { setMode(null); setMsg(null) }} className="min-h-12 rounded-lg border border-border px-4 font-semibold">Cancel</button>
          </div>
        </div>)}
      {msg && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-red-900">{msg}</p>}
    </div>
  )
}