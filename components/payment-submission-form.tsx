'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Loader2, Upload, ShieldAlert, CheckCircle2, Circle, XCircle, FileText, KeyRound } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import {
  EVIDENCE_ACCEPT, EVIDENCE_BUCKET, NG_BANKS, PAYMENT_METHODS, TYPE_LABEL, SUBMISSION_LABEL, SUBMISSION_NOTE,
  timelineSteps, validateEvidenceMeta, validateSubmission, type SubmissionStatus, type SubmissionType,
} from '@/lib/payment-submission'

export type Sub = {
  id: string; payment_type: SubmissionType; amount_paid: number; expected_amount: number | null; status: SubmissionStatus
  review_note: string | null; created_at: string; paid_at: string; transaction_reference: string
}
type Due = { type: SubmissionType; amount: number }

const naira = (n: number) => '\u20A6' + Number(n).toLocaleString('en-NG', { maximumFractionDigits: 2 })
const field = 'w-full min-h-12 rounded-lg border border-border bg-input px-3 py-2.5 text-base'
const lbl = 'mb-1 block text-sm font-semibold text-foreground'

function localNow() {
  const d = new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
  return d.toISOString().slice(0, 16)
}

export function SubmissionTimeline({ status }: { status: SubmissionStatus }) {
  return (
    <ol className="space-y-2" aria-label="Submission progress">
      {timelineSteps(status).map((s) => (
        <li key={s.key} className="flex items-center gap-2 text-sm">
          {s.state === 'done' ? <CheckCircle2 size={18} className="text-emerald-700" aria-hidden />
            : s.state === 'bad' ? <XCircle size={18} className="text-red-700" aria-hidden />
            : s.state === 'current' ? <Loader2 size={18} className="animate-spin text-amber-700" aria-hidden />
            : <Circle size={18} className="text-muted-foreground" aria-hidden />}
          <span className={s.state === 'todo' ? 'text-muted-foreground' : 'font-semibold text-foreground'}>{s.label}</span>
        </li>
      ))}
    </ol>
  )
}

export function SubmissionList({ items, onCorrect }: { items: Sub[]; onCorrect: (s: Sub) => void }) {
  const open = async (id: string) => {
    const t = (await supabase.auth.getSession()).data.session?.access_token ?? ''
    const res = await fetch(`/api/payment-submissions/evidence?id=${id}`, { headers: { Authorization: `Bearer ${t}` } })
    const j = await res.json().catch(() => null)
    if (j?.url) window.open(j.url, '_blank', 'noopener')
  }
  if (items.length === 0) return <p className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">You have not submitted any payment evidence yet.</p>
  return (
    <ul className="space-y-3">
      {items.map((s) => (
        <li key={s.id} className="space-y-2 rounded-xl border border-border bg-card p-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <b className="text-foreground">{naira(s.amount_paid)} <span className="text-xs font-normal text-muted-foreground">{TYPE_LABEL[s.payment_type]}</span></b>
            <span className="rounded-full border border-border bg-secondary px-2.5 py-1 text-xs font-semibold">{SUBMISSION_LABEL[s.status]}</span>
          </div>
          <p className="text-xs text-muted-foreground">{SUBMISSION_NOTE[s.status]}</p>
          {s.review_note && (s.status === 'rejected' || s.status === 'needs_info') && <p className="text-xs font-medium text-red-800">Note from EboHomes: {s.review_note}</p>}
          {s.status !== 'superseded' && <SubmissionTimeline status={s.status} />}
          <p className="text-xs text-muted-foreground">Ref {s.transaction_reference} · sent {new Date(s.created_at).toLocaleString('en-NG')}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => open(s.id)} className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-semibold"><FileText size={14} aria-hidden /> View my evidence</button>
            {s.status === 'verified' && (
              <Link href={`/payment-confirmation/${s.id}`} className="inline-flex min-h-11 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground"><KeyRound size={14} aria-hidden /> Confirmation and code</Link>
            )}
            {(s.status === 'rejected' || s.status === 'needs_info') && (
              <button type="button" onClick={() => onCorrect(s)} className="inline-flex min-h-11 items-center rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground">Correct and resubmit</button>
            )}
          </div>
        </li>
      ))}
    </ul>
  )
}

export function PaymentSubmissionForm({ tenancyId, due, replaces, onDone, renewalId = null }: { tenancyId: string; due: Due[]; replaces: Sub | null; onDone: () => void; renewalId?: string | null }) {
  const [type, setType] = useState<SubmissionType>(replaces?.payment_type ?? due[0]?.type ?? 'rent')
  const dueFor = (t: SubmissionType) => due.find((d) => d.type === t)?.amount
  const [amount, setAmount] = useState(String(replaces?.amount_paid ?? dueFor(type) ?? ''))
  const [name, setName] = useState('')
  const [bank, setBank] = useState('')
  const [ref, setRef] = useState(replaces?.transaction_reference ?? '')
  const [paidAt, setPaidAt] = useState('')
  const [method, setMethod] = useState('bank_transfer')
  const [notes, setNotes] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [stage, setStage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const err = (k: string) => errors[k] ? <p role="alert" className="mt-1 text-xs font-medium text-red-700">{errors[k]}</p> : null

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    setError(null)
    const payload = { payment_type: type, amount_paid: amount, payer_name: name, payer_bank: bank, transaction_reference: ref,
      paid_at: paidAt ? new Date(paidAt).toISOString() : '', payment_method: method, notes }
    const v = validateSubmission(payload)
    const errs: Record<string, string> = v.ok ? {} : { ...v.errors }
    if (!file) errs.file = 'Upload your bank receipt or a screenshot of the transfer.'
    else { const m = validateEvidenceMeta(file.type, file.size); if (m) errs.file = m }
    setErrors(errs)
    if (Object.keys(errs).length || !v.ok || !file) return

    setBusy(true)
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token ?? ''
      const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
      setStage('Preparing upload...')
      const prep = await fetch('/api/payment-submissions/prepare', { method: 'POST', headers: auth,
        body: JSON.stringify({ tenancy_id: tenancyId, payment_type: type, mime: file.type, bytes: file.size }) })
      const pj = await prep.json().catch(() => null)
      if (!prep.ok || !pj?.path) throw new Error(pj?.error ?? 'Could not prepare the upload.')
      setStage('Uploading your evidence...')
      const up = await supabase.storage.from(EVIDENCE_BUCKET).uploadToSignedUrl(pj.path, pj.token, file, { contentType: file.type })
      if (up.error) throw new Error('The upload failed. Check your network and try again.')
      setStage('Sending to EboHomes...')
      const res = await fetch('/api/payment-submissions', { method: 'POST', headers: auth,
        body: JSON.stringify({ ...payload, tenancy_id: tenancyId, evidence_path: pj.path, replaces_id: replaces?.id ?? null, renewal_id: renewalId }) })
      const j = await res.json().catch(() => null)
      if (!res.ok) { if (j?.fields) setErrors(j.fields); throw new Error(j?.error ?? 'Could not save your submission.') }
      setDone(true)
      onDone()
    } catch (x: any) {
      setError(x?.message ?? 'Something went wrong. Try again.')
    } finally { setBusy(false); setStage('') }
  }

  if (done) {
    return (
      <div role="status" className="space-y-3 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900">
        <p className="flex items-center gap-2 text-base font-bold"><CheckCircle2 size={20} aria-hidden /> Evidence received</p>
        <p>EboHomes will now check the bank account. <b>Your payment is not verified yet.</b> We will notify you when a decision is made. You do not need to pay again.</p>
        <SubmissionTimeline status="submitted" />
      </div>
    )
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4 rounded-xl border border-border bg-card p-4">
      <p className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
        <ShieldAlert size={18} className="mt-0.5 shrink-0" aria-hidden />
        <span><b>Uploading evidence does not verify your payment.</b> EboHomes only confirms it after an administrator sees the money in the bank account. Never send evidence for a payment you did not make.</span>
      </p>
      {replaces && <p className="rounded-lg bg-secondary p-3 text-sm">You are correcting an earlier submission. It will be closed when you send this one.</p>}

      <div>
        <label className={lbl} htmlFor="ps-type">What did you pay for?</label>
        <select id="ps-type" className={field} value={type} disabled={!!replaces || !!renewalId}
          onChange={(e) => { const t = e.target.value as SubmissionType; setType(t); setAmount(String(dueFor(t) ?? '')) }}>
          {due.map((d) => <option key={d.type} value={d.type}>{TYPE_LABEL[d.type]} ({naira(d.amount)} {renewalId ? 'for your renewal' : 'in your agreement'})</option>)}
        </select>{err('payment_type')}
      </div>
      <div>
        <label className={lbl} htmlFor="ps-amt">Amount paid (&#8358;)</label>
        <input id="ps-amt" className={field} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 450000" />{err('amount_paid')}
        {dueFor(type) && Number(amount.replace(/,/g, '')) > 0 && Number(amount.replace(/,/g, '')) !== dueFor(type) && (
          <p className="mt-1 text-xs text-amber-800">This is different from the {naira(dueFor(type)!)} {renewalId ? 'for your renewal' : 'in your agreement'}. You can still submit. EboHomes will check it.</p>)}
      </div>
      <div>
        <label className={lbl} htmlFor="ps-name">Full name on the account you paid from</label>
        <input id="ps-name" className={field} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />{err('payer_name')}
      </div>
      <div>
        <label className={lbl} htmlFor="ps-bank">Bank you paid from</label>
        <input id="ps-bank" className={field} list="ps-banks" value={bank} onChange={(e) => setBank(e.target.value)} placeholder="Start typing, e.g. GTBank" />
        <datalist id="ps-banks">{NG_BANKS.map((b) => <option key={b} value={b} />)}</datalist>{err('payer_bank')}
      </div>
      <div>
        <label className={lbl} htmlFor="ps-ref">Transaction reference or session ID</label>
        <input id="ps-ref" className={field} autoCapitalize="none" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="From your bank receipt" />{err('transaction_reference')}
      </div>
      <div>
        <label className={lbl} htmlFor="ps-when">Date and time of the transfer</label>
        <input id="ps-when" type="datetime-local" className={field} max={localNow()} value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />{err('paid_at')}
      </div>
      <div>
        <label className={lbl} htmlFor="ps-method">How did you pay?</label>
        <select id="ps-method" className={field} value={method} onChange={(e) => setMethod(e.target.value)}>
          {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>{err('payment_method')}
      </div>
      <div>
        <label className={lbl} htmlFor="ps-file">Bank receipt or transfer screenshot</label>
        <label htmlFor="ps-file" className="flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-secondary/50 px-3 text-sm font-semibold">
          <Upload size={18} aria-hidden /> {file ? file.name : 'Choose a photo or PDF (max 8MB)'}
        </label>
        <input id="ps-file" type="file" accept={EVIDENCE_ACCEPT} className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />{err('file')}
      </div>
      <div>
        <label className={lbl} htmlFor="ps-notes">Notes for EboHomes (optional)</label>
        <textarea id="ps-notes" className={field} rows={3} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} />{err('notes')}
      </div>

      {error && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">{error}</p>}
      <button type="submit" disabled={busy} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-base font-bold text-primary-foreground disabled:opacity-60">
        {busy ? <><Loader2 size={18} className="animate-spin" aria-hidden /> {stage || 'Working...'}</> : 'Send evidence to EboHomes'}
      </button>
    </form>
  )
}