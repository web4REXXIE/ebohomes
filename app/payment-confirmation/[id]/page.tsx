'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { Loader2, CheckCircle2, Circle, XCircle, KeyRound, ShieldAlert, Receipt, FileText } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { CODE_LENGTH, REASON_MESSAGE, isWellFormedCode, normalizeCode, progressSteps, type ConfirmState } from '@/lib/confirmation-code'

type St = {
  found: boolean; state: ConfirmState; tenancy_id?: string; tenancy_code?: string; listing_title?: string; location?: string
  payment_type?: string; amount?: number; reference?: string; expires_at?: string | null; attempts_left?: number | null
  confirmed_at?: string | null; receipt_code?: string | null
}

const naira = (n: number) => '₦' + Number(n).toLocaleString('en-NG', { maximumFractionDigits: 2 })
const field = 'w-full min-h-14 rounded-lg border border-border bg-input px-3 py-2.5 text-center text-xl font-bold tracking-widest uppercase'

const INTRO: Record<ConfirmState, string> = {
  awaiting_review: 'EboHomes has your evidence and has not verified the payment yet. We will notify you when a decision is made.',
  needs_info: 'EboHomes needs more information. Open your payment page to read the message and send a correction.',
  closed: 'This submission is closed. Open your payment page to see why, or send a correction if you did pay.',
  code_pending: 'EboHomes verified your payment in the bank. Your confirmation code email has not been delivered yet. EboHomes needs to send it again. This page checks by itself every 30 seconds. If nothing arrives soon, contact EboHomes support and ask them to resend it.',
  code_sent: 'EboHomes verified your payment. We emailed you a confirmation code. Enter it below to finish.',
  code_expired: 'Your confirmation code has expired. Contact EboHomes support and we will send a new one.',
  locked: 'Your code was locked after too many wrong attempts. Contact EboHomes support and we will send a new one.',
  confirmed: 'You have confirmed this payment.',
}

export default function PaymentConfirmationPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [st, setSt] = useState<St | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoadErr(null)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push('/login'); return }
    const { data, error } = await supabase.rpc('eb_my_confirmation_state', { p_submission: id })
    if (error) setLoadErr('Could not load this page. Check your connection and try again.')
    else setSt(data as St)
    setLoading(false)
  }, [id, router])
  useEffect(() => { load() }, [load])

  // While we wait for review or for the code email, check again every 30 seconds.
  const waiting = st?.state === 'awaiting_review' || st?.state === 'code_pending'
  useEffect(() => {
    if (!waiting) return
    const t = setInterval(() => { load() }, 30000)
    return () => clearInterval(t)
  }, [waiting, load])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    const c = normalizeCode(code)
    if (!isWellFormedCode(c)) { setMsg(`Enter the ${CODE_LENGTH}-character code from your email.`); return }
    setBusy(true); setMsg(null)
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token ?? ''
      const res = await fetch('/api/payment-confirmation/redeem', {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ submission_id: id, code: c }),
      })
      const j = await res.json().catch(() => null)
      if (j?.ok) { setCode(''); await load(); return }
      if (j?.reason) {
        const left = typeof j.attempts_left === 'number' && j.reason === 'invalid' ? ` You have ${j.attempts_left} ${j.attempts_left === 1 ? 'try' : 'tries'} left.` : ''
        setMsg((REASON_MESSAGE[j.reason] ?? 'That code could not be accepted.') + left)
        if (['expired', 'locked', 'already_used'].includes(j.reason)) await load()
      } else setMsg(j?.error ?? 'Something went wrong. Try again.')
    } catch {
      setMsg('Network problem. Check your connection and try again.')
    } finally { setBusy(false) }
  }

  if (loading) return <div className="flex min-h-[50vh] items-center justify-center" role="status" aria-label="Loading"><Loader2 className="animate-spin text-primary" size={28} aria-hidden /></div>
  if (loadErr) return (
    <div className="mx-auto max-w-lg space-y-3 p-4">
      <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">{loadErr}</p>
      <button onClick={() => { setLoading(true); load() }} className="min-h-12 w-full rounded-xl bg-primary font-bold text-primary-foreground">Try again</button>
    </div>
  )
  if (!st?.found) return (
    <div className="mx-auto max-w-lg p-4"><p className="rounded-lg border border-border bg-card p-4 text-sm">We could not find this payment on your account.</p></div>
  )

  const steps = progressSteps(st.state)
  const payLink = `/tenancies/${st.tenancy_id}/pay`

  return (
    <div className="mx-auto max-w-lg space-y-4 p-4">
      <div>
        <h1 className="text-xl font-bold text-foreground">Payment confirmation</h1>
        <p className="text-sm text-muted-foreground">{st.listing_title}{st.location ? ` · ${st.location}` : ''} · {st.tenancy_code}</p>
      </div>

      <ol className="space-y-3 rounded-xl border border-border bg-card p-4" aria-label="Confirmation progress">
        {steps.map((s) => (
          <li key={s.key} className="flex items-center gap-2 text-sm">
            {s.state === 'done' ? <CheckCircle2 size={20} className="text-emerald-700" aria-hidden />
              : s.state === 'bad' ? <XCircle size={20} className="text-red-700" aria-hidden />
              : s.state === 'current' ? <Loader2 size={20} className="animate-spin text-amber-700" aria-hidden />
              : <Circle size={20} className="text-muted-foreground" aria-hidden />}
            <span className={s.state === 'todo' ? 'text-muted-foreground' : 'font-semibold text-foreground'}>{s.label}</span>
          </li>))}
      </ol>

      <p className="rounded-lg bg-secondary p-3 text-sm">{INTRO[st.state]}</p>

      {waiting && (
        <button type="button" onClick={() => { setLoading(true); load() }} className="flex min-h-12 w-full items-center justify-center rounded-xl border border-border text-sm font-semibold">
          Check again
        </button>)}

      {st.state === 'code_sent' && (
        <form onSubmit={submit} noValidate className="space-y-3 rounded-xl border border-border bg-card p-4">
          <p className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
            <ShieldAlert size={16} className="mt-0.5 shrink-0" aria-hidden />
            <span>EboHomes staff will never ask for this code by phone, WhatsApp or message. Do not share it.</span>
          </p>
          <label htmlFor="cc" className="flex items-center gap-2 text-sm font-semibold"><KeyRound size={16} aria-hidden /> Confirmation code from your email</label>
          <input id="cc" value={code} onChange={(e) => setCode(e.target.value)} maxLength={CODE_LENGTH + 1} className={field}
            autoComplete="one-time-code" autoCapitalize="characters" autoCorrect="off" spellCheck={false} placeholder="XXXX-XXXX" aria-describedby="cc-help" />
          <p id="cc-help" className="text-xs text-muted-foreground">
            It works once{st.expires_at ? ` and expires ${new Date(st.expires_at).toLocaleString('en-NG')}` : ''}.
            {typeof st.attempts_left === 'number' ? ` ${st.attempts_left} tries left.` : ''}
          </p>
          {msg && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">{msg}</p>}
          <button type="submit" disabled={busy} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-base font-bold text-primary-foreground disabled:opacity-60">
            {busy ? <><Loader2 size={18} className="animate-spin" aria-hidden /> Checking...</> : 'Confirm my payment'}
          </button>
        </form>)}

      {st.state === 'confirmed' && (
        <div role="status" className="space-y-3 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900">
          <p className="flex items-center gap-2 text-base font-bold"><CheckCircle2 size={20} aria-hidden /> Payment confirmed</p>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
            <dt className="text-xs">Amount</dt><dd className="font-semibold">{naira(st.amount ?? 0)}</dd>
            <dt className="text-xs">Reference</dt><dd className="break-all">{st.reference}</dd>
            <dt className="text-xs">Property</dt><dd>{st.listing_title}</dd>
            <dt className="text-xs">Tenancy</dt><dd>{st.tenancy_code}</dd>
            {st.confirmed_at && (<><dt className="text-xs">Confirmed</dt><dd>{new Date(st.confirmed_at).toLocaleString('en-NG')}</dd></>)}
          </dl>
          <div className="flex flex-col gap-2 sm:flex-row">
            {st.receipt_code && <Link href={`/receipt/${st.receipt_code}`} className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-lg bg-primary font-bold text-primary-foreground"><Receipt size={16} aria-hidden /> View receipt</Link>}
            <Link href={`/tenancies/${st.tenancy_id}`} className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-lg border border-emerald-400 font-semibold"><FileText size={16} aria-hidden /> Tenancy and signed agreement</Link>
          </div>
          <p className="text-xs">This confirms your payment only. Landlord payout and key handover are separate steps that are not part of this page.</p>
        </div>)}

      <Link href={payLink} className="flex min-h-12 items-center justify-center rounded-xl border border-border text-sm font-semibold">Back to my payment page</Link>
    </div>
  )
}