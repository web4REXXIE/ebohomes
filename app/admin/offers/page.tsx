'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { fmtDate, naira } from '@/lib/case-status'
import { OFFER_COLUMNS, OfferTerms, type Offer } from '@/components/rental-offer-panel'
import {
  OFFER_DEFAULT_HOURS,
  OFFER_LIVE,
  OFFER_STATUS_LABEL,
  addDaysIso,
  isOfferExpired,
  offerMatchesListing,
  offerTimeLeft,
  todayIso,
  validateOfferInput,
} from '@/lib/rental-offer'

type App = {
  id: string
  case_ref: string | null
  listing_id: string
  tenant_id: string
  landlord_id: string
  tenant_interest_at: string | null
  application_data: any
}
type Listing = { id: string; title: string | null; price_monthly: number | null; service_charge: number | null; caution_deposit: number | null }
type ChargeRow = { label: string; amount: string }
type Form = {
  rent_amount: string
  rent_period: string
  duration_months: string
  start_date: string
  deposit_amount: string
  charges: ChargeRow[]
  payment_schedule: string
  notice_days: string
  house_rules: string
  note: string
  hours: string
}

const TABS = [
  ['ready', 'Ready for offer'],
  ['waiting_landlord', 'Waiting for landlord'],
  ['waiting_tenant', 'Waiting for tenant'],
  ['counter', 'Counter-offers'],
  ['accepted', 'Accepted'],
] as const
type Tab = (typeof TABS)[number][0]

const btnBase = 'inline-flex min-h-11 items-center gap-1.5 rounded-md px-4 text-sm font-semibold disabled:opacity-60'
const field = 'w-full min-h-11 rounded-md border border-border bg-input px-3 py-2 text-sm font-normal'

function bucket(live: Offer | null): Tab {
  if (!live) return 'ready'
  if (live.status === 'accepted') return 'accepted'
  if (live.status === 'countered') return 'counter'
  if (isOfferExpired(live.expires_at)) return 'ready'
  return live.landlord_confirmed_at ? 'waiting_tenant' : 'waiting_landlord'
}

function seedForm(o: Offer | null, l: Listing | undefined, app: App): Form {
  if (o) {
    return {
      rent_amount: String(o.rent_amount),
      rent_period: o.rent_period,
      duration_months: String(o.duration_months),
      start_date: o.start_date,
      deposit_amount: String(o.deposit_amount),
      charges: (Array.isArray(o.charges) ? o.charges : []).map((c) => ({ label: c.label, amount: String(c.amount) })),
      payment_schedule: o.payment_schedule ?? '',
      notice_days: o.notice_days == null ? '' : String(o.notice_days),
      house_rules: o.house_rules ?? '',
      note: '',
      hours: String(OFFER_DEFAULT_HOURS),
    }
  }
  const move = typeof app.application_data?.move_in_date === 'string' ? app.application_data.move_in_date : ''
  const validMove = /^\d{4}-\d{2}-\d{2}$/.test(move) && move >= todayIso() && move <= addDaysIso(todayIso(), 180)
  return {
    rent_amount: l?.price_monthly != null ? String(l.price_monthly) : '',
    rent_period: 'monthly',
    duration_months: '12',
    start_date: validMove ? move : addDaysIso(todayIso(), 14),
    deposit_amount: l?.caution_deposit != null ? String(l.caution_deposit) : '0',
    charges: l?.service_charge ? [{ label: 'Service charge', amount: String(l.service_charge) }] : [],
    payment_schedule: '',
    notice_days: '',
    house_rules: '',
    note: '',
    hours: String(OFFER_DEFAULT_HOURS),
  }
}

export default function AdminOffersPage() {
  const [apps, setApps] = useState<App[]>([])
  const [offers, setOffers] = useState<Offer[]>([])
  const [listings, setListings] = useState<Record<string, Listing>>({})
  const [names, setNames] = useState<Record<string, string>>({})
  const [waitingInterest, setWaitingInterest] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('ready')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [formFor, setFormFor] = useState<string | null>(null)
  const [form, setForm] = useState<Form | null>(null)
  const [reason, setReason] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    const { data: appRows, error: ae } = await supabase
      .from('applications')
      .select('id, case_ref, listing_id, tenant_id, landlord_id, tenant_interest_at, application_data')
      .eq('status', 'approved')
      .order('created_at', { ascending: true })
      .limit(300)
    if (ae) {
      setError(ae.message)
      setLoading(false)
      return
    }
    const approved = (appRows ?? []) as App[]
    setWaitingInterest(approved.filter((a) => !a.tenant_interest_at).length)

    const { data: offerRows, error: oe } = await supabase
      .from('rental_offers')
      .select(OFFER_COLUMNS)
      .order('version', { ascending: false })
      .limit(1000)
    if (oe) {
      setError('Offers are not available yet. Run the 20261206_05 migration first. ' + oe.message)
      setLoading(false)
      return
    }
    const all = (offerRows ?? []) as unknown as Offer[]
    setOffers(all)

    // Applications that still have an open or accepted offer stay on this page even if their status changed.
    const liveIds = new Set(all.filter((o) => OFFER_LIVE.includes(o.status)).map((o) => o.application_id))
    const have = new Set(approved.map((a) => a.id))
    const extraIds = Array.from(liveIds).filter((id) => !have.has(id))
    let extra: App[] = []
    if (extraIds.length) {
      const { data: more } = await supabase
        .from('applications')
        .select('id, case_ref, listing_id, tenant_id, landlord_id, tenant_interest_at, application_data')
        .in('id', extraIds)
      extra = (more ?? []) as App[]
    }
    const list = [...approved.filter((a) => a.tenant_interest_at || liveIds.has(a.id)), ...extra]
    setApps(list)

    const listingIds = Array.from(new Set(list.map((a) => a.listing_id)))
    if (listingIds.length) {
      const { data: ls } = await supabase
        .from('listings')
        .select('id, title, price_monthly, service_charge, caution_deposit')
        .in('id', listingIds)
      setListings(Object.fromEntries(((ls ?? []) as Listing[]).map((l) => [l.id, l])))
    }
    const peopleIds = Array.from(new Set(list.flatMap((a) => [a.tenant_id, a.landlord_id])))
    if (peopleIds.length) {
      const { data: people } = await supabase.from('profiles').select('id, full_name').in('id', peopleIds)
      setNames(Object.fromEntries((people ?? []).map((p: any) => [p.id, p.full_name || 'Unnamed'])))
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const byApp = useMemo(() => {
    const m: Record<string, Offer[]> = {}
    for (const o of offers) (m[o.application_id] ??= []).push(o)
    return m
  }, [offers])

  const liveOf = (appId: string) => (byApp[appId] ?? []).find((o) => OFFER_LIVE.includes(o.status)) ?? null
  const visible = apps.filter((a) => bucket(liveOf(a.id)) === tab)
  const count = (t: Tab) => apps.filter((a) => bucket(liveOf(a.id)) === t).length

  function openForm(app: App, seed: Offer | null) {
    setFormFor(app.id)
    setForm(seedForm(seed, listings[app.listing_id], app))
    setError(null)
    setNotice(null)
  }

  async function issue(app: App) {
    if (!form || busyId) return
    const v = validateOfferInput({ ...form })
    if (!v.ok) {
      setNotice(null)
      setError(Object.values(v.errors)[0])
      return
    }
    if (!window.confirm('Send this offer? It replaces any open offer for this application.')) return
    setBusyId(app.id)
    setError(null)
    setNotice(null)
    const x = v.value
    const { error: e } = await supabase.rpc('eb_issue_rental_offer', {
      p_application: app.id,
      p_rent: x.rent_amount,
      p_period: x.rent_period,
      p_duration_months: x.duration_months,
      p_start: x.start_date,
      p_deposit: x.deposit_amount,
      p_charges: x.charges,
      p_schedule: x.payment_schedule,
      p_notice_days: x.notice_days,
      p_rules: x.house_rules,
      p_note: x.note,
      p_hours: x.hours,
    })
    setBusyId(null)
    if (e) {
      setError(e.message)
      return
    }
    setNotice('Offer sent.')
    setFormFor(null)
    setForm(null)
    await load()
  }

  async function withdraw(app: App, o: Offer) {
    if (busyId) return
    const text = (reason[o.id] ?? '').trim()
    if (text.length < 10) {
      setError('Write a clear reason for withdrawing (at least 10 characters).')
      return
    }
    if (!window.confirm('Withdraw this offer?')) return
    setBusyId(app.id)
    setError(null)
    setNotice(null)
    const { error: e } = await supabase.rpc('eb_withdraw_rental_offer', { p_offer: o.id, p_reason: text })
    setBusyId(null)
    if (e) {
      setError(e.message)
      return
    }
    setNotice('Offer withdrawn.')
    setReason((r) => ({ ...r, [o.id]: '' }))
    await load()
  }

  const setF = (patch: Partial<Form>) => setForm((f) => (f ? { ...f, ...patch } : f))

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="animate-spin text-primary" size={28} aria-label="Loading offers" />
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-4xl p-4 md:p-6">
      <h1 className="mb-1 text-2xl font-bold text-foreground">Rental offers</h1>
      <p className="mb-2 text-sm text-muted-foreground">
        EboHomes issues every offer. An offer records terms only. It does not reserve the property, create a tenancy or take any payment. Terms that differ from the listing need the landlord’s confirmation before the tenant sees them.
      </p>
      {waitingInterest > 0 && (
        <p className="mb-3 text-xs text-muted-foreground">
          {waitingInterest} approved application{waitingInterest === 1 ? ' is' : 's are'} waiting for the tenant to confirm they want to proceed. They appear here once the tenant does.
        </p>
      )}

      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-border" role="tablist" aria-label="Offer status">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`-mb-px min-h-11 whitespace-nowrap border-b-2 px-3 text-sm ${
              tab === key ? 'border-primary font-semibold text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {label} ({count(key)})
          </button>
        ))}
      </div>

      {error && <p role="alert" className="mb-3 rounded-md border border-red-300 bg-red-50 p-3 text-sm font-medium text-red-900">{error}</p>}
      {notice && <p role="status" className="mb-3 rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm font-medium text-emerald-900">{notice}</p>}

      {visible.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">Nothing in this list.</p>
      ) : (
        <div className="space-y-4">
          {visible.map((a) => {
            const l = listings[a.listing_id]
            const live = liveOf(a.id)
            const history = (byApp[a.id] ?? []).filter((o) => !live || o.id !== live.id)
            const original = live?.status === 'countered' ? (byApp[a.id] ?? []).find((o) => o.version === live.version - 1) ?? null : null
            const lastEnded = !live ? (byApp[a.id] ?? [])[0] ?? null : null
            const editing = formFor === a.id && form
            const parsed = editing ? validateOfferInput({ ...form! }) : null
            const matches =
              parsed && parsed.ok && l
                ? offerMatchesListing(
                    { rent_period: parsed.value.rent_period, rent_amount: parsed.value.rent_amount, deposit_amount: parsed.value.deposit_amount, charges: parsed.value.charges },
                    l
                  )
                : null
            return (
              <section key={a.id} className="space-y-3 rounded-xl border border-border bg-card p-4 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-foreground">{l?.title ?? 'Property'}</p>
                  <span className="text-xs text-muted-foreground">{a.case_ref ?? ''}</span>
                </div>
                <dl className="grid grid-cols-2 gap-3 rounded-lg bg-secondary/60 p-3 sm:grid-cols-4">
                  <div className="min-w-0"><dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Tenant</dt><dd className="truncate font-medium">{names[a.tenant_id] ?? '—'}</dd></div>
                  <div className="min-w-0"><dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Landlord</dt><dd className="truncate font-medium">{names[a.landlord_id] ?? '—'}</dd></div>
                  <div><dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Listed rent</dt><dd className="font-medium">{l?.price_monthly != null ? `${naira(l.price_monthly)} / month` : '—'}</dd></div>
                  <div><dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Tenant ready</dt><dd className="font-medium">{a.tenant_interest_at ? fmtDate(a.tenant_interest_at) : 'Not yet'}</dd></div>
                </dl>

                {live && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-foreground">
                      Version {live.version} · {OFFER_STATUS_LABEL[live.status]}
                      {live.status === 'offered' ? ` · ${live.landlord_confirmed_at ? 'confirmed by landlord' : 'waiting for the landlord'} · ${offerTimeLeft(live.expires_at)}` : ''}
                      {live.status === 'countered' ? ` · from the tenant, ${offerTimeLeft(live.expires_at)}` : ''}
                    </p>
                    <OfferTerms o={live} />
                  </div>
                )}
                {lastEnded && (
                  <p className="text-xs text-muted-foreground">
                    Last offer (version {lastEnded.version}): {OFFER_STATUS_LABEL[lastEnded.status].toLowerCase()}.
                    {lastEnded.response_note ? ` ${lastEnded.response_note}` : ''}
                  </p>
                )}

                {live?.status === 'accepted' && (
                  <p className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-xs text-emerald-900">
                    The tenant accepted. Next step (Phase 11.8): create the pending tenancy from this offer. Until then the existing tenancy setup stays as it is.
                  </p>
                )}

                {live && live.status !== 'accepted' && (
                  <div className="space-y-2 border-t border-border pt-3">
                    <textarea
                      rows={2}
                      maxLength={600}
                      value={reason[live.id] ?? ''}
                      onChange={(e) => setReason((r) => ({ ...r, [live.id]: e.target.value }))}
                      placeholder="Reason for withdrawing (recorded, at least 10 characters)"
                      className="w-full rounded-md border border-border bg-input px-3 py-2.5 text-sm"
                    />
                    <button onClick={() => void withdraw(a, live)} disabled={busyId !== null} className={`${btnBase} border border-red-300 text-red-800`}>
                      Withdraw offer
                    </button>
                  </div>
                )}

                {(!live || live.status !== 'accepted') && !editing && (
                  <div className="flex flex-wrap gap-2">
                    {live?.status === 'countered' ? (
                      <>
                        <button onClick={() => openForm(a, live)} className={`${btnBase} bg-primary text-primary-foreground`}>
                          Issue new offer from the counter
                        </button>
                        {original && (
                          <button onClick={() => openForm(a, original)} className={`${btnBase} border border-border`}>
                            Re-issue the original terms
                          </button>
                        )}
                      </>
                    ) : (
                      <button onClick={() => openForm(a, live ?? lastEnded)} className={`${btnBase} bg-primary text-primary-foreground`}>
                        {live ? 'Replace with a new version' : 'Make an offer'}
                      </button>
                    )}
                  </div>
                )}

                {editing && form && (
                  <div className="space-y-3 rounded-lg border border-border p-3">
                    <p className="text-xs font-semibold text-foreground">New offer</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block text-xs font-semibold">Rent
                        <input inputMode="decimal" value={form.rent_amount} onChange={(e) => setF({ rent_amount: e.target.value })} className={`${field} mt-1`} />
                      </label>
                      <label className="block text-xs font-semibold">Rent is
                        <select value={form.rent_period} onChange={(e) => setF({ rent_period: e.target.value })} className={`${field} mt-1`}>
                          <option value="monthly">Per month</option>
                          <option value="yearly">Per year</option>
                        </select>
                      </label>
                      <label className="block text-xs font-semibold">Rental length (months)
                        <input inputMode="numeric" value={form.duration_months} onChange={(e) => setF({ duration_months: e.target.value })} className={`${field} mt-1`} />
                      </label>
                      <label className="block text-xs font-semibold">Start date
                        <input type="date" value={form.start_date} onChange={(e) => setF({ start_date: e.target.value })} className={`${field} mt-1`} />
                      </label>
                      <label className="block text-xs font-semibold">Security deposit
                        <input inputMode="decimal" value={form.deposit_amount} onChange={(e) => setF({ deposit_amount: e.target.value })} className={`${field} mt-1`} />
                      </label>
                      <label className="block text-xs font-semibold">Notice period (days, optional)
                        <input inputMode="numeric" value={form.notice_days} onChange={(e) => setF({ notice_days: e.target.value })} className={`${field} mt-1`} />
                      </label>
                    </div>

                    <div className="space-y-2">
                      <p className="text-xs font-semibold">Other charges (optional)</p>
                      {form.charges.map((c, i) => (
                        <div key={i} className="flex gap-2">
                          <input
                            aria-label="Charge name"
                            placeholder="Name"
                            value={c.label}
                            onChange={(e) => setF({ charges: form.charges.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })}
                            className={field}
                          />
                          <input
                            aria-label="Charge amount"
                            placeholder="Amount"
                            inputMode="decimal"
                            value={c.amount}
                            onChange={(e) => setF({ charges: form.charges.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)) })}
                            className={field}
                          />
                          <button
                            type="button"
                            aria-label="Remove charge"
                            onClick={() => setF({ charges: form.charges.filter((_, j) => j !== i) })}
                            className="min-h-11 rounded-md border border-border px-3 text-xs"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                      {form.charges.length < 8 && (
                        <button type="button" onClick={() => setF({ charges: [...form.charges, { label: '', amount: '' }] })} className="min-h-11 text-xs font-semibold text-primary underline">
                          Add a charge
                        </button>
                      )}
                    </div>

                    <label className="block text-xs font-semibold">Payment schedule (optional)
                      <input value={form.payment_schedule} maxLength={300} onChange={(e) => setF({ payment_schedule: e.target.value })} className={`${field} mt-1`} />
                    </label>
                    <label className="block text-xs font-semibold">House rules (optional)
                      <textarea rows={2} maxLength={2000} value={form.house_rules} onChange={(e) => setF({ house_rules: e.target.value })} className={`${field} mt-1`} />
                    </label>
                    <label className="block text-xs font-semibold">Note to the tenant (optional)
                      <textarea rows={2} maxLength={600} value={form.note} onChange={(e) => setF({ note: e.target.value })} className={`${field} mt-1`} />
                    </label>
                    <label className="block text-xs font-semibold">Offer stays open (hours, 24 to 336)
                      <input inputMode="numeric" value={form.hours} onChange={(e) => setF({ hours: e.target.value })} className={`${field} mt-1`} />
                    </label>

                    {matches !== null && (
                      <p className={`rounded-md border p-2 text-xs ${matches ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : 'border-amber-300 bg-amber-50 text-amber-900'}`}>
                        {matches
                          ? 'These terms are within the listing. The tenant will see the offer straight away.'
                          : 'These terms differ from the listing. The landlord must confirm before the tenant sees the offer.'}
                      </p>
                    )}

                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => void issue(a)} disabled={busyId !== null} className={`${btnBase} bg-primary text-primary-foreground`}>
                        {busyId === a.id && <Loader2 size={14} className="animate-spin" aria-hidden />} Send offer
                      </button>
                      <button onClick={() => { setFormFor(null); setForm(null) }} className={`${btnBase} border border-border`}>Cancel</button>
                    </div>
                  </div>
                )}

                {history.length > 0 && (
                  <details className="text-xs">
                    <summary className="min-h-11 cursor-pointer py-3 font-semibold text-primary">Earlier versions ({history.length})</summary>
                    <ul className="space-y-1.5 pb-2">
                      {history.map((o) => (
                        <li key={o.id} className="rounded-md bg-secondary/60 px-3 py-2">
                          <span className="font-semibold">Version {o.version} · {o.offered_by_role === 'tenant' ? 'tenant counter' : 'EboHomes offer'} · {OFFER_STATUS_LABEL[o.status]}</span>
                          <span className="block text-muted-foreground">
                            {naira(Number(o.rent_amount))} {o.rent_period === 'yearly' ? 'per year' : 'per month'} · deposit {naira(Number(o.deposit_amount))} · {o.duration_months} months from {fmtDate(o.start_date)}
                          </span>
                          {o.response_note && <span className="block break-words">{o.response_note}</span>}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
        }
