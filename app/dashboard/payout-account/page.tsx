'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, ShieldAlert, Landmark, CheckCircle2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { NG_BANKS } from '@/lib/payment-submission'
import { COOLING_OFF_HOURS, itemLabel, validatePayoutAccount, type PayoutItem } from '@/lib/payout-account'

type State = { found: boolean; current_id: string | null; items: PayoutItem[] }

const field = 'w-full min-h-12 rounded-lg border border-border bg-input px-3 py-2.5 text-base'
const lbl = 'mb-1 block text-sm font-semibold text-foreground'
const when = (s?: string | null) => (s ? new Date(s).toLocaleString('en-NG') : '')

async function api(init?: RequestInit) {
  const t = (await supabase.auth.getSession()).data.session?.access_token ?? ''
  const res = await fetch('/api/payout-account', { ...init, headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' } })
  const j = await res.json().catch(() => null)
  return { ok: res.ok, j }
}

export default function PayoutAccountPage() {
  const router = useRouter()
  const [st, setSt] = useState<State | null>(null)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [bank, setBank] = useState('')
  const [num, setNum] = useState('')
  const [name, setName] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(async () => {
    setLoadErr(null)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push('/login'); return }
    const r = await api()
    if (!r.ok) { setLoadErr(r.j?.error ?? 'Could not load this page.'); return }
    setSt(r.j)
  }, [router])
  useEffect(() => { load() }, [load])

  const err = (k: string) => errors[k] ? <p role="alert" className="mt-1 text-xs font-medium text-red-700">{errors[k]}</p> : null

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    setMsg(null)
    const v = validatePayoutAccount({ bank_name: bank, account_number: num, account_name: name })
    if (!v.ok) { setErrors(v.errors); return }
    setErrors({}); setBusy(true)
    const r = await api({ method: 'POST', body: JSON.stringify({ action: 'request', ...v.value }) })
    setBusy(false)
    if (!r.ok) { if (r.j?.fields) setErrors(r.j.fields); setMsg({ ok: false, text: r.j?.error ?? 'Could not send your request.' }); return }
    setBank(''); setNum(''); setName('')
    setMsg({ ok: true, text: 'Sent to EboHomes for review. Nothing changes until it is approved.' })
    await load()
  }

  const cancel = async (id: string) => {
    if (busy) return
    setBusy(true); setMsg(null)
    const r = await api({ method: 'POST', body: JSON.stringify({ action: 'cancel', id }) })
    setBusy(false)
    setMsg(r.ok ? { ok: true, text: 'Request cancelled.' } : { ok: false, text: r.j?.error ?? 'Could not cancel.' })
    await load()
  }

  if (loadErr) return (
    <div className="mx-auto max-w-lg space-y-3 p-4">
      <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">{loadErr}</p>
      <button onClick={load} className="min-h-12 w-full rounded-xl bg-primary font-bold text-primary-foreground">Try again</button>
    </div>)
  if (!st) return <div className="flex min-h-[50vh] items-center justify-center" role="status" aria-label="Loading"><Loader2 className="animate-spin text-primary" size={28} aria-hidden /></div>

  const now = Date.now()
  const current = st.items.find((i) => i.id === st.current_id) ?? null
  const pending = st.items.find((i) => i.status === 'pending_review') ?? null
  const scheduled = st.items.find((i) => i.status === 'approved' && i.id !== st.current_id && i.effective_at && new Date(i.effective_at).getTime() > now) ?? null
  const canRequest = !pending && !scheduled

  return (
    <div className="mx-auto max-w-lg space-y-4 p-4">
      <div>
        <h1 className="text-xl font-bold text-foreground">Payout account</h1>
        <p className="text-sm text-muted-foreground">The bank account EboHomes will use when it pays you rent.</p>
      </div>

      <section className="space-y-1 rounded-xl border border-border bg-card p-4 text-sm" aria-label="Current payout account">
        <p className="flex items-center gap-2 font-bold"><Landmark size={18} aria-hidden /> Current account</p>
        {current ? (<>
          <p>{current.bank_name} · {current.masked}</p>
          <p className="text-muted-foreground">{current.account_name}</p>
          <p className="text-xs text-muted-foreground">Active since {when(current.effective_at)}</p>
        </>) : <p className="text-muted-foreground">You have no approved payout account yet.</p>}
      </section>

      {pending && (
        <section role="status" className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-bold">Waiting for EboHomes review</p>
          <p>{pending.bank_name} · {pending.masked} · {pending.account_name}</p>
          <p className="text-xs">{current ? 'Your current account stays in use until this is approved and the waiting period ends.' : 'You will be notified when it is approved.'}</p>
          <button type="button" disabled={busy} onClick={() => cancel(pending.id)} className="min-h-11 rounded-lg border border-amber-400 px-4 font-semibold disabled:opacity-50">Cancel this request</button>
        </section>)}

      {scheduled && (
        <section role="status" className="space-y-1 rounded-xl border border-sky-300 bg-sky-50 p-4 text-sm text-sky-900">
          <p className="font-bold">New account approved, not active yet</p>
          <p>{scheduled.bank_name} · {scheduled.masked} · {scheduled.account_name}</p>
          <p className="text-xs">It takes effect on {when(scheduled.effective_at)}. Until then your current account is used. If you did not request this, contact EboHomes immediately.</p>
        </section>)}

      {canRequest && (
        <form onSubmit={submit} noValidate className="space-y-4 rounded-xl border border-border bg-card p-4">
          <p className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <ShieldAlert size={18} className="mt-0.5 shrink-0" aria-hidden />
            <span><b>{current ? 'Changing your account is protected.' : 'New accounts are reviewed.'}</b> EboHomes checks that the account name matches your verified identity.{current ? ` A change takes effect at least ${COOLING_OFF_HOURS} hours after you ask, and EboHomes will contact you to confirm it. Your current account is used until then.` : ''} The account must be in your own name.</span>
          </p>
          <div>
            <label className={lbl} htmlFor="pa-bank">Bank</label>
            <input id="pa-bank" className={field} list="pa-banks" value={bank} onChange={(e) => setBank(e.target.value)} placeholder="Start typing, e.g. GTBank" />
            <datalist id="pa-banks">{NG_BANKS.map((b) => <option key={b} value={b} />)}</datalist>{err('bank_name')}
          </div>
          <div>
            <label className={lbl} htmlFor="pa-num">Account number (10 digits)</label>
            <input id="pa-num" className={field} inputMode="numeric" autoComplete="off" maxLength={13} value={num} onChange={(e) => setNum(e.target.value)} />{err('account_number')}
          </div>
          <div>
            <label className={lbl} htmlFor="pa-name">Account name, exactly as your bank shows it</label>
            <input id="pa-name" className={field} autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} />{err('account_name')}
          </div>
          {msg && <p role={msg.ok ? 'status' : 'alert'} className={`rounded-lg border p-3 text-sm ${msg.ok ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : 'border-red-300 bg-red-50 text-red-900'}`}>{msg.text}</p>}
          <button type="submit" disabled={busy} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-base font-bold text-primary-foreground disabled:opacity-60">
            {busy ? <><Loader2 size={18} className="animate-spin" aria-hidden /> Sending...</> : current ? 'Request account change' : 'Send account for review'}
          </button>
        </form>)}
      {!canRequest && msg && <p role={msg.ok ? 'status' : 'alert'} className={`rounded-lg border p-3 text-sm ${msg.ok ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : 'border-red-300 bg-red-50 text-red-900'}`}>{msg.text}</p>}

      <section aria-label="History">
        <h2 className="mb-2 font-bold">History</h2>
        {st.items.length === 0 ? <p className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">No requests yet.</p> : (
          <ul className="space-y-2">{st.items.map((i) => (
            <li key={i.id} className="space-y-1 rounded-xl border border-border bg-card p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>{i.bank_name} · {i.masked}</span>
                <span className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-2.5 py-1 text-xs font-semibold">
                  {i.id === st.current_id && <CheckCircle2 size={12} className="text-emerald-700" aria-hidden />}{itemLabel(i, st.current_id, now)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">Requested {when(i.requested_at)}</p>
              {i.review_note && <p className="text-xs font-medium text-red-800">Note from EboHomes: {i.review_note}</p>}
            </li>))}</ul>)}
      </section>
    </div>
  )
}