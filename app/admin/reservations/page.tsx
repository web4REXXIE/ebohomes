'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { fmtDate, naira } from '@/lib/case-status'
import { PENDING_LABEL, isReservationOverdue, reservationTimeLeft, validateExtendHours, validateReason } from '@/lib/tenancy-reservation'
import { useConfirm } from '@/components/confirm-dialog'

type Offer = {
  id: string
  application_id: string
  listing_id: string
  tenant_id: string
  landlord_id: string
  rent_amount: number
  rent_period: string
  duration_months: number
  start_date: string
  deposit_amount: number
}
type Ten = {
  id: string
  application_id: string
  listing_id: string
  tenant_id: string
  status: string
  reserved_until: string | null
  cancel_requested_at: string | null
  cancel_request_reason: string | null
  reservation_extensions: number
}

const btn = 'inline-flex min-h-11 items-center gap-1.5 rounded-md px-4 text-sm font-semibold disabled:opacity-60'
const field = 'w-full min-h-11 rounded-md border border-border bg-input px-3 py-2 text-sm font-normal'

export default function AdminReservationsPage() {
  const { confirm, dialog } = useConfirm()
  const [ready, setReady] = useState<Offer[]>([])
  const [pending, setPending] = useState<Ten[]>([])
  const [titles, setTitles] = useState<Record<string, string>>({})
  const [names, setNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [reason, setReason] = useState<Record<string, string>>({})
  const [hours, setHours] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    const { data: offerRows, error: oe } = await supabase
      .from('rental_offers')
      .select('id, application_id, listing_id, tenant_id, landlord_id, rent_amount, rent_period, duration_months, start_date, deposit_amount')
      .eq('status', 'accepted')
    if (oe) {
      setError('Offers are not available yet. Run the 20261206_05 migration first. ' + oe.message)
      setLoading(false)
      return
    }
    const { data: tenRows, error: te } = await supabase
      .from('tenancies')
      .select('id, application_id, listing_id, tenant_id, status, reserved_until, cancel_requested_at, cancel_request_reason, reservation_extensions')
      .not('offer_id', 'is', null)
      .in('status', ['pending', 'awaiting_payment'])
      .order('reserved_until', { ascending: true })
    if (te) {
      setError('Run the 20261207_01 migration first. ' + te.message)
      setLoading(false)
      return
    }
    const tens = (tenRows ?? []) as Ten[]
    const haveTenancy = new Set(tens.map((t) => t.application_id))
    // An accepted offer whose tenancy is not pending any more (for example already active) is not "ready".
    const { data: anyTen } = await supabase
      .from('tenancies')
      .select('application_id')
      .in('application_id', ((offerRows ?? []) as Offer[]).map((o) => o.application_id))
    const hasAny = new Set((anyTen ?? []).map((t: any) => t.application_id))
    const offers = ((offerRows ?? []) as Offer[]).filter((o) => !haveTenancy.has(o.application_id) && !hasAny.has(o.application_id))
    setReady(offers)
    setPending(tens)

    const listingIds = Array.from(new Set([...offers.map((o) => o.listing_id), ...tens.map((t) => t.listing_id)]))
    if (listingIds.length) {
      const { data: ls } = await supabase.from('listings').select('id, title').in('id', listingIds)
      setTitles(Object.fromEntries((ls ?? []).map((l: any) => [l.id, l.title || 'Property'])))
    }
    const people = Array.from(new Set([...offers.map((o) => o.tenant_id), ...tens.map((t) => t.tenant_id)]))
    if (people.length) {
      const { data: ps } = await supabase.from('profiles').select('id, full_name').in('id', people)
      setNames(Object.fromEntries((ps ?? []).map((p: any) => [p.id, p.full_name || 'Unnamed'])))
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function run(key: string, fn: string, args: Record<string, unknown>, ok: string, confirmText: string) {
    if (busy) return
    if (!(await confirm({ message: confirmText, destructive: /^(cancel|reject|close|decline|withdraw)/i.test(confirmText) }))) return
    setBusy(key)
    setError(null)
    setNotice(null)
    const { error: e } = await supabase.rpc(fn, args)
    setBusy(null)
    if (e) {
      setError(e.message)
      return
    }
    setNotice(ok)
    await load()
  }

  const create = (o: Offer) =>
    run(o.id, 'eb_create_tenancy_from_offer', { p_offer: o.id }, 'Pending tenancy created. The property is reserved for 48 hours.',
      'Create the pending tenancy and reserve this property for 48 hours?')

  function extend(t: Ten) {
    const h = validateExtendHours(hours[t.id] ?? '24')
    const r = validateReason(reason[t.id])
    if (!h.ok) return setError(h.error)
    if (!r.ok) return setError(r.error)
    void run(t.id, 'eb_extend_reservation', { p_tenancy: t.id, p_hours: h.value, p_reason: r.value }, 'Reservation extended.', `Extend by ${h.value} hours?`)
  }

  function cancel(t: Ten) {
    const r = validateReason(reason[t.id])
    if (!r.ok) return setError(r.error)
    void run(t.id, 'eb_cancel_pending_tenancy', { p_tenancy: t.id, p_reason: r.value }, 'Tenancy cancelled. The property is open again.',
      'Cancel this pending tenancy? The property opens to other tenants.')
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="animate-spin text-primary" size={28} aria-label="Loading reservations" />
      </div>
    )
  }

  const requests = pending.filter((t) => t.cancel_requested_at)

  return (
    <div className="mx-auto w-full max-w-4xl p-4 md:p-6">
      <h1 className="mb-1 text-2xl font-bold text-foreground">Reservations</h1>
      <p className="mb-4 text-sm text-muted-foreground">
        Accepted offers become pending tenancies here. A pending tenancy reserves the property for 48 hours. Active tenancies are never cancelled from this page.
      </p>

      {error && <p role="alert" className="mb-3 rounded-md border border-red-300 bg-red-50 p-3 text-sm font-medium text-red-900">{error}</p>}
      {notice && <p role="status" className="mb-3 rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm font-medium text-emerald-900">{notice}</p>}
      {requests.length > 0 && (
        <p className="mb-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm font-medium text-amber-900">
          {requests.length} cancellation request{requests.length === 1 ? '' : 's'} waiting for your decision.
        </p>
      )}

      <h2 className="mb-2 text-sm font-semibold text-foreground">Accepted offers ready for a tenancy ({ready.length})</h2>
      {ready.length === 0 ? (
        <p className="mb-6 text-sm text-muted-foreground">Nothing waiting.</p>
      ) : (
        <div className="mb-6 space-y-3">
          {ready.map((o) => (
            <section key={o.id} className="space-y-2 rounded-xl border border-border bg-card p-4 text-sm">
              <p className="font-semibold text-foreground">{titles[o.listing_id] ?? 'Property'}</p>
              <p className="text-muted-foreground">
                {names[o.tenant_id] ?? 'Tenant'} · {naira(Number(o.rent_amount))} {o.rent_period === 'yearly' ? 'per year' : 'per month'} · deposit {naira(Number(o.deposit_amount))} · {o.duration_months} months from {fmtDate(o.start_date)}
              </p>
              <button disabled={busy !== null} onClick={() => void create(o)} className={`${btn} bg-primary text-primary-foreground`}>
                {busy === o.id && <Loader2 size={14} className="animate-spin" aria-hidden />} Create pending tenancy
              </button>
            </section>
          ))}
        </div>
      )}

      <h2 className="mb-2 text-sm font-semibold text-foreground">Pending tenancies ({pending.length})</h2>
      {pending.length === 0 ? (
        <p className="text-sm text-muted-foreground">No pending tenancies.</p>
      ) : (
        <div className="space-y-3">
          {pending.map((t) => {
            const overdue = isReservationOverdue(t.reserved_until)
            return (
              <section key={t.id} className="space-y-3 rounded-xl border border-border bg-card p-4 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-foreground">{titles[t.listing_id] ?? 'Property'}</p>
                  <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${overdue ? 'border-red-300 bg-red-50 text-red-900' : 'border-border'}`}>
                    {reservationTimeLeft(t.reserved_until)}
                  </span>
                </div>
                <p className="text-muted-foreground">
                  {names[t.tenant_id] ?? 'Tenant'} · {PENDING_LABEL[t.status] ?? t.status} · extended {t.reservation_extensions} time{t.reservation_extensions === 1 ? '' : 's'}
                </p>
                {t.cancel_requested_at && (
                  <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
                    <b>Cancellation requested</b> {fmtDate(t.cancel_requested_at)}: {t.cancel_request_reason}
                  </p>
                )}
                <textarea
                  rows={2}
                  maxLength={600}
                  value={reason[t.id] ?? ''}
                  onChange={(e) => setReason((r) => ({ ...r, [t.id]: e.target.value }))}
                  placeholder="Reason (recorded, at least 10 characters)"
                  className={field}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    aria-label="Hours to extend"
                    inputMode="numeric"
                    value={hours[t.id] ?? '24'}
                    onChange={(e) => setHours((h) => ({ ...h, [t.id]: e.target.value }))}
                    className="min-h-11 w-20 rounded-md border border-border bg-input px-3 text-sm"
                  />
                  <button disabled={busy !== null} onClick={() => extend(t)} className={`${btn} border border-border`}>Extend hours</button>
                  <button disabled={busy !== null} onClick={() => cancel(t)} className={`${btn} border border-red-300 text-red-800`}>Cancel tenancy</button>
                </div>
              </section>
            )
          })}
        </div>
      )}
      {dialog}
    </div>
  )
}
