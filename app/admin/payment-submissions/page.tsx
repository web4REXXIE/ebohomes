'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, AlertTriangle, FileText, ShieldCheck, Mail } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { PAYMENT_METHODS, TYPE_LABEL, type SubmissionStatus } from '@/lib/payment-submission'
import { QUEUE_FILTERS, adminStatusLabel, amountMismatch, validateReview, type QueueFilter } from '@/lib/payment-review'

const naira = (n: number | string | null) => (n == null ? 'n/a' : '\u20A6' + Number(n).toLocaleString('en-NG', { maximumFractionDigits: 2 }))
const when = (s?: string | null) => (s ? new Date(s).toLocaleString('en-NG') : 'n/a')
const field = 'w-full min-h-11 rounded-lg border border-border bg-input px-3 py-2 text-base'
const tone: Record<string, string> = {
  submitted: 'border-amber-300 bg-amber-50 text-amber-900', under_review: 'border-amber-300 bg-amber-50 text-amber-900',
  needs_info: 'border-sky-300 bg-sky-50 text-sky-900', rejected: 'border-red-300 bg-red-50 text-red-900',
  superseded: 'border-slate-300 bg-slate-100 text-slate-700', verified: 'border-emerald-300 bg-emerald-50 text-emerald-900',
}

async function api(path: string, init?: RequestInit) {
  const t = (await supabase.auth.getSession()).data.session?.access_token ?? ''
  const res = await fetch(path, { ...init, headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' } })
  const j = await res.json().catch(() => null)
  return { ok: res.ok, j, status: res.status }
}

export default function AdminPaymentSubmissions() {
  const [filter, setFilter] = useState<QueueFilter>('awaiting')
  const [items, setItems] = useState<any[] | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    setItems(null); setErr(null)
    const r = await api(`/api/admin/payment-submissions?filter=${filter}`)
    if (!r.ok) { setErr(r.j?.error ?? `Could not load the queue (HTTP ${r.status}).`); setItems([]); return }
    setItems(r.j.items)
  }, [filter])
  useEffect(() => { load() }, [load])

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <h1 className="text-xl font-bold text-foreground">Payment evidence review</h1>
      <p className="rounded-lg bg-secondary p-3 text-xs text-muted-foreground">A tenant upload is only a claim. Verify only after you have personally checked the EboHomes bank account.</p>
      <div className="flex gap-2 overflow-x-auto pb-1" role="tablist">
        {QUEUE_FILTERS.map((f) => (
          <button key={f.key} role="tab" aria-selected={filter === f.key} onClick={() => { setFilter(f.key); setOpenId(null) }}
            className={`min-h-11 shrink-0 rounded-full border px-4 text-sm font-semibold ${filter === f.key ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card'}`}>{f.label}</button>))}
      </div>
      {err && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">{err}</p>}
      {items === null ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={16} className="animate-spin" aria-hidden /> Loading...</p>
        : items.length === 0 ? <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">Nothing here.</p>
        : <ul className="space-y-2">{items.map((s) => (
          <li key={s.id} className="rounded-xl border border-border bg-card">
            <button className="flex w-full min-h-14 flex-wrap items-center justify-between gap-2 p-3 text-left text-sm" onClick={() => setOpenId(openId === s.id ? null : s.id)} aria-expanded={openId === s.id}>
              <span><b>{s.tenant_name}</b> · {TYPE_LABEL[s.payment_type as keyof typeof TYPE_LABEL]} · {naira(s.amount_paid)}
                {amountMismatch(s.expected_amount, s.amount_paid) && <AlertTriangle size={14} className="ml-1 inline text-amber-700" aria-label="Amount differs from agreement" />}</span>
              <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${tone[s.status]}`}>{adminStatusLabel(s.status as SubmissionStatus, s.replaces_id)}</span>
            </button>
            {openId === s.id && <Detail id={s.id} onChanged={() => { setOpenId(null); load() }} />}
          </li>))}</ul>}
    </div>
  )
}

function Detail({ id, onChanged }: { id: string; onChanged: () => void }) {
  const [d, setD] = useState<any>(null)
  const [code, setCode] = useState<any>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [info, setInfo] = useState<{ ok: boolean; text: string } | null>(null)
  const [note, setNote] = useState('')
  const [mode, setMode] = useState<null | 'request_info' | 'reject' | 'verify'>(null)
  const [a, setA] = useState({ checked_bank_account: false, correct_tenant_and_property: false, amount_received: '', bank_reference: '', mismatch_acknowledged: false })

  const reload = useCallback(async () => {
    const r = await api(`/api/admin/payment-submissions?id=${id}`)
    if (!r.ok) { setMsg(r.j?.error ?? 'Could not load.'); return }
    setD(r.j)
    if (r.j.submission.status === 'verified') {
      const c = await supabase.rpc('eb_admin_code_status', { p_submission: id })
      setCode(c.data ?? null)
    }
  }, [id])
  useEffect(() => { reload() }, [reload])

  if (!d) return <p className="p-3 text-sm text-muted-foreground">{msg ?? 'Loading...'}</p>
  const s = d.submission, open = s.status === 'submitted' || s.status === 'under_review'
  const mismatch = amountMismatch(s.expected_amount, s.amount_paid)
  const name = (x?: string | null) => (x ? d.names[x] ?? 'Staff' : 'n/a')

  const viewEvidence = async () => { const r = await api(`/api/payment-submissions/evidence?id=${id}`); if (r.j?.url) window.open(r.j.url, '_blank', 'noopener'); else setMsg('Could not open the evidence.') }

  const sendCode = async () => {
    setBusy(true); setInfo(null)
    const r = await api('/api/admin/payment-submissions/issue-code', { method: 'POST', body: JSON.stringify({ id }) })
    setBusy(false)
    setInfo(r.ok ? { ok: true, text: 'Confirmation code emailed to the tenant.' } : { ok: false, text: r.j?.error ?? 'The code could not be sent.' })
    await reload()
  }

  const act = async (action: string) => {
    if (busy) return
    const v = validateReview(action, note, action === 'verify' ? a : null, { amount_paid: Number(s.amount_paid), expected_amount: s.expected_amount, transaction_reference: s.transaction_reference })
    if (!v.ok) { setMsg(v.error); return }
    setBusy(true); setMsg(null)
    const r = await api('/api/admin/payment-submissions/review', { method: 'POST', body: JSON.stringify({ id, action, note, attest: action === 'verify' ? a : undefined }) })
    setBusy(false)
    if (!r.ok) { setMsg(r.j?.error ?? 'Failed. Nothing was changed.'); return }
    if (action === 'verify') { setMode(null); await sendCode(); return }
    onChanged()
  }

  const codeLine = !code ? null
    : !code.exists ? 'No confirmation code has been issued yet.'
    : code.status === 'consumed' ? `Tenant confirmed with the code on ${when(code.consumed_at)}.`
    : code.status === 'locked' ? `Code locked after ${code.attempts} wrong attempts. Resend to issue a new one.`
    : code.status === 'expired' || (code.status === 'active' && new Date(code.expires_at) < new Date()) ? 'The last code expired. Resend to issue a new one.'
    : code.status === 'active' && code.delivery_status === 'sent' ? `Code emailed ${when(code.issued_at)}, expires ${when(code.expires_at)}. Wrong attempts: ${code.attempts}.`
    : 'The last code was NOT delivered to the tenant. Press Resend.'

  return (
    <div className="space-y-3 border-t border-border p-3 text-sm">
      <dl className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
        <div><dt className="text-xs text-muted-foreground">Tenant</dt><dd>{d.tenant?.full_name} · {d.tenant?.phone ?? 'no phone'} · {d.tenant?.email ?? 'no email'}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Property</dt><dd>{d.listing?.title} · {d.listing?.location_text}{(Array.isArray(d.listing?.properties) ? d.listing.properties[0] : d.listing?.properties)?.public_id ? ` · ${(Array.isArray(d.listing.properties) ? d.listing.properties[0] : d.listing.properties).public_id}` : ''}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Tenancy</dt><dd>{d.tenancy?.tenancy_code} · {d.tenancy?.status}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Signed terms (rent / deposit / fees)</dt><dd>{naira(d.terms?.rent_amount)} / {naira(d.terms?.deposit_amount)} / {naira(d.terms?.fees_amount)}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Expected for {TYPE_LABEL[s.payment_type as keyof typeof TYPE_LABEL]}</dt><dd>{naira(s.expected_amount)}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Tenant says they paid</dt><dd><b>{naira(s.amount_paid)}</b></dd></div>
        <div><dt className="text-xs text-muted-foreground">Payer · bank</dt><dd>{s.payer_name} · {s.payer_bank}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Reference · method · time</dt><dd>{s.transaction_reference} · {PAYMENT_METHODS.find((m) => m.value === s.payment_method)?.label} · {when(s.paid_at)}</dd></div>
      </dl>
      {s.notes && <p className="rounded-md bg-secondary p-2 text-xs">Tenant note: {s.notes}</p>}
      {mismatch && <p role="alert" className="flex items-start gap-2 rounded-lg border border-amber-400 bg-amber-50 p-3 text-amber-900"><AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden /> Amount differs from the signed agreement ({naira(s.expected_amount)} expected, {naira(s.amount_paid)} claimed). Nothing has been adjusted. Verifying needs an explicit acknowledgement and a note.</p>}
      <button type="button" onClick={viewEvidence} className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-border px-3 font-semibold"><FileText size={15} aria-hidden /> Open evidence (5 min link)</button>

      <div>
        <h3 className="mb-1 font-bold">History</h3>
        <ul className="space-y-1 text-xs">
          {d.events.map((e: any) => <li key={e.id} className="rounded-md border border-border p-2"><b>{e.event.replace(/_/g, ' ')}</b> · {name(e.actor_id)} · {when(e.created_at)}{e.note ? ` · "${e.note}"` : ''}</li>)}
          {d.history.length > 1 && <li className="text-muted-foreground">{d.history.length} submissions for this payment: {d.history.map((h: any) => adminStatusLabel(h.status, h.replaces_id)).join(' → ')}</li>}
        </ul>
      </div>

      {s.status === 'verified' && (
        <div className="space-y-2 rounded-lg bg-emerald-50 p-3 text-emerald-900">
          <p className="flex items-center gap-2"><ShieldCheck size={16} aria-hidden /> Verified by {name(s.reviewed_by)} on {when(s.reviewed_at)}. Payment record linked.</p>
          {codeLine && <p className="text-xs">{codeLine}</p>}
          {code?.status !== 'consumed' && (
            <button type="button" disabled={busy} onClick={sendCode} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 font-bold text-primary-foreground disabled:opacity-50">
              {busy ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Mail size={16} aria-hidden />}
              {code?.exists ? 'Resend confirmation code' : 'Send confirmation code'}
            </button>)}
        </div>)}
      {info && <p role={info.ok ? 'status' : 'alert'} className={`rounded-lg border p-3 ${info.ok ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : 'border-red-300 bg-red-50 text-red-900'}`}>{info.text}</p>}

      {open && !mode && (
        <div className="flex flex-col gap-2 sm:flex-row">
          {s.status === 'submitted' && <button disabled={busy} onClick={() => act('start_review')} className="min-h-12 flex-1 rounded-lg border border-border font-semibold disabled:opacity-50">Start review</button>}
          <button onClick={() => setMode('request_info')} className="min-h-12 flex-1 rounded-lg border border-border font-semibold">Request more info</button>
          <button onClick={() => setMode('reject')} className="min-h-12 flex-1 rounded-lg border border-red-300 font-semibold text-red-800">Reject</button>
          <button onClick={() => setMode('verify')} className="min-h-12 flex-1 rounded-lg bg-primary font-bold text-primary-foreground">Record bank verification</button>
        </div>)}

      {open && mode && (
        <div className="space-y-3 rounded-xl border border-border p-3">
          {mode === 'verify' && (<>
            <p className="font-bold">Bank verification attestation</p>
            <label className="flex items-start gap-2"><input type="checkbox" className="mt-1 size-5" checked={a.checked_bank_account} onChange={(e) => setA({ ...a, checked_bank_account: e.target.checked })} /> I checked the EboHomes bank account myself and the money has arrived.</label>
            <label className="flex items-start gap-2"><input type="checkbox" className="mt-1 size-5" checked={a.correct_tenant_and_property} onChange={(e) => setA({ ...a, correct_tenant_and_property: e.target.checked })} /> It is for this tenant, tenancy and property.</label>
            <div><label className="text-xs font-semibold" htmlFor="ar">Amount I saw in the bank (&#8358;)</label><input id="ar" className={field} inputMode="decimal" value={a.amount_received} onChange={(e) => setA({ ...a, amount_received: e.target.value })} /></div>
            <div><label className="text-xs font-semibold" htmlFor="br">Reference as shown in the bank</label><input id="br" className={field} autoCapitalize="none" value={a.bank_reference} onChange={(e) => setA({ ...a, bank_reference: e.target.value })} /></div>
            {mismatch && <label className="flex items-start gap-2"><input type="checkbox" className="mt-1 size-5" checked={a.mismatch_acknowledged} onChange={(e) => setA({ ...a, mismatch_acknowledged: e.target.checked })} /> I understand the amount differs from the signed agreement.</label>}
            <p className="text-xs text-muted-foreground">After you confirm, a one-time code is emailed to the tenant automatically.</p>
          </>)}
          <div><label className="text-xs font-semibold" htmlFor="nt">{mode === 'verify' ? (mismatch ? 'Note (required, explain the difference)' : 'Internal note (optional)') : 'Message to the tenant (required)'}</label>
            <textarea id="nt" rows={3} maxLength={1000} className={field} value={note} onChange={(e) => setNote(e.target.value)} /></div>
          <div className="flex gap-2">
            <button disabled={busy} onClick={() => act(mode)} className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-lg bg-primary font-bold text-primary-foreground disabled:opacity-50">{busy && <Loader2 size={16} className="animate-spin" aria-hidden />}Confirm</button>
            <button disabled={busy} onClick={() => { setMode(null); setMsg(null) }} className="min-h-12 rounded-lg border border-border px-4 font-semibold">Cancel</button>
          </div>
        </div>)}
      {msg && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-red-900">{msg}</p>}
    </div>
  )
}