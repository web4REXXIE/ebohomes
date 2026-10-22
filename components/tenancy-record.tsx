'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, CheckCircle2, Circle, Loader2, MapPin, XCircle, Clock } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { fmtDate, fmtDateTime, tenancyPath } from '@/lib/case-status'
import {
  buildTimeline, isRecord, money, paymentLabel, summaryChips, typeName,
  type Tone, type TenancyRecord,
} from '@/lib/tenancy-record'

const toneBox: Record<Tone, string> = {
  done: 'border-emerald-300 bg-emerald-50 text-emerald-900',
  warn: 'border-amber-300 bg-amber-50 text-amber-900',
  bad: 'border-red-300 bg-red-50 text-red-900',
  neutral: 'border-border bg-secondary text-foreground',
}
const card = 'space-y-3 rounded-xl border border-border bg-card p-4 text-sm'
const h2 = 'text-base font-bold text-foreground'
const linkBtn = 'inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-semibold hover:bg-secondary'

function ToneIcon({ tone }: { tone: Tone }) {
  if (tone === 'done') return <CheckCircle2 size={18} className="shrink-0 text-emerald-700" aria-hidden />
  if (tone === 'bad') return <XCircle size={18} className="shrink-0 text-red-700" aria-hidden />
  if (tone === 'warn') return <Clock size={18} className="shrink-0 text-amber-700" aria-hidden />
  return <Circle size={18} className="shrink-0 text-muted-foreground" aria-hidden />
}

// One page that shows everything about a tenancy: agreement, payments, handover, payouts, renewals and a combined history.
// Read only. Every action stays on the page that already owns it, and this page links there.
export function TenancyRecordView({ role, tenancyId }: { role: 'tenant' | 'landlord'; tenancyId: string }) {
  const router = useRouter()
  const [rec, setRec] = useState<TenancyRecord | null>(null)
  const [state, setState] = useState<'loading' | 'error' | 'missing' | 'ok'>('loading')
  const [showAll, setShowAll] = useState(false)

  const load = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push('/login'); return }
    const { data, error } = await supabase.rpc('eb_tenancy_record', { p_tenancy: tenancyId })
    if (error) { setState('error'); return }
    if (!isRecord(data)) { setState('missing'); return }
    setRec(data)
    setState('ok')
  }, [tenancyId, router])
  useEffect(() => { load() }, [load])

  const back = tenancyPath(role, tenancyId)

  if (state === 'loading') {
    return <p className="flex items-center gap-2 p-6 text-sm text-muted-foreground" role="status"><Loader2 size={16} className="animate-spin" aria-hidden /> Loading the tenancy record...</p>
  }
  if (state !== 'ok' || !rec) {
    return (
      <div className="mx-auto max-w-3xl space-y-3 p-4">
        <p role="alert" className="rounded-lg border border-border bg-card p-4 text-sm">
          {state === 'error' ? 'Could not load this record. Check your connection and try again.' : 'We could not find this tenancy on your account.'}
        </p>
        {state === 'error' && <button type="button" onClick={() => { setState('loading'); load() }} className="min-h-12 w-full rounded-xl bg-primary font-bold text-primary-foreground">Try again</button>}
        <Link href={role === 'tenant' ? '/tenancies' : '/dashboard/tenancies'} className="inline-flex min-h-11 items-center text-sm font-semibold text-primary">Back to my tenancies</Link>
      </div>
    )
  }

  const chips = summaryChips(rec)
  const timeline = buildTimeline(rec)
  const visible = showAll ? timeline : timeline.slice(0, 8)
  const t = rec.tenancy
  const handoverHref = `/tenancies/${tenancyId}/handover`

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 pb-24">
      <Link href={back} className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-primary"><ArrowLeft size={16} aria-hidden /> Back to the tenancy</Link>

      <section className={card} aria-labelledby="rec-title">
        <div>
          <h1 id="rec-title" className="text-xl font-bold text-foreground">{rec.property.title ?? 'Your property'}</h1>
          {rec.property.location && <p className="flex items-center gap-1 text-muted-foreground"><MapPin size={14} aria-hidden /> {rec.property.location}</p>}
        </div>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
          <div><dt className="text-xs text-muted-foreground">Tenancy</dt><dd className="font-semibold">{t.code ?? 'n/a'}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Status</dt><dd className="font-semibold capitalize">{t.status ?? 'n/a'}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Starts</dt><dd>{fmtDate(t.start_date)}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Ends</dt><dd>{fmtDate(t.end_date)}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Rent</dt><dd>{money(t.rent_amount)}{t.rent_period ? ` per ${t.rent_period.replace(/ly$/, '').replace('annual', 'year')}` : ''}</dd></div>
          {rec.landlord_name && <div><dt className="text-xs text-muted-foreground">Landlord</dt><dd>{rec.landlord_name}</dd></div>}
          {rec.tenant_name && <div><dt className="text-xs text-muted-foreground">Tenant</dt><dd>{rec.tenant_name}</dd></div>}
        </dl>
      </section>

      <section className={card} aria-labelledby="rec-status">
        <h2 id="rec-status" className={h2}>Where things stand</h2>
        <ul className="space-y-2">
          {chips.map((c) => (
            <li key={c.key} className={`flex items-start gap-2 rounded-lg border p-3 ${toneBox[c.tone]}`}>
              <ToneIcon tone={c.tone} />
              <span><span className="block text-xs">{c.label}</span><span className="font-semibold">{c.value}</span></span>
            </li>))}
        </ul>
        {rec.hold_reason && rec.payout_state === 'on_hold' && <p className="text-xs text-muted-foreground">Payout on hold: {rec.hold_reason}.</p>}
      </section>

      <section className={card} aria-labelledby="rec-history">
        <h2 id="rec-history" className={h2}>History</h2>
        {timeline.length === 0 ? <p className="text-muted-foreground">Nothing has happened on this tenancy yet.</p> : (
          <ol className="space-y-3">
            {visible.map((e) => (
              <li key={e.key} className="flex items-start gap-2">
                <ToneIcon tone={e.tone} />
                <span><span className="block font-semibold text-foreground">{e.title}</span><span className="text-xs text-muted-foreground">{fmtDateTime(e.at)}</span></span>
              </li>))}
          </ol>)}
        {timeline.length > 8 && (
          <button type="button" onClick={() => setShowAll(!showAll)} aria-expanded={showAll} className="min-h-11 w-full rounded-lg border border-border font-semibold">
            {showAll ? 'Show fewer' : `Show all ${timeline.length} events`}
          </button>)}
      </section>

      <section className={card} aria-labelledby="rec-agreement">
        <h2 id="rec-agreement" className={h2}>Agreement</h2>
        {rec.terms ? (
          <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
            <div><dt className="text-xs text-muted-foreground">Rent</dt><dd>{money(rec.terms.rent_amount)}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Deposit</dt><dd>{money(rec.terms.deposit_amount)}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Fees</dt><dd>{money(rec.terms.fees_amount)}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Notice period</dt><dd>{rec.terms.notice_days != null ? `${rec.terms.notice_days} days` : 'n/a'}</dd></div>
            {rec.terms.payment_schedule && <div className="col-span-2"><dt className="text-xs text-muted-foreground">Payment schedule</dt><dd>{rec.terms.payment_schedule}</dd></div>}
            {rec.terms.house_rules && <div className="col-span-2"><dt className="text-xs text-muted-foreground">House rules</dt><dd className="whitespace-pre-line">{rec.terms.house_rules}</dd></div>}
            <div className="col-span-2"><dt className="text-xs text-muted-foreground">Signed and recorded</dt><dd>{fmtDateTime(rec.terms.signed_at)}{rec.terms.signed_reference ? ` · Ref ${rec.terms.signed_reference}` : ''}</dd></div>
          </dl>
        ) : <p className="text-muted-foreground">The agreement has not been signed and recorded yet.</p>}
        <Link href={back} className={linkBtn}>Open the tenancy page <ArrowRight size={14} aria-hidden /></Link>
      </section>

      <section className={card} aria-labelledby="rec-payments">
        <h2 id="rec-payments" className={h2}>Payments</h2>
        {rec.payments.length === 0 ? (
          <p className="text-muted-foreground">{role === 'tenant' ? 'You have not sent any payment proof yet.' : 'EboHomes has not verified a payment for this tenancy yet.'}</p>
        ) : (
          <ul className="space-y-2">
            {rec.payments.map((p) => (
              <li key={p.id} className="space-y-2 rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <b>{money(p.amount)} <span className="text-xs font-normal text-muted-foreground">{typeName(p.type)}</span></b>
                  <span className="rounded-full border border-border bg-secondary px-2.5 py-1 text-xs font-semibold">{paymentLabel(p)}</span>
                </div>
                <p className="text-xs text-muted-foreground">Sent {fmtDateTime(p.submitted_at)}</p>
                <div className="flex flex-wrap gap-2">
                  {p.receipt_code && <Link href={`/receipt/${p.receipt_code}`} className={linkBtn}>View receipt</Link>}
                  {role === 'tenant' && p.status === 'verified' && !p.confirmed_at && <Link href={`/payment-confirmation/${p.id}`} className={linkBtn}>Confirm with my code</Link>}
                  {role === 'tenant' && (p.status === 'needs_info' || p.status === 'rejected') && <Link href={`/tenancies/${tenancyId}/pay`} className={linkBtn}>Correct my payment proof</Link>}
                </div>
              </li>))}
          </ul>)}
        {role === 'tenant' && <Link href={`/tenancies/${tenancyId}/pay`} className={linkBtn}>Payment page <ArrowRight size={14} aria-hidden /></Link>}
      </section>

      <section className={card} aria-labelledby="rec-handover">
        <h2 id="rec-handover" className={h2}>Key handover</h2>
        <p className="text-muted-foreground">{chips.find((c) => c.key === 'handover')?.value}</p>
        {rec.handover?.tenant_confirmed_at && <p className="text-xs">Tenant confirmed {fmtDateTime(rec.handover.tenant_confirmed_at)}</p>}
        {rec.handover?.landlord_confirmed_at && <p className="text-xs">Landlord confirmed {fmtDateTime(rec.handover.landlord_confirmed_at)}</p>}
        {(rec.payments.some((p) => p.status === 'verified') || rec.handover) && <Link href={handoverHref} className={linkBtn}>Open the handover page <ArrowRight size={14} aria-hidden /></Link>}
      </section>

      <section className={card} aria-labelledby="rec-payout">
        <h2 id="rec-payout" className={h2}>{role === 'tenant' ? 'Landlord payout' : 'Payouts'}</h2>
        <p className="text-muted-foreground">{chips.find((c) => c.key === 'payout')?.value}</p>
        {role === 'landlord' && (rec.payouts.length === 0
          ? <p className="text-xs text-muted-foreground">No payout has been prepared yet.</p>
          : <ul className="space-y-2">{rec.payouts.map((q) => (
              <li key={q.id} className="rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2"><b>{money(q.amount)}</b><span className="text-xs font-semibold capitalize">{q.status}</span></div>
                <p className="text-xs text-muted-foreground">{q.payout_code ? `${q.payout_code} · ` : ''}{q.paid_at ? `Paid ${fmtDateTime(q.paid_at)}` : `Prepared ${fmtDateTime(q.created_at)}`}</p>
              </li>))}</ul>)}
        {role === 'landlord' && <Link href="/dashboard/payouts" className={linkBtn}>My payouts <ArrowRight size={14} aria-hidden /></Link>}
      </section>

      <section className={card} aria-labelledby="rec-renewals">
        <h2 id="rec-renewals" className={h2}>Renewals</h2>
        {rec.renewals.length === 0 ? <p className="text-muted-foreground">There are no renewal offers on this tenancy.</p> : (
          <ul className="space-y-2">
            {rec.renewals.map((n) => (
              <li key={n.id} className="rounded-lg border border-border p-3">
                <b>{money(n.new_rent)}</b> until {fmtDate(n.new_end_date)}
                <p className="text-xs text-muted-foreground"><span className="capitalize">{n.applied ? 'Applied' : n.status}</span> · offered {fmtDate(n.created_at)}</p>
              </li>))}
          </ul>)}
        {rec.renewals.length > 0 && <Link href={back} className={linkBtn}>Open the tenancy page <ArrowRight size={14} aria-hidden /></Link>}
      </section>
    </div>
  )
}