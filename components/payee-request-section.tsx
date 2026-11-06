'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, Upload, Wallet } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { AUTHORITY_ACCEPT, AUTHORITY_BUCKET } from '@/lib/authority-evidence'
import { friendlyPayeeError, validatePayeeFileMeta, validatePayeeInput } from '@/lib/payee-authorization'

const field = 'w-full min-h-11 rounded-lg border border-border bg-input px-3 py-2 text-base'
const label = 'mb-1 block text-sm font-semibold text-foreground'
const when = (s?: string | null) => (s ? new Date(s).toLocaleString('en-NG') : '')
const STATUS: Record<string, { text: string; tone: string }> = {
  pending_review: { text: 'Waiting for EboHomes review', tone: 'border-amber-300 bg-amber-50 text-amber-900' },
  approved: { text: 'Approved', tone: 'border-emerald-300 bg-emerald-50 text-emerald-900' },
  rejected: { text: 'Not approved', tone: 'border-red-300 bg-red-50 text-red-900' },
  cancelled: { text: 'Cancelled', tone: 'border-slate-300 bg-slate-100 text-slate-700' },
  revoked: { text: 'Approval withdrawn', tone: 'border-red-300 bg-red-50 text-red-900' },
}

async function authedFetch(path: string, body: unknown) {
  const t = (await supabase.auth.getSession()).data.session?.access_token ?? ''
  const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` }, body: JSON.stringify(body) })
  const j = await res.json().catch(() => null)
  return { ok: res.ok, j }
}

type Item = {
  id: string; payee_kind: string; payee_name: string; bank_name: string; masked: string; account_name: string
  status: string; requested_at: string; effective_at: string | null; review_note: string | null
}

export default function PayeeRequestSection({ listingId, claimedRole }: { listingId: string; claimedRole: string }) {
  const kind = claimedRole === 'company_representative' ? 'company' : 'agent'
  const [items, setItems] = useState<Item[] | null>(null)
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [payeeName, setPayeeName] = useState('')
  const [bank, setBank] = useState('')
  const [num, setNum] = useState('')
  const [acctName, setAcctName] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('my_property_payees', { p_listing: listingId })
    if (error || !data?.found) { setItems([]); return }
    setItems(data.items ?? [])
    setCurrentId(data.current_id ?? null)
  }, [listingId])
  useEffect(() => { load() }, [load])

  const pending = (items ?? []).find((i) => i.status === 'pending_review')
  const scheduled = (items ?? []).find((i) => i.status === 'approved' && i.effective_at && new Date(i.effective_at) > new Date())
  const current = (items ?? []).find((i) => i.id === currentId)
  const canRequest = items !== null && !pending && !scheduled

  async function send() {
    if (busy) return
    setErr(null); setMsg(null)
    const v = validatePayeeInput({ payee_kind: kind, payee_name: payeeName, bank_name: bank, account_number: num, account_name: acctName })
    if (!v.ok) { setErr(Object.values(v.errors)[0]); return }
    if (!file) { setErr('Choose the owner\'s signed rent-collection authorization.'); return }
    const bad = validatePayeeFileMeta(file.type, file.size)
    if (bad) { setErr(bad); return }
    setBusy(true)
    try {
      const p = await authedFetch('/api/payee-authorization/prepare', { listing_id: listingId, mime: file.type, bytes: file.size })
      if (!p.ok) { setErr(p.j?.error ?? 'Could not prepare the upload.'); return }
      const up = await supabase.storage.from(AUTHORITY_BUCKET).uploadToSignedUrl(p.j.path, p.j.token, file, { contentType: file.type })
      if (up.error) { setErr('The upload failed. Check your connection and try again.'); return }
      const r = await authedFetch('/api/payee-authorization', {
        listing_id: listingId, ...v.value, path: p.j.path, name: file.name,
      })
      if (!r.ok) { setErr(r.j?.error ?? 'Could not send your request.'); return }
      setMsg('Request sent. Rent continues to go to the owner unless EboHomes approves it.')
      setPayeeName(''); setBank(''); setNum(''); setAcctName(''); setFile(null)
      await load()
    } finally { setBusy(false) }
  }

  async function cancel(id: string) {
    if (busy || !window.confirm('Cancel this request?')) return
    setBusy(true); setErr(null); setMsg(null)
    const { error } = await supabase.rpc('cancel_property_payee_request', { p_id: id })
    setBusy(false)
    if (error) { setErr(friendlyPayeeError(error.message, 'Could not cancel the request.')); return }
    setMsg('Request cancelled.')
    await load()
  }

  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-base font-bold"><Wallet size={18} aria-hidden /> Rent payee</h2>
      <p className="rounded-lg bg-secondary p-3 text-xs text-muted-foreground">
        The property owner is the default rent payee. To receive rent for this property yourself, you must upload the owner's signed
        rent-collection authorization. EboHomes confirms it with the owner before approving. You cannot change the payee on your own.
        Approval is not property authority and it is not payout: it only records who the owner agreed may receive rent.
      </p>

      <div className="rounded-lg border border-border p-3 text-sm">
        <p className="text-xs text-muted-foreground">Current rent payee</p>
        <p className="font-semibold">{current ? `${current.payee_name} · ${current.bank_name} ${current.masked}` : 'The property owner (default)'}</p>
      </div>

      {err && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">{err}</p>}
      {msg && <p role="status" className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">{msg}</p>}

      {items === null ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={16} className="animate-spin" aria-hidden /> Loading...</p> : (
        <ul className="space-y-2">
          {items.map((i) => {
            const st = STATUS[i.status] ?? { text: i.status, tone: 'border-slate-300 bg-slate-50 text-slate-900' }
            return (
              <li key={i.id} className="space-y-1 rounded-lg border border-border p-3 text-sm">
                <p className="font-semibold">{i.payee_name} · {i.bank_name} {i.masked}</p>
                <p className="text-xs text-muted-foreground">Account name: {i.account_name} · requested {when(i.requested_at)}</p>
                <p className={`inline-block rounded-md border px-2 py-1 text-xs font-semibold ${st.tone}`}>{st.text}</p>
                {i.status === 'approved' && i.effective_at && new Date(i.effective_at) > new Date() && <p className="text-xs">Takes effect after a security waiting period: {when(i.effective_at)}.</p>}
                {i.status === 'rejected' && i.review_note && <p className="text-xs">EboHomes says: {i.review_note}</p>}
                {i.status === 'pending_review' && (
                  <button type="button" disabled={busy} onClick={() => cancel(i.id)} className="mt-1 min-h-11 rounded-lg border border-border px-3 text-sm font-semibold disabled:opacity-50">Cancel request</button>)}
              </li>)
          })}
        </ul>)}

      {canRequest && (
        <div className="space-y-3 rounded-lg border border-dashed border-border p-3">
          <h3 className="text-sm font-bold">{current ? 'Request a change of payee' : 'Request to receive rent'}</h3>
          <div><label className={label} htmlFor="pp-name">{kind === 'company' ? 'Company name' : 'Payee name'}</label>
            <input id="pp-name" className={field} maxLength={200} value={payeeName} disabled={busy} onChange={(e) => setPayeeName(e.target.value)} /></div>
          <div><label className={label} htmlFor="pp-bank">Bank</label>
            <input id="pp-bank" className={field} maxLength={80} value={bank} disabled={busy} onChange={(e) => setBank(e.target.value)} /></div>
          <div><label className={label} htmlFor="pp-num">Account number (10 digits)</label>
            <input id="pp-num" inputMode="numeric" className={field} maxLength={14} value={num} disabled={busy} onChange={(e) => setNum(e.target.value)} /></div>
          <div><label className={label} htmlFor="pp-an">Account name (as the bank shows it)</label>
            <input id="pp-an" className={field} maxLength={120} value={acctName} disabled={busy} onChange={(e) => setAcctName(e.target.value)} /></div>
          <div>
            <p className={label}>Owner's signed rent-collection authorization</p>
            <input ref={fileRef} type="file" accept={AUTHORITY_ACCEPT} className="hidden" onChange={(e) => { setFile(e.target.files?.[0] ?? null); e.target.value = '' }} />
            <button type="button" disabled={busy} onClick={() => fileRef.current?.click()}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-border bg-card text-sm font-semibold disabled:opacity-50">
              <Upload size={16} aria-hidden /> {file ? file.name : 'Choose file (JPG, PNG, WEBP or PDF, up to 10MB)'}
            </button>
          </div>
          <button type="button" disabled={busy} onClick={send}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">
            {busy && <Loader2 size={16} className="animate-spin" aria-hidden />} Send request to EboHomes
          </button>
        </div>)}
    </section>
  )
}
