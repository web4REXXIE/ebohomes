'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, AlertTriangle, ShieldCheck, FileText } from 'lucide-react'
import { supabase } from '@/lib/supabase'

const when = (s?: string | null) => (s ? new Date(s).toLocaleString('en-NG') : 'n/a')
const field = 'w-full min-h-11 rounded-lg border border-border bg-input px-3 py-2 text-base'
const FILTERS = [{ key: 'pending', label: 'Awaiting review' }, { key: 'scheduled', label: 'Approved, waiting' }, { key: 'all', label: 'All' }]
const tone: Record<string, string> = {
  pending_review: 'border-amber-300 bg-amber-50 text-amber-900', approved: 'border-emerald-300 bg-emerald-50 text-emerald-900',
  rejected: 'border-red-300 bg-red-50 text-red-900', cancelled: 'border-slate-300 bg-slate-100 text-slate-700',
  revoked: 'border-red-300 bg-red-50 text-red-900',
}
const label: Record<string, string> = { pending_review: 'Awaiting review', approved: 'Approved', rejected: 'Rejected', cancelled: 'Cancelled', revoked: 'Revoked' }

async function api(path: string, init?: RequestInit) {
  const t = (await supabase.auth.getSession()).data.session?.access_token ?? ''
  const res = await fetch(path, { ...init, headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' } })
  const j = await res.json().catch(() => null)
  return { ok: res.ok, j }
}

export default function AdminPayeeRequests() {
  const [filter, setFilter] = useState('pending')
  const [items, setItems] = useState<any[] | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    setItems(null); setErr(null)
    const r = await api(`/api/admin/payee-requests?filter=${filter}`)
    if (!r.ok) { setErr(r.j?.error ?? 'Could not load the queue.'); setItems([]); return }
    setItems(r.j.items)
  }, [filter])
  useEffect(() => { load() }, [load])

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <h1 className="text-xl font-bold text-foreground">Rent payee requests</h1>
      <p className="rounded-lg bg-secondary p-3 text-xs text-muted-foreground">
        The property owner is the default rent payee. Approve a representative only after reading the owner's signed rent-collection
        authorization AND confirming it with the owner yourself, using the owner contact below (not a number from the request).
        Nothing is paid from this page: payouts do not use these approvals yet.
      </p>
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
              <span><b>{s.requester_name ?? 'Unknown'}</b> · {s.listing_title ?? 'Listing'}
                {(!s.name_match || s.account_used_elsewhere) && <AlertTriangle size={14} className="ml-1 inline text-amber-700" aria-label="Needs attention" />}
                {s.has_current && <span className="ml-2 rounded bg-sky-100 px-1.5 py-0.5 text-xs text-sky-900">Change</span>}</span>
              <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${tone[s.status] ?? ''}`}>{label[s.status] ?? s.status}</span>
            </button>
            {openId === s.id && <Row s={s} onChanged={() => { setOpenId(null); load() }} />}
          </li>))}</ul>}
    </div>
  )
}

function Row({ s, onChanged }: { s: any; onChanged: () => void }) {
  const [mode, setMode] = useState<null | 'approve' | 'reject' | 'revoke'>(null)
  const [note, setNote] = useState('')
  const [a, setA] = useState({ identity_matches: false, owner_confirmed: false })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const pending = s.status === 'pending_review'
  const approved = s.status === 'approved'
  const inEffect = approved && s.effective_at && new Date(s.effective_at) <= new Date()

  const openDoc = async () => {
    setMsg(null)
    const w = window.open('', '_blank')
    const r = await api(`/api/admin/payee-requests/document?id=${s.id}`)
    if (!r.ok || !r.j?.url) { w?.close(); setMsg(r.j?.error ?? 'Could not open the file.'); return }
    if (w) w.location.href = r.j.url; else window.location.href = r.j.url
  }

  const act = async (action: 'approve' | 'reject' | 'revoke') => {
    if (busy) return
    const n = note.trim()
    if (action === 'approve') {
      if (!a.identity_matches) { setMsg('Confirm that the account name matches the payee.'); return }
      if (!a.owner_confirmed) { setMsg('Confirm that you checked the signed authorization and the owner approved it through a separate channel.'); return }
      if (n.length < 10) { setMsg('Write a note of at least 10 characters about how the owner was confirmed.'); return }
    } else if (n.length < 5) {
      setMsg(action === 'reject' ? 'Write a clear reason for the requester.' : 'Write a reason of at least 5 characters.'); return
    }
    setBusy(true); setMsg(null)
    const r = await api('/api/admin/payee-requests', { method: 'POST', body: JSON.stringify({ id: s.id, action, note: n, attest: action === 'approve' ? a : undefined }) })
    setBusy(false)
    if (!r.ok) { setMsg(r.j?.error ?? 'Failed. Nothing was changed.'); return }
    onChanged()
  }

  return (
    <div className="space-y-3 border-t border-border p-3 text-sm">
      <dl className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
        <div><dt className="text-xs text-muted-foreground">Requester (profile)</dt><dd>{s.requester_name} · {s.requester_phone ?? 'no phone'} · {s.requester_email ?? 'no email'}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Professional profile</dt><dd>{s.professional_status ?? 'none'}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Relationship declared</dt><dd>{String(s.claimed_role ?? 'n/a').replace(/_/g, ' ')} · authority {s.authority_status}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Owner contact (call this)</dt><dd><b>{s.owner_name ?? 'not recorded'}</b> · {s.owner_phone ?? 'no phone'}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Payee</dt><dd>{s.payee_name} ({s.payee_kind})</dd></div>
        <div><dt className="text-xs text-muted-foreground">Requested</dt><dd>{when(s.requested_at)}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Bank</dt><dd>{s.bank_name}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Account number</dt><dd className="font-mono font-bold">{s.account_number}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Account name</dt><dd><b>{s.account_name}</b></dd></div>
        <div><dt className="text-xs text-muted-foreground">Current approved payee</dt><dd>{s.current_masked ?? 'None (rent goes to the owner)'}</dd></div>
        {s.effective_at && <div><dt className="text-xs text-muted-foreground">Takes effect</dt><dd>{when(s.effective_at)}</dd></div>}
      </dl>

      {!s.name_match && <p role="alert" className="flex items-start gap-2 rounded-lg border border-amber-400 bg-amber-50 p-3 text-amber-900"><AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden /> The account name does not contain the words in the payee name. Check it carefully before approving.</p>}
      {s.account_used_elsewhere && <p role="alert" className="flex items-start gap-2 rounded-lg border border-amber-400 bg-amber-50 p-3 text-amber-900"><AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden /> This account number is also used by another user's payout or payee request.</p>}
      {s.payee_kind === 'agent' && s.professional_status !== 'approved' && pending && <p role="alert" className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-red-900"><AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden /> The requester does not have an approved professional profile, so this cannot be approved.</p>}

      <button onClick={openDoc} className="flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 font-semibold"><FileText size={16} aria-hidden /> Open the owner's authorization{s.authorization_name ? ` (${s.authorization_name})` : ''}</button>
      <p className="text-xs text-muted-foreground">Opening a file is logged. It is a reading step, not a decision.</p>

      {s.review_note && <p className="rounded-md bg-secondary p-2 text-xs">Review note: {s.review_note}</p>}
      <ul className="space-y-1 text-xs">{(s.events ?? []).map((e: any, i: number) => <li key={i} className="rounded-md border border-border p-2"><b>{String(e.event).replace(/_/g, ' ')}</b> · {e.by ?? 'n/a'} · {when(e.at)}{e.note ? ` · "${e.note}"` : ''}</li>)}</ul>
      {approved && <p className="flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-emerald-900"><ShieldCheck size={16} aria-hidden /> Approved. {inEffect ? 'In effect.' : 'Waiting period still running.'} Not yet connected to payouts.</p>}

      {(pending || approved) && !mode && (
        <div className="flex flex-col gap-2 sm:flex-row">
          {pending && <>
            <button onClick={() => setMode('reject')} className="min-h-12 flex-1 rounded-lg border border-red-300 font-semibold text-red-800">Reject</button>
            <button onClick={() => setMode('approve')} className="min-h-12 flex-1 rounded-lg bg-primary font-bold text-primary-foreground">Approve</button>
          </>}
          {approved && <button onClick={() => setMode('revoke')} className="min-h-12 flex-1 rounded-lg border border-red-300 font-semibold text-red-800">Revoke approval</button>}
        </div>)}

      {mode && (
        <div className="space-y-3 rounded-xl border border-border p-3">
          {mode === 'approve' && (<>
            <label className="flex items-start gap-2"><input type="checkbox" className="mt-1 size-5" checked={a.identity_matches} onChange={(e) => setA({ ...a, identity_matches: e.target.checked })} /> The account name matches the payee.</label>
            <label className="flex items-start gap-2"><input type="checkbox" className="mt-1 size-5" checked={a.owner_confirmed} onChange={(e) => setA({ ...a, owner_confirmed: e.target.checked })} /> I read the owner's signed authorization and the owner confirmed it to me through a separate trusted channel (phone call or in person).</label>
          </>)}
          <div><label className="text-xs font-semibold" htmlFor="pn">{mode === 'reject' ? 'Reason for the requester (required)' : mode === 'revoke' ? 'Reason for withdrawing approval (required)' : 'Note: how was the owner confirmed? (required, 10+ characters)'}</label>
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
