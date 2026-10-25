'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Loader2, MapPin, ShieldCheck, Copy, Check } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { BANK_TRANSFER, amountLines, transferReference } from '@/lib/payment-instructions'
import { classifyTenancyLoad, TENANCY_LOAD_ERROR_TEXT, TENANCY_NOT_FOUND_TEXT } from '@/lib/tenancy-access'
import { PaymentSubmissionForm, SubmissionList, type Sub } from '@/components/payment-submission-form'
import { fmtDate } from '@/lib/case-status'
import { canPay, summarisePayments, CHARGE_LABEL } from '@/lib/payment-complete'

const naira = (n: number) => '₦' + Number(n).toLocaleString('en-NG', { maximumFractionDigits: 2 })

export default function PaySubmissionPage() {
  const params = useParams()
  const router = useRouter()
  const tenancyId = String(params?.id ?? '')
  const [state, setState] = useState<'loading' | 'error' | 'missing' | 'ok'>('loading')
  const [t, setT] = useState<any>(null)
  const [terms, setTerms] = useState<any>(null)
  const [photo, setPhoto] = useState<string | null>(null)
  const [subs, setSubs] = useState<Sub[]>([])
  const [payRows, setPayRows] = useState<any[]>([])
  const [replaces, setReplaces] = useState<Sub | null>(null)
  const [copied, setCopied] = useState(false)
  const [renewal, setRenewal] = useState<{ id: string; new_rent: number; new_end_date: string } | null>(null)
  const [renewalProblem, setRenewalProblem] = useState<string | null>(null)

  const loadSubs = useCallback(async () => {
    const { data } = await supabase.from('payment_submissions')
      .select('id, payment_type, amount_paid, expected_amount, status, review_note, created_at, paid_at, transaction_reference')
      .eq('tenancy_id', tenancyId).order('created_at', { ascending: false })
    setSubs((data ?? []) as Sub[])
  }, [tenancyId])

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const mine = await supabase.rpc('my_tenancies', { p_as: 'tenant' })
      const found = classifyTenancyLoad(mine as any, tenancyId)
      if (found.kind === 'error') { setState('error'); return }
      if (found.kind === 'not_found') { setState('missing'); return }
      setT(found.row)
      const { data: tr } = await supabase.from('rental_terms').select('id, rent_amount, deposit_amount, fees_amount')
        .eq('tenancy_id', tenancyId).eq('status', 'signed').order('version', { ascending: false }).limit(1)
      setTerms(tr?.[0] ?? null)
      const { data: l } = await supabase.from('listings').select('photos').eq('id', found.row.listing_id).maybeSingle()
      const p = Array.isArray(l?.photos) ? l!.photos.find((x: unknown) => typeof x === 'string') : null
      setPhoto(typeof p === 'string' ? p : null)
      // Paying for a renewal: /tenancies/<id>/pay?renewal=<renewal id>
      const rid = new URLSearchParams(window.location.search).get('renewal')
      if (rid) {
        const { data: ren } = await supabase.from('renewals').select('id, status, new_rent, new_end_date, tenancy_id').eq('id', rid).maybeSingle()
        if (ren && ren.tenancy_id === tenancyId && ren.status === 'accepted') setRenewal({ id: ren.id, new_rent: Number(ren.new_rent), new_end_date: ren.new_end_date })
        else setRenewalProblem('This renewal is not waiting for payment. Open your tenancy page to see where it is.')
      }
      const pr = await supabase.from('payments').select('id, amount, type, status, verified_by, created_at').eq('tenancy_id', tenancyId)
      setPayRows(pr.error ? [] : (pr.data ?? []))
      await loadSubs()
      setState('ok')
    })()
  }, [tenancyId, router, loadSubs])

  if (state === 'loading') return <p className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 size={16} className="animate-spin" aria-hidden /> Loading...</p>
  if (state !== 'ok') return (
    <div className="mx-auto max-w-xl space-y-3 p-4">
      <p role="alert" className="rounded-lg border border-border bg-card p-4 text-sm">{state === 'error' ? TENANCY_LOAD_ERROR_TEXT : TENANCY_NOT_FOUND_TEXT}</p>
      <Link href="/tenancies" className="text-sm font-semibold text-primary">Back to my tenancies</Link>
    </div>
  )

  // Deposit and fees are paid once. When one is verified or waiting for EboHomes, it is not offered again.
  // Rent repeats every period, so it stays.
  const summary = summarisePayments(payRows, {
    agreed: { rent: terms?.rent_amount, deposit: terms?.deposit_amount, fees: terms?.fees_amount },
    proofs: subs.map((s) => ({ payment_type: s.payment_type, amount_paid: s.amount_paid, status: s.status })),
  })
  const allLines = renewal
    ? [{ key: 'rent' as const, label: `Renewal rent until ${fmtDate(renewal.new_end_date)}`, amount: renewal.new_rent }]
    : amountLines(terms, t.rent_period)
  const lines = renewal ? allLines : allLines.filter((l) => canPay(l.key, summary))
  const alreadyDone = renewal ? [] : allLines.filter((l) => !canPay(l.key, summary))
  const due = lines.map((l) => ({ type: l.key === 'fees' ? 'fees' as const : l.key, amount: l.amount }))
  const ref = transferReference(t.tenancy_code)
  const hasOpen = subs.some((s) => s.status === 'submitted' || s.status === 'under_review')

  return (
    <div className="mx-auto max-w-xl space-y-4 p-4 pb-24">
      <Link href={`/tenancies/${tenancyId}`} className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-primary"><ArrowLeft size={16} aria-hidden /> Back to my tenancy</Link>
      <h1 className="text-xl font-bold text-foreground">Confirm you have paid</h1>

      <section className="overflow-hidden rounded-xl border border-border bg-card">
        {photo && <img src={photo} alt="" loading="lazy" className="h-40 w-full object-cover" />}
        <div className="space-y-1 p-4 text-sm">
          <p className="text-base font-bold text-foreground">{t.title ?? 'Your property'}</p>
          {t.location_text && <p className="flex items-center gap-1 text-muted-foreground"><MapPin size={14} aria-hidden /> {t.location_text}</p>}
          <p className="text-muted-foreground">Tenancy {t.tenancy_code ?? ''}{t.start_date ? ` · ${t.start_date}` : ''}{t.end_date ? ` to ${t.end_date}` : ''}</p>
        </div>
      </section>

      <section className="space-y-2 rounded-xl border border-border bg-card p-4 text-sm">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><ShieldCheck size={14} aria-hidden /> {renewal ? 'Amount due for your renewal' : 'Amounts in your signed agreement'}</p>
        {lines.length === 0 ? <p className="text-muted-foreground">{allLines.length === 0 ? 'Your signed agreement is not recorded yet, so payment is not open.' : 'Everything that is paid once is already paid or being checked by EboHomes.'}</p> : (
          <ul className="divide-y divide-border">{lines.map((l) => (
            <li key={l.key} className="flex items-center justify-between py-1.5"><span>{l.label}</span><b className="text-base">{naira(l.amount)}</b></li>))}</ul>)}
        {alreadyDone.length > 0 && (
          <ul className="space-y-1 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-xs text-emerald-900" aria-label="Already paid">
            {alreadyDone.map((l) => <li key={l.key}><b>{l.label}</b> {naira(l.amount)}: {CHARGE_LABEL[summary.charges[l.key].state as 'verified' | 'awaiting']}. You do not need to pay it again.</li>)}
          </ul>
        )}
        <div className="mt-2 space-y-1 rounded-lg bg-secondary p-3">
          <p className="text-xs text-muted-foreground">You should have transferred to</p>
          <p><b>{BANK_TRANSFER.bankName}</b> · {BANK_TRANSFER.accountName} · <b className="tracking-wider">{BANK_TRANSFER.accountNumber}</b></p>
          {ref && (
            <p className="flex items-center gap-2">Reference: <b>{ref}</b>
              <button type="button" aria-label="Copy tenancy reference" className="inline-flex min-h-9 items-center gap-1 rounded-md border border-border px-2 text-xs font-semibold"
                onClick={async () => { try { await navigator.clipboard.writeText(ref); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch {} }}>
                {copied ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />} {copied ? 'Copied' : 'Copy'}</button></p>)}
        </div>
      </section>

      {renewalProblem && <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">{renewalProblem}</p>}
      {renewal && <p role="status" className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">You are paying for your <b>renewal</b>. The renewal is only applied after EboHomes verifies this payment and you confirm it with your code.</p>}

      {lines.length > 0 && !renewalProblem && (
        hasOpen && !replaces
          ? <p role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">You already sent evidence that EboHomes has not decided on yet. See below. You do not need to send it again.</p>
          : <PaymentSubmissionForm key={replaces?.id ?? 'new'} tenancyId={tenancyId} due={due} replaces={replaces} renewalId={renewal?.id ?? null}
              onDone={() => { setReplaces(null); loadSubs() }} />
      )}

      <section className="space-y-2">
        <h2 className="text-base font-bold text-foreground">Your submissions</h2>
        <SubmissionList items={subs} onCorrect={(s) => { setReplaces(s); window.scrollTo({ top: 0, behavior: 'smooth' }) }} />
      </section>
    </div>
  )
}