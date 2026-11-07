'use client'

import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, Clock, FileText, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { fmtDate, naira } from '@/lib/case-status'
import {
  OFFER_LIVE,
  OFFER_STATUS_LABEL,
  chargesTotal,
  isOfferExpired,
  offerTimeLeft,
  validateCounter,
  type Charge,
  type OfferStatus,
} from '@/lib/rental-offer'

export type Offer = {
  id: string
  application_id: string
  version: number
  offered_by_role: 'admin' | 'tenant'
  status: OfferStatus
  rent_amount: number
  rent_period: string
  duration_months: number
  start_date: string
  deposit_amount: number
  charges: Charge[]
  fees_amount: number
  payment_schedule: string | null
  notice_days: number | null
  house_rules: string | null
  note: string | null
  response_note: string | null
  expires_at: string
  landlord_confirmed_at: string | null
  responded_at: string | null
  created_at: string
}

export const OFFER_COLUMNS =
  'id, application_id, version, offered_by_role, status, rent_amount, rent_period, duration_months, start_date, deposit_amount, charges, fees_amount, payment_schedule, notice_days, house_rules, note, response_note, expires_at, landlord_confirmed_at, responded_at, created_at'

const btnP =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-50'
const btnS =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-semibold text-foreground disabled:opacity-50'
const field = 'w-full min-h-11 rounded-md border border-border bg-input px-3 py-2 text-sm'

export function OfferTerms({ o }: { o: Offer }) {
  const charges = Array.isArray(o.charges) ? o.charges : []
  const per = o.rent_period === 'yearly' ? 'per year' : 'per month'
  return (
    <div className="space-y-2">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg bg-secondary/60 p-3 sm:grid-cols-3">
        <div>
          <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Rent</dt>
          <dd className="text-sm font-semibold text-foreground">{naira(Number(o.rent_amount))} <span className="text-xs font-normal text-muted-foreground">{per}</span></dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Rental length</dt>
          <dd className="text-sm font-semibold text-foreground">{o.duration_months} month{o.duration_months === 1 ? '' : 's'}</dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Start date</dt>
          <dd className="text-sm font-semibold text-foreground">{fmtDate(o.start_date)}</dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Security deposit</dt>
          <dd className="text-sm font-semibold text-foreground">{naira(Number(o.deposit_amount))}</dd>
        </div>
        {o.notice_days != null && (
          <div>
            <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Notice period</dt>
            <dd className="text-sm font-semibold text-foreground">{o.notice_days} days</dd>
          </div>
        )}
        {o.payment_schedule && (
          <div className="col-span-2 sm:col-span-3">
            <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Payment schedule</dt>
            <dd className="text-sm text-foreground">{o.payment_schedule}</dd>
          </div>
        )}
      </dl>
      {charges.length > 0 && (
        <div className="rounded-lg border border-border p-3 text-sm">
          <p className="font-semibold text-foreground">Other charges</p>
          <ul className="mt-1 space-y-0.5">
            {charges.map((c, i) => (
              <li key={`${c.label}-${i}`} className="flex justify-between gap-3">
                <span className="min-w-0 break-words">{c.label}</span>
                <span className="shrink-0 font-medium">{naira(Number(c.amount))}</span>
              </li>
            ))}
          </ul>
          <p className="mt-1 flex justify-between border-t border-border pt-1 font-semibold">
            <span>Total charges</span>
            <span>{naira(chargesTotal(charges))}</span>
          </p>
        </div>
      )}
      {o.house_rules && (
        <p className="rounded-md bg-secondary p-3 text-sm"><span className="font-semibold">House rules: </span>{o.house_rules}</p>
      )}
      {o.note && (
        <p className="rounded-md bg-secondary p-3 text-sm"><span className="font-semibold">{o.offered_by_role === 'tenant' ? 'Your note: ' : 'Note from EboHomes: '}</span>{o.note}</p>
      )}
    </div>
  )
}

export function RentalOfferPanel({ applicationId, mode }: { applicationId: string; mode: 'tenant' | 'landlord' }) {
  const [offers, setOffers] = useState<Offer[]>([])
  const [loaded, setLoaded] = useState(false)
  const [unavailable, setUnavailable] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [counterOpen, setCounterOpen] = useState(false)
  const [cRent, setCRent] = useState('')
  const [cDep, setCDep] = useState('')
  const [cStart, setCStart] = useState('')
  const [cDur, setCDur] = useState('')
  const [cNote, setCNote] = useState('')

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('rental_offers')
      .select(OFFER_COLUMNS)
      .eq('application_id', applicationId)
      .order('version', { ascending: false })
    if (error) setUnavailable(true)
    else setOffers((data ?? []) as unknown as Offer[])
    setLoaded(true)
  }, [applicationId])

  useEffect(() => {
    void load()
  }, [load])

  const live = offers.find((o) => OFFER_LIVE.includes(o.status)) ?? null
  const last = offers[0] ?? null

  async function call(fn: string, args: Record<string, unknown>, ok: string, confirmText?: string) {
    if (busy) return
    if (confirmText && !window.confirm(confirmText)) return
    setBusy(true)
    setErr(null)
    setMsg(null)
    const { data, error } = await supabase.rpc(fn, args)
    setBusy(false)
    if (error) {
      setErr(error.message)
    } else if (fn === 'eb_respond_rental_offer' && data === null) {
      setErr('This offer has expired. Contact EboHomes if you still want this property.')
    } else {
      setMsg(ok)
      setCounterOpen(false)
      setNote('')
    }
    await load()
  }

  function openCounter(o: Offer) {
    setCRent(String(o.rent_amount))
    setCDep(String(o.deposit_amount))
    setCStart(o.start_date)
    setCDur(String(o.duration_months))
    setCNote('')
    setCounterOpen(true)
    setErr(null)
  }

  async function sendCounter(o: Offer) {
    const v = validateCounter(
      { rent_amount: cRent, deposit_amount: cDep, start_date: cStart, duration_months: cDur },
      { rent_amount: Number(o.rent_amount), deposit_amount: Number(o.deposit_amount), start_date: o.start_date, duration_months: o.duration_months },
      cNote
    )
    if (!v.ok) {
      setErr(Object.values(v.errors)[0])
      return
    }
    await call(
      'eb_respond_rental_offer',
      { p_offer: o.id, p_action: 'counter', p_note: v.note, p_counter: v.value },
      'Your counter-offer was sent to EboHomes. They will review it and come back to you.',
      'Send this counter-offer? It replaces the current offer until EboHomes answers.'
    )
  }

  if (!loaded || unavailable || offers.length === 0) return null

  const banner = (
    <>
      {err && (
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-2 text-xs font-medium text-red-900">{err}</p>
      )}
      {msg && (
        <p role="status" className="flex items-start gap-1.5 rounded-md border border-emerald-300 bg-emerald-50 p-2 text-xs font-medium text-emerald-900">
          <CheckCircle2 size={14} className="mt-0.5 shrink-0" aria-hidden /> {msg}
        </p>
      )}
    </>
  )

  // ---------- Landlord ----------
  if (mode === 'landlord') {
    const toConfirm = offers.find((o) => o.status === 'offered' && o.offered_by_role === 'admin' && !o.landlord_confirmed_at)
    const shown = live ?? last
    return (
      <section className="space-y-2 rounded-lg border border-border p-3 text-sm" aria-label="Rental offer">
        <p className="flex items-center gap-1.5 font-semibold text-foreground"><FileText size={14} aria-hidden /> Rental offer</p>
        {toConfirm && !isOfferExpired(toConfirm.expires_at) ? (
          <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900">
            <p className="font-semibold">EboHomes needs your confirmation</p>
            <p className="text-xs">These terms differ from your listing. The tenant sees them only after you confirm.</p>
            <OfferTerms o={toConfirm} />
            <input
              aria-label="Note for EboHomes (optional)"
              placeholder="Note for EboHomes (optional)"
              value={note}
              maxLength={600}
              onChange={(e) => setNote(e.target.value)}
              className={field}
            />
            <div className="flex flex-wrap gap-2">
              <button
                disabled={busy}
                className={btnP}
                onClick={() => call('eb_landlord_confirm_offer', { p_offer: toConfirm.id, p_confirm: true, p_note: note || null }, 'You confirmed the offer. The tenant can now respond.', 'Confirm these rental terms?')}
              >
                {busy && <Loader2 size={14} className="animate-spin" aria-hidden />} Confirm terms
              </button>
              <button
                disabled={busy}
                className={btnS}
                onClick={() => call('eb_landlord_confirm_offer', { p_offer: toConfirm.id, p_confirm: false, p_note: note || null }, 'You declined the terms. EboHomes will be told.', 'Decline these rental terms?')}
              >
                Decline terms
              </button>
            </div>
          </div>
        ) : shown ? (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Version {shown.version} · {OFFER_STATUS_LABEL[shown.status]}
              {shown.status === 'offered' && shown.landlord_confirmed_at && !isOfferExpired(shown.expires_at) ? ` · waiting for the tenant (${offerTimeLeft(shown.expires_at)})` : ''}
              {shown.status === 'countered' ? ' · the tenant sent a counter-offer, EboHomes is reviewing it' : ''}
              {shown.status === 'accepted' ? ' · the tenant accepted, EboHomes will set up the tenancy' : ''}
            </p>
            <OfferTerms o={shown} />
          </div>
        ) : null}
        {banner}
      </section>
    )
  }

  // ---------- Tenant ----------
  if (!live) {
    return (
      <section className="space-y-1 rounded-lg border border-border p-3 text-sm" aria-label="Rental offer">
        <p className="flex items-center gap-1.5 font-semibold text-foreground"><FileText size={14} aria-hidden /> Rental offer</p>
        <p className="text-xs text-muted-foreground">
          Your last offer ended: {last ? OFFER_STATUS_LABEL[last.status].toLowerCase() : ''}.
          {last?.status === 'withdrawn' && last.response_note ? ` Reason: ${last.response_note}` : ''} Contact EboHomes if you still want this property.
        </p>
        {banner}
      </section>
    )
  }

  const expired = live.status === 'offered' && isOfferExpired(live.expires_at)
  const actionable = live.status === 'offered' && live.offered_by_role === 'admin' && !expired

  return (
    <section className="space-y-3 rounded-xl border-2 border-primary/40 bg-primary/5 p-4 text-sm" aria-label="Rental offer">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-base font-bold text-foreground"><FileText size={16} aria-hidden /> Your rental offer</p>
        <span className="rounded-full border border-border bg-card px-2.5 py-1 text-xs font-semibold">
          {expired ? 'Offer expired' : OFFER_STATUS_LABEL[live.status]}
        </span>
      </div>

      <OfferTerms o={live} />

      {actionable && (
        <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-900">
          <Clock size={13} aria-hidden /> {offerTimeLeft(live.expires_at)}. Answer before then.
        </p>
      )}
      {expired && <p className="text-xs text-muted-foreground">This offer expired. Contact EboHomes if you still want this property.</p>}
      {live.status === 'countered' && (
        <p className="text-xs text-muted-foreground">You sent a counter-offer. EboHomes is reviewing it and will come back to you.</p>
      )}
      {live.status === 'accepted' && (
        <p className="text-xs text-muted-foreground">You accepted this offer. EboHomes will now set up your tenancy and agreement. Nothing has been charged.</p>
      )}

      {actionable && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Accepting records your acceptance only. It is not a payment. EboHomes then sets up your tenancy and the rental agreement.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              disabled={busy}
              className={btnP}
              onClick={() => call('eb_respond_rental_offer', { p_offer: live.id, p_action: 'accept', p_note: null, p_counter: null }, 'You accepted the offer. EboHomes will set up your tenancy next. Nothing was charged.', 'Accept this rental offer?')}
            >
              {busy && <Loader2 size={14} className="animate-spin" aria-hidden />} Accept offer
            </button>
            <button disabled={busy} className={btnS} onClick={() => openCounter(live)}>Send a counter-offer</button>
            <button
              disabled={busy}
              className={btnS}
              onClick={() => call('eb_respond_rental_offer', { p_offer: live.id, p_action: 'decline', p_note: null, p_counter: null }, 'You declined the offer.', 'Decline this rental offer?')}
            >
              Decline
            </button>
          </div>

          {counterOpen && (
            <div className="space-y-2 rounded-lg border border-border bg-card p-3">
              <p className="text-xs font-semibold text-foreground">Your counter-offer</p>
              <label className="block text-xs font-semibold">Rent ({live.rent_period === 'yearly' ? 'per year' : 'per month'})
                <input inputMode="decimal" value={cRent} onChange={(e) => setCRent(e.target.value)} className={`${field} mt-1`} />
              </label>
              <label className="block text-xs font-semibold">Security deposit
                <input inputMode="decimal" value={cDep} onChange={(e) => setCDep(e.target.value)} className={`${field} mt-1`} />
              </label>
              <label className="block text-xs font-semibold">Start date
                <input type="date" value={cStart} onChange={(e) => setCStart(e.target.value)} className={`${field} mt-1`} />
              </label>
              <label className="block text-xs font-semibold">Rental length (months)
                <input inputMode="numeric" value={cDur} onChange={(e) => setCDur(e.target.value)} className={`${field} mt-1`} />
              </label>
              <label className="block text-xs font-semibold">Why are you asking for this?
                <textarea rows={2} maxLength={600} value={cNote} onChange={(e) => setCNote(e.target.value)} className={`${field} mt-1`} />
              </label>
              <div className="flex flex-wrap gap-2">
                <button disabled={busy} className={btnP} onClick={() => void sendCounter(live)}>Send counter-offer</button>
                <button disabled={busy} className={btnS} onClick={() => setCounterOpen(false)}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}
      {banner}
    </section>
  )
}
