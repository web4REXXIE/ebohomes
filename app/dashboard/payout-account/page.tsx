'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Loader2, ShieldAlert, Landmark, CheckCircle2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { NG_BANKS } from '@/lib/payment-submission'
import { COOLING_OFF_HOURS, itemLabel, validatePayoutAccount, type PayoutItem } from '@/lib/payout-account'

type State = { found: boolean; current_id: string | null; items: PayoutItem[] }

const field = 'focus-ring w-full min-h-12 rounded-lg border border-border bg-input px-3 py-2.5 text-base'
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
  const [confirmCancel, setConfirmCancel] = useState(false)
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

  const err = (k: string, id: string) => errors[k] ? <p id={id} role="alert" className="mt-1 text-xs font-medium text-danger">{errors[k]}</p> : null

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
    setBusy(false); setConfirmCancel(false)
    setMsg(r.ok ? { ok: true, text: 'Request cancelled.' } : { ok: false, text: r.j?.error ?? 'Could not cancel.' })
    await load()
  }

  if (loadErr) return (
    <div className="mx-auto max-w-lg space-y-3 p-4">
      <p role="alert" className="rounded-card border border-danger/30 bg-danger-soft p-3 text-sm font-medium text-danger">{loadErr}</p>
      <button onClick={load} className="focus-ring min-h-12 w-full rounded-button bg-primary font-bold text-primary-foreground">Try again</button>
    </div>)
  if (!st) return <div className="flex min-h-[50vh] items-center justify-center" role="status" aria-label="Loading"><Loader2 className="animate-spin text-primary" size={28} aria-hidden /></div>

  const now = Date.now()
  const current = st.items.find((i) => i.id === st.current_id) ?? null
  const pending = st.items.find((i) => i.status === 'pending_review') ?? null
  const scheduled = st.items.find((i) => i.status === 'approved' && i.id !== st.current_id && i.effective_at && new Date(i.effective_at).getTime() > now) ?? null
  const canRequest = !pending && !scheduled

  const msgBox = msg && (
    <p role={msg.ok ? 'status' : 'alert'} className={`rounded-lg border p-3 text-sm font-medium ${msg.ok ? 'border-success/30 bg-success-soft text-success' : 'border-danger/30 bg-danger-soft text-danger'}`}>{msg.text}</p>
  )

  return (
    <div className="mx-auto max-w-lg space-y-4 p-4 sm:p-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">Payout account</h1>
        <p className="text-sm text-muted-foreground">The bank account EboHomes will use when it pays you rent.</p>
        <Link href="/dashboard/payouts" className="focus-ring mt-1 inline-block text-sm font-semibold text-primary underline">See your payouts</Link>
      </div>

      <section className="space-y-1 rounded-card border border-border bg-card p-4 text-sm shadow-rest" aria-label="Current payout account">
        <p className="flex items-center gap-2 font-bold text-foreground"><Landmark size={18} aria-hidden /> Current account</p>
        {current ? (<>
          <p className="text-foreground">{current.bank_name} · {current.masked}</p>
          <p className="text-muted-foreground">{current.account_name}</p>
          <p className="text-xs text-muted-foreground">Active since {when(current.effective_at)}</p>
        </>) : <p className="text-muted-foreground">You have no approved payout account yet.</p>}
      </section>

      {pending && (
        <section role="status" className="space-y-2 rounded-card border border-warning/30 bg-warning-soft p-4 text-sm text-warning">
          <p className="font-bold">Waiting for EboHomes review</p>
          <p>{pending.bank_name} · {pending.masked} · {pending.account_name}</p>
          <p className="text-xs">{current ? 'Your current account stays in use until this is approved and the waiting period ends.' : 'You will be notified when it is approved.'}</p>
          {!confirmCancel ? (
            <button type="button" disabled={busy} onClick={() => setConfirmCancel(true)} className="focus-ring min-h-11 rounded-lg border border-warning/50 px-4 font-semibold disabled:opacity-50">Cancel this request</button>
          ) : (
            <div role="group" aria-label="Confirm cancelling this request" className="space-y-2 rounded-lg border border-warning/40 bg-card p-3 text-foreground">
              <p className="text-sm font-semibold">Cancel this account request?</p>
              <div className="flex gap-2">
                <button type="button" disabled={busy} onClick={() => cancel(pending.id)} className="focus-ring flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-primary font-bold text-primary-foreground disabled:opacity-50">{busy && <Loader2 size={16} className="animate-spin" aria-hidden />}Yes, cancel it</button>
                <button type="button" disabled={busy} onClick={() => setConfirmCancel(false)} className="focus-ring min-h-11 flex-1 rounded-lg border border-border font-semibold disabled:opacity-50">Keep it</button>
              </div>
            </div>)}
        </section>)}

      {scheduled && (
        <section role="status" className="space-y-1 rounded-card border border-info/30 bg-info-soft p-4 text-sm text-info">
          <p className="font-bold">New account approved, not active yet</p>
          <p>{scheduled.bank_name} · {scheduled.masked} · {scheduled.account_name}</p>
          <p className="text-xs">It takes effect on {when(scheduled.effective_at)}. Until then your current account is used. If you did not request this, contact EboHomes immediately.</p>
        </section>)}

      {canRequest && (
        <form onSubmit={submit} noValidate className="space-y-4 rounded-card border border-border bg-card p-4 shadow-rest">
          <p className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-soft p-3 text-sm text-warning">
            <ShieldAlert size={18} className="mt-0.5 shrink-0" aria-hidden />
            <span><b>{current ? 'Changing your account is protected.' : 'New accounts are reviewed.'}</b> EboHomes checks that the account name matches your verified identity.{current ? ` A change takes effect at least ${COOLING_OFF_HOURS} hours after you ask, and EboHomes will contact you to confirm it. Your current account is used until then.` : ''} The account must be in your own name.</span>
          </p>
          <div>
            <label className={lbl} htmlFor="pa-bank">Bank</label>
            <input id="pa-bank" className={field} list="pa-banks" value={bank} onChange={(e) => setBank(e.target.value)} placeholder="Start typing, e.g. GTBank" aria-invalid={!!errors.bank_name} aria-describedby={errors.bank_name ? 'pa-bank-err' : undefined} />
            <datalist id="pa-banks">{NG_BANKS.map((b) => <option key={b} value={b} />)}</datalist>{err('bank_name', 'pa-bank-err')}
          </div>
          <div>
            <label className={lbl} htmlFor="pa-num">Account number (10 digits)</label>
            <input id="pa-num" className={field} inputMode="numeric" autoComplete="off" maxLength={13} value={num} onChange={(e) => setNum(e.target.value)} aria-invalid={!!errors.account_number} aria-describedby={errors.account_number ? 'pa-num-err' : undefined} />{err('account_number', 'pa-num-err')}
          </div>
          <div>
            <label className={lbl} htmlFor="pa-name">Account name, exactly as your bank shows it</label>
            <input id="pa-name" className={field} autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!errors.account_name} aria-describedby={errors.account_name ? 'pa-name-err' : undefined} />{err('account_name', 'pa-name-err')}
          </div>
          {msgBox}
          <button type="submit" disabled={busy} className="focus-ring flex min-h-14 w-full items-center justify-center gap-2 rounded-button bg-primary px-4 text-base font-bold text-primary-foreground disabled:opacity-60">
            {busy ? <><Loader2 size={18} className="animate-spin" aria-hidden /> Sending...</> : current ? 'Request account change' : 'Send account for review'}
          </button>
        </form>)}
      {!canRequest && msgBox}

      <section aria-label="History">
        <h2 className="mb-2 font-bold text-foreground">History</h2>
        {st.items.length === 0 ? <p className="rounded-card border border-dashed border-border p-3 text-sm text-muted-foreground">No requests yet.</p> : (
          <ul className="space-y-2">{st.items.map((i) => (
            <li key={i.id} className="space-y-1 rounded-card border border-border bg-card p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-foreground">{i.bank_name} · {i.masked}</span>
                <span className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-2.5 py-1 text-xs font-semibold text-foreground">
                  {i.id === st.current_id && <CheckCircle2 size={12} className="text-success" aria-hidden />}{itemLabel(i, st.current_id, now)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">Requested {when(i.requested_at)}</p>
              {i.review_note && <p className="text-xs font-medium text-danger">Note from EboHomes: {i.review_note}</p>}
            </li>))}</ul>)}
      </section>
    </div>
  )
}
