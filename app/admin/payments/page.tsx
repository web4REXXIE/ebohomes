'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { getPaymentState, PAYMENT_STATE_LABEL, type PaymentState } from '@/lib/payment-status'

type Payment = {
  id: string
  tenancy_id: string | null
  listing_id: string | null
  user_id: string | null
  recorded_by: string | null
  type: string | null
  amount: number | string | null
  payment_method: string | null
  reference: string | null
  status: string | null
  review_note: string | null
  receipt_code: string | null
  created_at: string | null
  confirmed_at: string | null
  verified_by: string | null
  verified_at: string | null
}

type Filter = 'all' | 'awaiting' | 'confirmed' | 'rejected'
type Notice = { ok: boolean; text: string } | null

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'awaiting', label: 'Awaiting review' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'rejected', label: 'Rejected' },
]

const BADGE: Record<PaymentState, string> = {
  verified: 'bg-green-100 text-green-800',
  legacy_confirmed: 'bg-orange-100 text-orange-800',
  awaiting_verification: 'bg-amber-100 text-amber-800',
  pending: 'bg-blue-100 text-blue-800',
  rejected: 'bg-red-100 text-red-800',
  other: 'bg-secondary text-muted-foreground',
}

const LIMIT = 500
// Same tenancy, same amount, recorded within this many seconds = flag for a human to look at.
const DUPLICATE_WINDOW_SECONDS = 120

const isReviewable = (p: Payment) => p.status === 'recorded' || p.status === 'pending'
const money = (v: number | string | null) => `₦${(Number(v) || 0).toLocaleString()}`
const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '—'
const methodLabel = (m: string | null) =>
  m === 'bank_transfer' ? 'Bank transfer' : m === 'cash' ? 'Cash' : m === 'card' ? 'Card' : m ?? '—'

function friendlyError(err: { message?: string; code?: string }): string {
  const msg = err.message ?? 'Something went wrong.'
  if (err.code === '42501' || /not allowed|permission|admin|authori[sz]/i.test(msg)) {
    return `You do not have permission to review payments. (${msg})`
  }
  return msg
}

export default function AdminPaymentsPage() {
  const [access, setAccess] = useState<'checking' | 'ok' | 'denied'>('checking')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [payments, setPayments] = useState<Payment[]>([])
  const [listings, setListings] = useState<Record<string, string>>({})
  const [names, setNames] = useState<Record<string, string>>({})
  const [filter, setFilter] = useState<Filter>('awaiting')
  const [notice, setNotice] = useState<Notice>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const busyRef = useRef(false)

  // Role check is for a good experience only. The database enforces the real rule.
  useEffect(() => {
    let active = true
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { if (active) setAccess('denied'); return }
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
      if (active) setAccess(profile?.role === 'admin' ? 'ok' : 'denied')
    })()
    return () => { active = false }
  }, [])

  // Does not touch `notice`, so a success message survives the refresh that follows a review.
  const loadPayments = useCallback(async () => {
    setLoading(true)
    setLoadError(null)

    const { data, error } = await supabase
      .from('payments')
      .select(
        'id, tenancy_id, listing_id, user_id, recorded_by, type, amount, payment_method, reference, status, review_note, receipt_code, created_at, confirmed_at, verified_by, verified_at'
      )
      .order('created_at', { ascending: false })
      .limit(LIMIT)

    if (error) {
      setLoadError(friendlyError(error))
      setLoading(false)
      return
    }

    const rows = (data ?? []) as Payment[]
    setPayments(rows)

    // Context for the reviewer. Names and property titles only: no email or phone.
    const listingIds = Array.from(new Set(rows.map((r) => r.listing_id).filter(Boolean))) as string[]
    const personIds = Array.from(
      new Set(rows.flatMap((r) => [r.user_id, r.recorded_by, r.verified_by]).filter(Boolean))
    ) as string[]

    const [l, p] = await Promise.all([
      listingIds.length
        ? supabase.from('listings').select('id, title').in('id', listingIds)
        : Promise.resolve({ data: [] as any[] }),
      personIds.length
        ? supabase.from('profiles').select('id, full_name').in('id', personIds)
        : Promise.resolve({ data: [] as any[] }),
    ])
    setListings(Object.fromEntries((l.data ?? []).map((x: any) => [x.id, x.title || 'Property'])))
    setNames(Object.fromEntries((p.data ?? []).map((x: any) => [x.id, x.full_name || 'Unnamed'])))
    setLoading(false)
  }, [])

  useEffect(() => {
    if (access === 'ok') loadPayments()
  }, [access, loadPayments])

  const counts = useMemo(() => {
    const c = { all: payments.length, awaiting: 0, confirmed: 0, rejected: 0, legacyConfirmed: 0 }
    for (const p of payments) {
      if (isReviewable(p)) c.awaiting++
      else if (p.status === 'confirmed') {
        c.confirmed++
        if (!p.verified_by) c.legacyConfirmed++
      } else if (p.status === 'rejected') c.rejected++
    }
    return c
  }, [payments])

  // Flag, never change: payments that look like repeats of each other.
  const possibleDuplicates = useMemo(() => {
    const flagged = new Set<string>()
    for (let i = 0; i < payments.length; i++) {
      for (let j = i + 1; j < payments.length; j++) {
        const a = payments[i], b = payments[j]
        if (!a.tenancy_id || a.tenancy_id !== b.tenancy_id) continue
        if (Number(a.amount) !== Number(b.amount) || !a.created_at || !b.created_at) continue
        const gap = Math.abs(new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) / 1000
        if (gap <= DUPLICATE_WINDOW_SECONDS) { flagged.add(a.id); flagged.add(b.id) }
      }
    }
    return flagged
  }, [payments])

  const visible = useMemo(() => {
    if (filter === 'awaiting') return payments.filter(isReviewable)
    if (filter === 'confirmed') return payments.filter((p) => p.status === 'confirmed')
    if (filter === 'rejected') return payments.filter((p) => p.status === 'rejected')
    return payments
  }, [payments, filter])

  const review = async (id: string, decision: 'confirmed' | 'rejected', why: string | null) => {
    if (busyRef.current) return
    busyRef.current = true
    setBusyId(id)
    setNotice(null)

    const { error } = await supabase.rpc('admin_review_payment', {
      p_payment_id: id,
      p_decision: decision,
      p_reason: why,
    })

    busyRef.current = false
    setBusyId(null)

    if (error) {
      setNotice({ ok: false, text: friendlyError(error) })
      return
    }
    setNotice({ ok: true, text: decision === 'confirmed' ? 'Payment verified.' : 'Payment rejected.' })
    setRejectingId(null)
    setReason('')
    await loadPayments()
  }

  const onVerify = (p: Payment) => {
    if (busyRef.current) return
    if (!window.confirm(`Verify this ${money(p.amount)} payment? Only do this after checking the money was really paid.`)) return
    review(p.id, 'confirmed', null)
  }

  const onReject = (p: Payment) => {
    const why = reason.trim()
    if (!why) {
      setNotice({ ok: false, text: 'Enter a reason before rejecting a payment.' })
      return
    }
    review(p.id, 'rejected', why)
  }

  if (access === 'checking') {
    return <div className="flex justify-center py-16"><Loader2 className="animate-spin text-primary" size={26} /></div>
  }
  if (access === 'denied') {
    return <p className="text-center py-16 text-sm text-muted-foreground">Only EboHomes administrators can review payments.</p>
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-foreground mb-1">Payments</h1>
      <p className="text-sm text-muted-foreground mb-4">
        Landlords record payments. Only an EboHomes administrator can verify or reject them. EboHomes does not move money.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-2">
        {[
          { label: 'All', value: counts.all },
          { label: 'Awaiting review', value: counts.awaiting },
          { label: 'Confirmed', value: counts.confirmed },
          { label: 'Rejected', value: counts.rejected },
        ].map((c) => (
          <div key={c.label} className="bg-card border border-border rounded-lg p-3">
            <p className="text-xs text-muted-foreground">{c.label}</p>
            <p className="text-xl font-bold text-foreground">{c.value}</p>
          </div>
        ))}
      </div>
      {counts.legacyConfirmed > 0 && (
        <p className="text-xs text-muted-foreground mb-2">
          {counts.legacyConfirmed} confirmed record{counts.legacyConfirmed === 1 ? '' : 's'} have no verifier on file (older
          records). They are not counted as verified and need manual review outside this page.
        </p>
      )}
      {payments.length >= LIMIT && (
        <p className="text-xs text-muted-foreground mb-2">Showing the latest {LIMIT} payments. Counts cover these only.</p>
      )}

      <div className="flex gap-2 my-3 overflow-x-auto">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-full text-sm border whitespace-nowrap ${
              filter === f.key ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-foreground'
            }`}
          >
            {f.label}
          </button>
        ))}
        <button
          onClick={loadPayments}
          disabled={loading || !!busyId}
          className="ml-auto px-3 py-1.5 rounded-full text-sm border border-border disabled:opacity-50"
        >
          Refresh
        </button>
      </div>

      {notice && (
        <p
          role="status"
          className={`text-sm rounded-md px-3 py-2 mb-3 ${
            notice.ok ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
          }`}
        >
          {notice.text}
        </p>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-primary" size={26} /></div>
      ) : loadError ? (
        <div className="text-center py-12 border border-dashed border-border rounded-lg">
          <p className="text-sm text-destructive mb-3">Could not load payments: {loadError}</p>
          <button onClick={loadPayments} className="text-sm text-primary font-medium">Try again</button>
        </div>
      ) : visible.length === 0 ? (
        <p className="text-center py-12 text-sm text-muted-foreground border border-dashed border-border rounded-lg">
          No payments in this view.
        </p>
      ) : (
        <div className="space-y-3">
          {visible.map((p) => {
            const state = getPaymentState(p)
            const rowBusy = busyId === p.id
            const rejecting = rejectingId === p.id
            return (
              <div key={p.id} className="bg-card border border-border rounded-lg p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-lg font-bold text-foreground">{money(p.amount)}</p>
                    <p className="text-xs text-muted-foreground capitalize">
                      {p.type ?? 'payment'} · {methodLabel(p.payment_method)}
                    </p>
                  </div>
                  <span className={`text-xs font-semibold px-2 py-1 rounded-full whitespace-nowrap ${BADGE[state]}`}>
                    {PAYMENT_STATE_LABEL[state]}
                  </span>
                </div>

                <div className="mt-2 text-sm text-foreground space-y-0.5">
                  <p>{(p.listing_id && listings[p.listing_id]) || 'Property'}</p>
                  <p className="text-xs text-muted-foreground">
                    Tenant: {(p.user_id && names[p.user_id]) || '—'} · Recorded by: {(p.recorded_by && names[p.recorded_by]) || '—'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Tenancy {p.tenancy_id ? p.tenancy_id.slice(0, 8) : '—'} · Recorded {when(p.created_at)}
                  </p>
                  <p className="text-xs text-muted-foreground">Reference: {p.reference || '—'}</p>
                  {p.receipt_code && <p className="text-xs text-muted-foreground">Receipt: {p.receipt_code}</p>}
                </div>

                {possibleDuplicates.has(p.id) && (
                  <p className="mt-2 text-xs rounded-md bg-amber-100 text-amber-800 px-2 py-1.5">
                    Possible duplicate: another payment with the same amount was recorded for this tenancy within{' '}
                    {DUPLICATE_WINDOW_SECONDS} seconds. Check before verifying.
                  </p>
                )}
                {p.status === 'recorded' && p.confirmed_at && (
                  <p className="mt-2 text-xs rounded-md bg-secondary text-muted-foreground px-2 py-1.5">
                    This older record has a confirmed date ({when(p.confirmed_at)}) but its status is still recorded. It is
                    not verified.
                  </p>
                )}
                {p.status === 'confirmed' && !p.verified_by && (
                  <p className="mt-2 text-xs rounded-md bg-secondary text-muted-foreground px-2 py-1.5">
                    Marked confirmed in an older record, but no administrator is recorded as verifying it.
                  </p>
                )}
                {p.verified_by && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Verified by {names[p.verified_by] || 'an administrator'} on {when(p.verified_at)}
                  </p>
                )}
                {p.review_note && (
                  <p className="mt-2 text-xs text-foreground">
                    <span className="text-muted-foreground">Review note: </span>{p.review_note}
                  </p>
                )}

                {isReviewable(p) && (
                  <div className="mt-3 border-t border-border pt-3">
                    {rejecting ? (
                      <div className="space-y-2">
                        <label className="text-xs font-medium text-muted-foreground" htmlFor={`reason-${p.id}`}>
                          Reason for rejecting (required)
                        </label>
                        <textarea
                          id={`reason-${p.id}`}
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          disabled={!!busyId}
                          rows={3}
                          className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => onReject(p)}
                            disabled={!!busyId || !reason.trim()}
                            className="flex items-center gap-2 px-3 py-2 rounded-md bg-destructive text-white text-sm font-semibold disabled:opacity-50"
                          >
                            {rowBusy && <Loader2 size={14} className="animate-spin" />}
                            Confirm rejection
                          </button>
                          <button
                            onClick={() => { setRejectingId(null); setReason('') }}
                            disabled={!!busyId}
                            className="px-3 py-2 rounded-md border border-border text-sm disabled:opacity-50"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <button
                          onClick={() => onVerify(p)}
                          disabled={!!busyId}
                          className="flex items-center gap-2 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
                        >
                          {rowBusy && <Loader2 size={14} className="animate-spin" />}
                          Verify Payment
                        </button>
                        <button
                          onClick={() => { setRejectingId(p.id); setReason(''); setNotice(null) }}
                          disabled={!!busyId}
                          className="px-3 py-2 rounded-md border border-border text-sm font-semibold disabled:opacity-50"
                        >
                          Reject Payment
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}