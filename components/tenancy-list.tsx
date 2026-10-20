'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Loader2, Receipt, ArrowRight, CalendarDays, User, Home, CheckCircle2 } from 'lucide-react'
import { getPaymentState, paymentLabel } from '@/lib/payment-status'
import { supabase } from '@/lib/supabase'
import { tenancyPath, naira, fmtDate } from '@/lib/case-status'

type Props = { role: 'tenant' | 'landlord' }

function daysLeft(end: string | null): number | null {
  if (!end) return null
  const ms = new Date(end).getTime() - Date.now()
  return Math.ceil(ms / 86400000)
}

const RENEWAL_LABELS: Record<string, string> = {
  offered: 'Awaiting tenant response',
  accepted: 'Accepted by tenant',
  declined: 'Declined by tenant',
}

const STATUS_TONE: Record<string, string> = {
  active: 'border-emerald-300 bg-emerald-50 text-emerald-900',
  pending: 'border-amber-300 bg-amber-50 text-amber-900',
  ended: 'border-slate-300 bg-slate-100 text-slate-800',
  terminated: 'border-red-300 bg-red-50 text-red-900',
}

const PAY_TONE: Record<string, string> = {
  verified: 'border-emerald-300 bg-emerald-50 text-emerald-900',
  legacy_confirmed: 'border-amber-300 bg-amber-50 text-amber-900',
  awaiting_verification: 'border-amber-300 bg-amber-50 text-amber-900',
  pending: 'border-slate-300 bg-slate-100 text-slate-800',
  rejected: 'border-red-300 bg-red-50 text-red-900',
  other: 'border-slate-300 bg-slate-100 text-slate-800',
}

const field = 'w-full bg-input border border-border rounded-lg px-3 py-2.5 text-sm'

export function TenancyList({ role }: Props) {
  const router = useRouter()
  const [rows, setRows] = useState<any[]>([])
  const [payments, setPayments] = useState<Record<string, any[]>>({})
  const [signed, setSigned] = useState<Record<string, any>>({})
  const [renewals, setRenewals] = useState<Record<string, any[]>>({})
  const [loading, setLoading] = useState(true)
  const [offerFor, setOfferFor] = useState<string | null>(null)
  const [newRent, setNewRent] = useState('')
  const [newEnd, setNewEnd] = useState('')
  const [terms, setTerms] = useState('')
  const [msg, setMsg] = useState('')
  const [msgKind, setMsgKind] = useState<'error' | 'success'>('error')
  const [busy, setBusy] = useState(false)

  const flash = (text: string, kind: 'error' | 'success' = 'error') => {
    setMsg(text)
    setMsgKind(kind)
  }

  const load = async (silent = false) => {
    if (!silent) setLoading(true)

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      router.push('/login')
      return
    }

    const { data, error: rpcError } = await supabase.rpc('my_tenancies', {
      p_as: role,
    })

    if (rpcError) {
      flash('Could not load your tenancies. Please refresh and try again.')
      setLoading(false)
      return
    }

    const list = data ?? []
    setRows(list)

    if (list.length > 0) {
      const ids = list.map((t: any) => t.id)

      const { data: pay } = await supabase
        .from('payments')
        .select(
          'id, tenancy_id, amount, type, status, receipt_code, created_at, confirmed_at, verified_by, review_note'
        )
        .in('tenancy_id', ids)
        .order('created_at', { ascending: false })

      const pm: Record<string, any[]> = {}
      pay?.forEach((p: any) => {
        if (!pm[p.tenancy_id]) pm[p.tenancy_id] = []
        pm[p.tenancy_id].push(p)
      })
      setPayments(pm)

      const { data: rt } = await supabase
        .from('rental_terms')
        .select('tenancy_id, rent_amount, deposit_amount, fees_amount')
        .in('tenancy_id', ids)
        .eq('status', 'signed')

      setSigned(Object.fromEntries((rt ?? []).map((x: any) => [x.tenancy_id, x])))

      const { data: ren } = await supabase
        .from('renewals')
        .select(
          'id, tenancy_id, landlord_id, tenant_id, new_rent, new_end_date, terms, status, created_at, responded_at'
        )
        .in('tenancy_id', ids)
        .order('created_at', { ascending: false })

      const rm: Record<string, any[]> = {}
      ren?.forEach((r: any) => {
        if (!rm[r.tenancy_id]) rm[r.tenancy_id] = []
        rm[r.tenancy_id].push(r)
      })
      setRenewals(rm)
    } else {
      setPayments({})
      setSigned({})
      setRenewals({})
    }

    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const respond = async (id: string, status: 'accepted' | 'declined') => {
    if (role !== 'tenant' || busy) return

    const verb = status === 'accepted' ? 'accept' : 'decline'

    if (!window.confirm(`Are you sure you want to ${verb} this renewal offer? No payment is taken.`)) {
      return
    }

    setBusy(true)
    setMsg('')

    const { data, error } = await supabase
      .from('renewals')
      .update({ status })
      .eq('id', id)
      .eq('status', 'offered')
      .select('id')

    if (error) {
      flash(error.message)
    } else if (!data || data.length === 0) {
      flash('This offer could not be updated. It may already have been answered.')
    } else {
      flash(
        status === 'accepted'
          ? 'You accepted the renewal offer. This records your response only. No payment has been charged.'
          : 'You declined the renewal offer.',
        'success'
      )
    }

    setBusy(false)
    await load(true)
  }

  const offer = async (t: any) => {
    if (role !== 'landlord' || busy) return

    setMsg('')

    const rentNumber = Number(newRent)

    if (!newRent || !Number.isFinite(rentNumber) || rentNumber <= 0) {
      flash('Enter a valid new rent amount.')
      return
    }

    if (!newEnd) {
      flash('Enter the new end date.')
      return
    }

    if (t.end_date && new Date(newEnd) <= new Date(t.end_date)) {
      flash('The new end date must be after the current end date.')
      return
    }

    if (new Date(newEnd) <= new Date()) {
      flash('The new end date must be in the future.')
      return
    }

    setBusy(true)

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      setBusy(false)
      router.push('/login')
      return
    }

    // Use the real parties from the tenancy record, never the logged-in user for both.
    const { data: tenancy, error: tenancyError } = await supabase
      .from('tenancies')
      .select('id, landlord_id, tenant_id, status')
      .eq('id', t.id)
      .maybeSingle()

    if (tenancyError || !tenancy) {
      flash('Could not load this tenancy. Please refresh and try again.')
      setBusy(false)
      return
    }

    if (tenancy.landlord_id !== user.id) {
      flash('Only the landlord on this tenancy can send a renewal offer.')
      setBusy(false)
      return
    }

    if (!tenancy.tenant_id || tenancy.tenant_id === user.id) {
      flash('This tenancy has no valid tenant, so a renewal offer cannot be sent.')
      setBusy(false)
      return
    }

    if (tenancy.status !== 'active') {
      flash('Renewal offers can only be sent for active tenancies.')
      setBusy(false)
      return
    }

    const { error } = await supabase.from('renewals').insert({
      tenancy_id: tenancy.id,
      landlord_id: tenancy.landlord_id,
      tenant_id: tenancy.tenant_id,
      new_rent: rentNumber,
      new_end_date: newEnd,
      terms: terms.trim() ? terms.trim() : null,
      status: 'offered',
    })

    if (error) {
      flash(error.message)
      setBusy(false)
      return
    }

    setOfferFor(null)
    setNewRent('')
    setNewEnd('')
    setTerms('')

    flash('Renewal offer sent. The tenant has not accepted it yet, and no payment is charged.', 'success')

    setBusy(false)
    await load(true)
  }

  // What the person should do next, worked out only from records we actually loaded.
  const nextStep = (t: any, openOffer: any): string => {
    const pays = payments[t.id] ?? []
    if (role === 'tenant') {
      if (openOffer) return 'You have a renewal offer. Accept or decline it below.'
      if (!signed[t.id]) return 'Open your tenancy to review the rental terms.'
      if (pays.length === 0) return 'Open your tenancy to see the amounts and how to pay.'
      if (pays.some((p) => getPaymentState(p) === 'awaiting_verification'))
        return 'EboHomes is checking a payment. Nothing for you to do yet.'
      return 'Open your tenancy for receipts and records.'
    }
    if (openOffer) return 'Renewal offer sent. Waiting for the tenant.'
    if (!signed[t.id]) return 'Open the tenancy to propose or finish the rental terms.'
    return 'Open the tenancy for payments, handover and repairs.'
  }

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-8" aria-busy="true" aria-label="Loading tenancies">
        {[0, 1].map((i) => (
          <div key={i} className="animate-pulse space-y-3 rounded-xl border border-border bg-card p-4">
            <div className="h-5 w-1/2 rounded bg-secondary" />
            <div className="h-3 w-1/3 rounded bg-secondary" />
            <div className="h-20 rounded-lg bg-secondary" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold text-foreground">
        {role === 'tenant' ? 'My Tenancies' : 'Tenancies'}
      </h1>

      <p className="mb-6 text-sm text-muted-foreground">
        Rent, dates, receipts and renewals. Nothing is charged automatically.
      </p>

      {msg && (
        <p
          role={msgKind === 'error' ? 'alert' : 'status'}
          className={`mb-4 rounded-md p-3 text-sm font-medium ${
            msgKind === 'error'
              ? 'border border-red-300 bg-red-50 text-red-900'
              : 'border border-emerald-300 bg-emerald-50 text-emerald-900'
          }`}
        >
          {msg}
        </p>
      )}

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-14 text-center">
          <Home size={30} className="mx-auto mb-3 text-muted-foreground" aria-hidden />
          <p className="text-sm font-semibold text-foreground">No tenancies yet</p>
          <p className="mx-auto mt-1 max-w-xs text-sm text-muted-foreground">
            {role === 'tenant'
              ? 'A tenancy appears here after your application is approved and the landlord sets it up.'
              : 'A tenancy appears here after you set one up from an approved application.'}
          </p>
          {role === 'tenant' && (
            <Link href="/applications" className="mt-4 inline-flex min-h-11 items-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground">
              See my applications
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-5">
          {rows.map((t) => {
            const d = daysLeft(t.end_date)
            const offers = renewals[t.id] ?? []
            const open = offers.find((o) => o.status === 'offered')
            const last = offers[0]
            const agreed = signed[t.id]
            const pays = payments[t.id] ?? []

            return (
              <section key={t.id} className="overflow-hidden rounded-xl border border-border bg-card">
                <div className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="truncate text-base font-bold text-foreground">{t.title ?? 'Property'}</h2>
                      {t.location_text && <p className="truncate text-sm text-muted-foreground">{t.location_text}</p>}
                      {t.tenancy_code && <p className="mt-0.5 text-xs font-semibold text-muted-foreground">Ref {t.tenancy_code}</p>}
                    </div>
                    <span
                      className={`shrink-0 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${
                        STATUS_TONE[t.status] ?? 'border-slate-300 bg-slate-100 text-slate-800'
                      }`}
                    >
                      {t.status}
                    </span>
                  </div>

                  <dl className="grid grid-cols-2 gap-3 rounded-lg bg-secondary/60 p-3 text-sm">
                    <div>
                      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{agreed ? 'Agreed rent' : 'Rent'}</dt>
                      <dd className="font-bold text-foreground">
                        {naira(agreed?.rent_amount ?? t.rent_amount)}
                        <span className="text-xs font-normal text-muted-foreground"> / {t.rent_period}</span>
                      </dd>
                    </div>
                    <div>
                      <dt className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                        <User size={11} aria-hidden /> {role === 'tenant' ? 'Landlord' : 'Tenant'}
                      </dt>
                      <dd className="truncate font-medium text-foreground">{t.other_party ?? '—'}</dd>
                    </div>
                    <div>
                      <dt className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                        <CalendarDays size={11} aria-hidden /> Starts
                      </dt>
                      <dd className="font-medium text-foreground">{fmtDate(t.start_date)}</dd>
                    </div>
                    <div>
                      <dt className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                        <CalendarDays size={11} aria-hidden /> Ends
                      </dt>
                      <dd className="font-medium text-foreground">{fmtDate(t.end_date)}</dd>
                    </div>
                  </dl>

                  {agreed && (
                    <p className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                      <CheckCircle2 size={16} className="mt-0.5 shrink-0" aria-hidden />
                      <span>
                        Signed agreement: rent {naira(agreed.rent_amount)}
                        {Number(agreed.deposit_amount) > 0 && <> · deposit {naira(agreed.deposit_amount)}</>}
                        {Number(agreed.fees_amount) > 0 && <> · fees {naira(agreed.fees_amount)}</>}. Payments are based on these figures.
                      </span>
                    </p>
                  )}

                  <p className="flex items-start gap-1.5 text-sm font-semibold text-foreground">
                    <ArrowRight size={15} className="mt-0.5 shrink-0" aria-hidden />
                    <span>Next: <span className="font-normal">{nextStep(t, open)}</span></span>
                  </p>

                  <Link
                    href={tenancyPath(role, t.id)}
                    className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"
                  >
                    Open tenancy
                    <ArrowRight size={15} aria-hidden />
                  </Link>
                  <p className="text-center text-xs text-muted-foreground">
                    Agreement, how to pay, handover, repairs, disputes and deposit are inside.
                  </p>
                </div>

                {t.status === 'active' && d !== null && d <= 30 && d >= 0 && (
                  <p className="border-t border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    {d <= 14 ? 'Renewal reminder: ' : 'Your tenancy is approaching renewal: '}
                    <b>{d} day(s) left.</b>
                  </p>
                )}

                {open && role === 'tenant' && (
                  <div className="space-y-2 border-t border-border bg-amber-50/60 p-4 text-sm">
                    <p className="text-xs font-semibold text-amber-900">Your action</p>
                    <p className="font-bold text-foreground">Renewal offer</p>
                    <p>
                      New rent <b>{naira(open.new_rent)}</b>, until <b>{fmtDate(open.new_end_date)}</b>
                    </p>
                    {open.terms && <p className="text-muted-foreground">{open.terms}</p>}
                    <p className="text-xs text-muted-foreground">Responding records your decision only. No payment is taken.</p>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <button
                        disabled={busy}
                        onClick={() => respond(open.id, 'accepted')}
                        className="min-h-11 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                      >
                        Accept offer
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => respond(open.id, 'declined')}
                        className="min-h-11 rounded-md border border-border px-4 text-sm font-semibold disabled:opacity-50"
                      >
                        Decline offer
                      </button>
                    </div>
                  </div>
                )}

                {open && role === 'landlord' && (
                  <p className="border-t border-border px-4 py-3 text-sm text-muted-foreground">
                    Renewal offer sent ({naira(open.new_rent)} until {fmtDate(open.new_end_date)}). Waiting for the tenant.
                  </p>
                )}

                {!open && last && (
                  <p className="border-t border-border px-4 py-3 text-sm text-muted-foreground">
                    Last renewal offer: {RENEWAL_LABELS[last.status] ?? last.status}
                  </p>
                )}

                {role === 'landlord' &&
                  t.status === 'active' &&
                  !open &&
                  (offerFor === t.id ? (
                    <div className="space-y-3 border-t border-border p-4">
                      <p className="text-sm font-bold text-foreground">Offer a renewal</p>
                      <label className="block text-xs font-semibold text-foreground">
                        New rent (₦)
                        <input type="number" min={1} inputMode="numeric" value={newRent} onChange={(e) => setNewRent(e.target.value)} className={`${field} mt-1`} />
                      </label>
                      <label className="block text-xs font-semibold text-foreground">
                        New end date
                        <input type="date" value={newEnd} onChange={(e) => setNewEnd(e.target.value)} className={`${field} mt-1`} />
                      </label>
                      <label className="block text-xs font-semibold text-foreground">
                        Terms (optional)
                        <textarea value={terms} onChange={(e) => setTerms(e.target.value)} rows={2} className={`${field} mt-1`} />
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <button
                          disabled={busy}
                          onClick={() => offer(t)}
                          className="min-h-11 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                        >
                          {busy ? 'Sending…' : 'Send offer'}
                        </button>
                        <button onClick={() => setOfferFor(null)} className="min-h-11 rounded-md border border-border px-4 text-sm font-semibold">
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="border-t border-border px-4 py-2">
                      <button
                        onClick={() => {
                          setMsg('')
                          setOfferFor(t.id)
                        }}
                        className="min-h-11 text-sm font-semibold text-primary"
                      >
                        Offer renewal
                      </button>
                    </div>
                  ))}

                <div className="space-y-2 border-t border-border p-4">
                  <h3 className="text-sm font-bold text-foreground">Payment records</h3>

                  {pays.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      {role === 'tenant'
                        ? 'No payments recorded yet. Open your tenancy to see how to pay.'
                        : 'No payments recorded yet.'}
                    </p>
                  ) : (
                    <>
                      <ul className="space-y-2">
                        {pays.map((p) => (
                          <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3 text-sm">
                            <div className="min-w-0">
                              <p className="font-bold text-foreground">
                                {naira(p.amount)} <span className="text-xs font-normal capitalize text-muted-foreground">{p.type}</span>
                              </p>
                              <span
                                className={`mt-1 inline-block rounded-full border px-2 py-0.5 text-xs font-semibold ${PAY_TONE[getPaymentState(p)]}`}
                              >
                                {paymentLabel(p)}
                              </span>
                            </div>
                            {p.receipt_code && (
                              <Link
                                href={`/receipt/${p.receipt_code}`}
                                className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-primary"
                              >
                                <Receipt size={14} aria-hidden /> {p.receipt_code}
                              </Link>
                            )}
                          </li>
                        ))}
                      </ul>
                      <p className="text-xs text-muted-foreground">
                        A payment record is not proof of cleared funds. Only a payment marked &ldquo;Verified by EboHomes&rdquo; has been checked by EboHomes.
                      </p>
                    </>
                  )}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}