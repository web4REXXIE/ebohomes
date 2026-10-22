'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, AlertTriangle, FileText, Upload, ShieldCheck } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { ADMIN_STATUS_LABEL, PROOF_ACCEPT, PROOF_BUCKET, validatePaid, validatePrepare, validateProofMeta, type PayoutStatus } from '@/lib/payout'

const naira = (n: number | string | null) => (n == null ? 'n/a' : '\u20A6' + Number(n).toLocaleString('en-NG', { maximumFractionDigits: 2 }))
const when = (s?: string | null) => (s ? new Date(s).toLocaleString('en-NG') : 'n/a')
const field = 'w-full min-h-11 rounded-lg border border-border bg-input px-3 py-2 text-base'
const FILTERS = [{ key: 'candidates', label: 'Ready to prepare' }, { key: 'progress', label: 'In progress' }, { key: 'done', label: 'Paid' }]
const tone: Record<string, string> = {
  pending: 'border-amber-300 bg-amber-50 text-amber-900', approved: 'border-sky-300 bg-sky-50 text-sky-900',
  paid: 'border-emerald-300 bg-emerald-50 text-emerald-900', confirmed: 'border-emerald-300 bg-emerald-50 text-emerald-900',
  disputed: 'border-red-300 bg-red-50 text-red-900', cancelled: 'border-slate-300 bg-slate-100 text-slate-700',
}

async function api(path: string, init?: RequestInit) {
  const t = (await supabase.auth.getSession()).data.session?.access_token ?? ''
  const res = await fetch(path, { ...init, headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' } })
  const j = await res.json().catch(() => null)
  return { ok: res.ok, j }
}

export default function AdminPayouts() {
  const [filter, setFilter] = useState('candidates')
  const [items, setItems] = useState<any[] | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    setItems(null); setErr(null)
    const r = await api(`/api/admin/payouts?filter=${filter}`)
    if (!r.ok) { setErr(r.j?.error ?? 'Could not load the list.'); setItems([]); return }
    setItems(r.j.items)
  }, [filter])
  useEffect(() => { load() }, [load])

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <h1 className="text-xl font-bold text-foreground">Landlord payouts</h1>
      <p className="rounded-lg bg-secondary p-3 text-xs text-muted-foreground">One admin prepares, a different admin approves. Mark a payout paid only after you have sent the transfer and uploaded the bank proof.</p>
      <div className="flex gap-2 overflow-x-auto pb-1" role="tablist">
        {FILTERS.map((f) => (
          <button key={f.key} role="tab" aria-selected={filter === f.key} onClick={() => { setFilter(f.key); setOpenId(null) }}
            className={`min-h-11 shrink-0 rounded-full border px-4 text-sm font-semibold ${filter === f.key ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card'}`}>{f.label}</button>))}
      </div>
      {err && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">{err}</p>}
      {items === null ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={16} className="animate-spin" aria-hidden /> Loading...</p>
        : items.length === 0 ? <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">Nothing here.</p>
        : filter === 'candidates' ? (
          <ul className="space-y-2">{items.map((c) => (
            <li key={c.payment_id} className="rounded-xl border border-border bg-card">
              <button className="flex w-full min-h-14 flex-wrap items-center justify-between gap-2 p-3 text-left text-sm" onClick={() => setOpenId(openId === c.payment_id ? null : c.payment_id)} aria-expanded={openId === c.payment_id}>
                <span><b>{c.landlord_name}</b> · {c.tenancy_code} · {c.type} · {naira(c.amount)}
                  {!c.has_account && <AlertTriangle size={14} className="ml-1 inline text-amber-700" aria-label="Landlord has no approved payout account" />}</span>
                <span className="text-xs text-muted-foreground">Tenant: {c.tenant_name}</span>
              </button>
              {openId === c.payment_id && <Prepare c={c} onDone={() => { setOpenId(null); load() }} />}
            </li>))}</ul>
        ) : (
          <ul className="space-y-2">{items.map((p) => (
            <li key={p.id} className="rounded-xl border border-border bg-card">
              <button className="flex w-full min-h-14 flex-wrap items-center justify-between gap-2 p-3 text-left text-sm" onClick={() => setOpenId(openId === p.id ? null : p.id)} aria-expanded={openId === p.id}>
                <span><b>{p.landlord_name}</b> · {p.tenancy_code} · {naira(p.amount)}</span>
                <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${tone[p.status]}`}>{ADMIN_STATUS_LABEL[p.status as PayoutStatus]}</span>
              </button>
              {openId === p.id && <PayoutRow p={p} onChanged={() => { setOpenId(null); load() }} />}
            </li>))}</ul>)}
    </div>
  )
}

function Prepare({ c, onDone }: { c: any; onDone: () => void }) {
  const key = useRef(typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : '')
  const [amount, setAmount] = useState(String(c.amount))
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const go = async () => {
    if (busy) return
    const v = validatePrepare({ amount, note, key: key.current }, Number(c.amount))
    if (!v.ok) { setMsg(v.error); return }
    setBusy(true); setMsg(null)
    const r = await api('/api/admin/payouts', { method: 'POST', body: JSON.stringify({ action: 'prepare', payment_id: c.payment_id, amount, note, key: key.current }) })
    setBusy(false)
    if (!r.ok) { setMsg(r.j?.error ?? 'Failed. Nothing was changed.'); return }
    onDone()
  }

  return (
    <div className="space-y-3 border-t border-border p-3 text-sm">
      {!c.has_account && <p role="alert" className="rounded-lg border border-amber-400 bg-amber-50 p-3 text-amber-900">This landlord has no active approved payout account, so a payout cannot be prepared yet.</p>}
      <div><label className="text-xs font-semibold" htmlFor="pa">Payout amount (&#8358;). Payment received: {naira(c.amount)}</label>
        <input id="pa" className={field} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
      <div><label className="text-xs font-semibold" htmlFor="pn">Note (required if the amount is different)</label>
        <textarea id="pn" rows={2} maxLength={1000} className={field} value={note} onChange={(e) => setNote(e.target.value)} /></div>
      {msg && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-red-900">{msg}</p>}
      <button disabled={busy || !c.has_account} onClick={go} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary font-bold text-primary-foreground disabled:opacity-50">
        {busy && <Loader2 size={16} className="animate-spin" aria-hidden />}Prepare payout</button>
    </div>
  )
}

function PayoutRow({ p, onChanged }: { p: any; onChanged: () => void }) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const [note, setNote] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [proofPath, setProofPath] = useState<string | null>(null)
  const [reference, setReference] = useState('')
  const [a, setA] = useState({ transferred_to_shown_account: false, amount_sent: '' })

  const post = async (body: object) => {
    setBusy(true); setMsg(null)
    const r = await api('/api/admin/payouts', { method: 'POST', body: JSON.stringify(body) })
    setBusy(false)
    if (!r.ok) { setMsg(r.j?.error ?? 'Failed. Nothing was changed.'); return false }
    return true
  }
  const approve = async () => { if (!busy && (await post({ action: 'approve', id: p.id }))) onChanged() }
  const cancel = async () => {
    if (busy) return
    if (note.trim().length < 5) { setMsg('Write a reason for cancelling.'); return }
    if (await post({ action: 'cancel', id: p.id, note })) onChanged()
  }
  const upload = async () => {
    if (!file || busy) return
    const bad = validateProofMeta(file.type, file.size)
    if (bad) { setMsg(bad); return }
    setBusy(true); setMsg(null)
    const slot = await api('/api/admin/payouts/proof', { method: 'POST', body: JSON.stringify({ id: p.id, mime: file.type, bytes: file.size }) })
    if (!slot.ok) { setBusy(false); setMsg(slot.j?.error ?? 'Could not prepare the upload.'); return }
    const up = await supabase.storage.from(PROOF_BUCKET).uploadToSignedUrl(slot.j.path, slot.j.token, file, { contentType: file.type })
    setBusy(false)
    if (up.error) { setMsg('The upload failed. Try again.'); return }
    setProofPath(slot.j.path)
  }
  const markPaid = async () => {
    if (busy) return
    const v = validatePaid({ reference, proof_path: proofPath, attest: a }, p.id, Number(p.amount))
    if (!v.ok) { setMsg(v.error); return }
    if (await post({ action: 'paid', id: p.id, reference, proof_path: proofPath, attest: a })) onChanged()
  }
  const viewProof = async () => { const r = await api(`/api/payouts/proof?id=${p.id}`); if (r.j?.url) window.open(r.j.url, '_blank', 'noopener'); else setMsg('Could not open the proof.') }

  return (
    <div className="space-y-3 border-t border-border p-3 text-sm">
      <dl className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
        <div><dt className="text-xs text-muted-foreground">Landlord</dt><dd>{p.landlord_name} · {p.landlord_phone ?? 'no phone'}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Tenancy · type</dt><dd>{p.tenancy_code} · {p.payment_type}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Payout amount</dt><dd><b>{naira(p.amount)}</b> (payment {naira(p.payment_amount)})</dd></div>
        <div><dt className="text-xs text-muted-foreground">Prepared by</dt><dd>{p.prepared_by_name ?? 'n/a'}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Pay to</dt><dd><b>{p.bank_name}</b> · <span className="font-mono font-bold">{p.account_number}</span> · {p.account_name}</dd></div>
        {p.payout_code && <div><dt className="text-xs text-muted-foreground">Payout receipt</dt><dd className="font-mono">{p.payout_code}</dd></div>}
        {p.bank_reference && <div><dt className="text-xs text-muted-foreground">Bank reference · paid</dt><dd>{p.bank_reference} · {when(p.paid_at)}</dd></div>}
      </dl>
      {p.prepare_note && <p className="rounded-md bg-secondary p-2 text-xs">Preparer note: {p.prepare_note}</p>}
      {p.landlord_note && <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-2 text-xs text-red-900">Landlord note: {p.landlord_note}</p>}
      {!p.account_is_current && (p.status === 'pending' || p.status === 'approved') && (
        <p role="alert" className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-red-900"><AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden /> This is no longer the landlord's active payout account. Cancel this payout and prepare it again.</p>)}
      <ul className="space-y-1 text-xs">{p.events.map((e: any, i: number) => <li key={i} className="rounded-md border border-border p-2"><b>{String(e.event).replace(/_/g, ' ')}</b> · {e.by ?? 'n/a'} · {when(e.at)}{e.note ? ` · "${e.note}"` : ''}</li>)}</ul>
      {p.has_proof && <button type="button" onClick={viewProof} className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-border px-3 font-semibold"><FileText size={15} aria-hidden /> Open proof of transfer</button>}

      {p.status === 'pending' && !cancelling && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <button onClick={() => setCancelling(true)} className="min-h-12 flex-1 rounded-lg border border-red-300 font-semibold text-red-800">Cancel payout</button>
          <button disabled={busy} onClick={approve} className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-lg bg-primary font-bold text-primary-foreground disabled:opacity-50">{busy && <Loader2 size={16} className="animate-spin" aria-hidden />}Approve (second admin)</button>
        </div>)}

      {p.status === 'approved' && !cancelling && (
        <div className="space-y-3 rounded-xl border border-border p-3">
          <p className="font-bold">Record the transfer</p>
          <p className="text-xs text-muted-foreground">1. Send {naira(p.amount)} to the account above from the EboHomes bank account. 2. Upload the bank proof. 3. Enter the reference and confirm.</p>
          <div>
            <label htmlFor="pf" className="flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-secondary/50 px-3 text-sm font-semibold"><Upload size={18} aria-hidden /> {file ? file.name : 'Choose the proof (photo or PDF, max 8MB)'}</label>
            <input id="pf" type="file" accept={PROOF_ACCEPT} className="sr-only" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setProofPath(null) }} />
            {file && !proofPath && <button type="button" disabled={busy} onClick={upload} className="mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-border font-semibold disabled:opacity-50">{busy && <Loader2 size={16} className="animate-spin" aria-hidden />}Upload proof</button>}
            {proofPath && <p className="mt-2 flex items-center gap-1 text-xs font-semibold text-emerald-800"><ShieldCheck size={14} aria-hidden /> Proof uploaded</p>}
          </div>
          <div><label className="text-xs font-semibold" htmlFor="rf">Bank transfer reference</label><input id="rf" className={field} autoCapitalize="none" value={reference} onChange={(e) => setReference(e.target.value)} /></div>
          <div><label className="text-xs font-semibold" htmlFor="am">Amount I sent (&#8358;)</label><input id="am" className={field} inputMode="decimal" value={a.amount_sent} onChange={(e) => setA({ ...a, amount_sent: e.target.value })} /></div>
          <label className="flex items-start gap-2"><input type="checkbox" className="mt-1 size-5" checked={a.transferred_to_shown_account} onChange={(e) => setA({ ...a, transferred_to_shown_account: e.target.checked })} /> I sent the money to the account shown above.</label>
          <button disabled={busy} onClick={markPaid} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary font-bold text-primary-foreground disabled:opacity-50">{busy && <Loader2 size={16} className="animate-spin" aria-hidden />}Mark as paid</button>
          <button onClick={() => setCancelling(true)} className="min-h-11 w-full rounded-lg border border-red-300 text-sm font-semibold text-red-800">Cancel payout instead</button>
        </div>)}

      {cancelling && (
        <div className="space-y-3 rounded-xl border border-border p-3">
          <div><label className="text-xs font-semibold" htmlFor="cn">Reason for cancelling (required)</label><textarea id="cn" rows={2} maxLength={1000} className={field} value={note} onChange={(e) => setNote(e.target.value)} /></div>
          <div className="flex gap-2">
            <button disabled={busy} onClick={cancel} className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-lg bg-primary font-bold text-primary-foreground disabled:opacity-50">{busy && <Loader2 size={16} className="animate-spin" aria-hidden />}Confirm cancel</button>
            <button disabled={busy} onClick={() => { setCancelling(false); setMsg(null) }} className="min-h-12 rounded-lg border border-border px-4 font-semibold">Back</button>
          </div>
        </div>)}
      {msg && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-red-900">{msg}</p>}
    </div>
  )
}