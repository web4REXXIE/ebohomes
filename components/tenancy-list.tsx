'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Loader2, Receipt } from 'lucide-react'
import { paymentLabel } from '@/lib/payment-status'
import { supabase } from '@/lib/supabase'
import { tenancyPath } from '@/lib/case-status'

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

      setSigned(
        Object.fromEntries((rt ?? []).map((x: any) => [x.tenancy_id, x]))
      )

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

  const respond = async (
    id: string,
    status: 'accepted' | 'declined'
  ) => {
    if (role !== 'tenant' || busy) return

    const verb = status === 'accepted' ? 'accept' : 'decline'

    if (
      !window.confirm(
        `Are you sure you want to ${verb} this renewal offer? No payment is taken.`
      )
    ) {
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
      flash(
        'This offer could not be updated. It may already have been answered.'
      )
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
      flash(
        'This tenancy has no valid tenant, so a renewal offer cannot be sent.'
      )
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

    flash(
      'Renewal offer sent. The tenant has not accepted it yet, and no payment is charged.',
      'success'
    )

    setBusy(false)
    await load(true)
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="animate-spin text-primary" size={26} />
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto w-full px-4 py-8">
      <h1 className="text-xl font-bold text-foreground mb-1">
        {role === 'tenant' ? 'My Tenancies' : 'Tenancies'}
      </h1>

      <p className="text-sm text-muted-foreground mb-6">
        Rent, dates, receipts and renewals. Nothing is charged automatically.
      </p>

      {msg && (
        <p
          className={`text-sm rounded-md p-3 mb-4 ${
            msgKind === 'error'
              ? 'text-destructive bg-destructive/10'
              : 'text-primary bg-primary/10'
          }`}
        >
          {msg}
        </p>
      )}

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No tenancies yet.</p>
      ) : (
        <div className="space-y-4">
          {rows.map((t) => {
            const d = daysLeft(t.end_date)
            const offers = renewals[t.id] ?? []
            const open = offers.find((o) => o.status === 'offered')
            const last = offers[0]

            return (
              <div
                key={t.id}
                className="bg-card border border-border rounded-lg p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-foreground">
                      {t.title ?? 'Property'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t.location_text ?? ''}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {t.tenancy_code ?? ''}
                    </p>
                  </div>

                  <span className="text-xs border border-border rounded-full px-2 py-1 capitalize">
                    {t.status}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-sm mt-3">
                  <p>
                    <span className="text-muted-foreground block text-xs">
                      {signed[t.id] ? 'Agreed rent' : 'Rent'}
                    </span>
                    ₦
                    {Number(
                      signed[t.id]?.rent_amount ?? t.rent_amount
                    ).toLocaleString()}{' '}
                    / {t.rent_period}
                  </p>

                  <p>
                    <span className="text-muted-foreground block text-xs">
                      {role === 'tenant' ? 'Landlord' : 'Tenant'}
                    </span>
                    {t.other_party ?? '—'}
                  </p>

                  <p>
                    <span className="text-muted-foreground block text-xs">
                      Starts
                    </span>
                    {t.start_date ?? '—'}
                  </p>

                  <p>
                    <span className="text-muted-foreground block text-xs">
                      Ends
                    </span>
                    {t.end_date ?? '—'}
                  </p>
                </div>

                {signed[t.id] && (
                  <p className="mt-3 text-sm rounded-md bg-secondary px-3 py-2">
                    Agreed in the signed agreement: rent ₦
                    {Number(signed[t.id].rent_amount).toLocaleString()}
                    {Number(signed[t.id].deposit_amount) > 0 && (
                      <>
                        {' '}
                        · deposit ₦
                        {Number(
                          signed[t.id].deposit_amount
                        ).toLocaleString()}
                      </>
                    )}
                    {Number(signed[t.id].fees_amount) > 0 && (
                      <>
                        {' '}
                        · fees ₦
                        {Number(signed[t.id].fees_amount).toLocaleString()}
                      </>
                    )}
                    . Payments are based on these figures.
                  </p>
                )}

                <Link
                  href={tenancyPath(role, t.id)}
                  className="mt-3 inline-flex min-h-10 items-center rounded-md border border-border px-3 text-sm font-semibold text-primary"
                >
                  {role === 'tenant'
                    ? 'Open tenancy: agreement and how to pay'
                    : 'Open tenancy'}
                </Link>

                {t.status === 'active' &&
                  d !== null &&
                  d <= 30 &&
                  d >= 0 && (
                    <p className="mt-3 text-sm rounded-md bg-secondary px-3 py-2">
                      {d <= 14
                        ? 'Renewal reminder: '
                        : 'Your tenancy is approaching renewal: '}
                      {d} day(s) left.
                    </p>
                  )}

                {open && role === 'tenant' && (
                  <div className="mt-3 border border-border rounded-md p-3 text-sm">
                    <p className="font-medium">Renewal offer</p>
                    <p>
                      New rent ₦{Number(open.new_rent).toLocaleString()}, until{' '}
                      {open.new_end_date}
                    </p>

                    {open.terms && (
                      <p className="text-muted-foreground">{open.terms}</p>
                    )}

                    <p className="text-xs text-muted-foreground mt-1">
                      Responding records your decision only. No payment is
                      taken.
                    </p>

                    <div className="flex gap-2 mt-2">
                      <button
                        disabled={busy}
                        onClick={() => respond(open.id, 'accepted')}
                        className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm disabled:opacity-50"
                      >
                        Accept
                      </button>

                      <button
                        disabled={busy}
                        onClick={() => respond(open.id, 'declined')}
                        className="px-3 py-1.5 rounded-md border border-border text-sm disabled:opacity-50"
                      >
                        Decline
                      </button>
                    </div>
                  </div>
                )}

                {open && role === 'landlord' && (
                  <p className="mt-3 text-sm text-muted-foreground">
                    Renewal offer sent (₦
                    {Number(open.new_rent).toLocaleString()} until{' '}
                    {open.new_end_date}). Waiting for the tenant.
                  </p>
                )}

                {!open && last && (
                  <p className="mt-3 text-sm text-muted-foreground">
                    Last renewal offer: {RENEWAL_LABELS[last.status] ?? last.status}
                  </p>
                )}

                {role === 'landlord' &&
                  t.status === 'active' &&
                  !open &&
                  (offerFor === t.id ? (
                    <div className="mt-3 space-y-2">
                      <input
                        type="number"
                        min={1}
                        value={newRent}
                        onChange={(e) => setNewRent(e.target.value)}
                        placeholder="New rent (₦)"
                        className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm"
                      />

                      <input
                        type="date"
                        value={newEnd}
                        onChange={(e) => setNewEnd(e.target.value)}
                        className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm"
                      />

                      <textarea
                        value={terms}
                        onChange={(e) => setTerms(e.target.value)}
                        rows={2}
                        placeholder="Terms (optional)"
                        className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm"
                      />

                      <div className="flex gap-2">
                        <button
                          disabled={busy}
                          onClick={() => offer(t)}
                          className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm disabled:opacity-50"
                        >
                          {busy ? 'Sending...' : 'Send offer'}
                        </button>

                        <button
                          onClick={() => setOfferFor(null)}
                          className="px-3 py-1.5 rounded-md border border-border text-sm"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setMsg('')
                        setOfferFor(t.id)
                      }}
                      className="mt-3 text-sm text-primary font-medium"
                    >
                      Offer renewal
                    </button>
                  ))}

                <div className="mt-4">
                  <p className="text-xs font-semibold text-muted-foreground mb-1">
                    Payment records
                  </p>

                  {(payments[t.id] ?? []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      {role === 'tenant'
                        ? 'No payments recorded yet. Open your tenancy to see how to pay.'
                        : 'No payments recorded yet.'}
                    </p>
                  ) : (
                    <>
                      <div className="space-y-1">
                        {(payments[t.id] ?? []).map((p) => (
                          <div
                            key={p.id}
                            className="flex items-center justify-between text-sm"
                          >
                            <span>
                              ₦{Number(p.amount).toLocaleString()}{' '}
                              <span className="text-muted-foreground">
                                <span className="capitalize">{p.type}</span> ·{' '}
                                {paymentLabel(p)}
                              </span>
                            </span>

                            {p.receipt_code && (
                              <Link
                                href={`/receipt/${p.receipt_code}`}
                                className="inline-flex items-center gap-1 text-primary"
                              >
                                <Receipt size={14} /> {p.receipt_code}
                              </Link>
                            )}
                          </div>
                        ))}
                      </div>

                      <p className="text-xs text-muted-foreground mt-2">
                        A payment record is not proof of cleared funds. Only a
                        payment marked &ldquo;Verified by EboHomes&rdquo; has
                        been checked by EboHomes.
                      </p>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
        }
