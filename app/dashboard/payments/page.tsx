'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Wallet, ArrowRight, Info } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { RecordPaymentModal } from '@/components/record-payment-modal'
import { getPaymentState, paymentLabel } from '@/lib/payment-status'
import { naira, fmtDate, tenancyPath } from '@/lib/case-status'
import { PropertySummary, usePropertyData } from '@/components/property-summary'

type TenancyRow = {
  id: string
  rent_amount: number
  rent_period: string
  start_date: string
  status: string
  listing_id: string
  tenant_id: string
  tenant?: { full_name: string }
}

type PaymentRow = {
  id: string
  tenancy_id: string
  amount: number
  type: string
  payment_method: string | null
  status: string
  confirmed_at: string | null
  verified_by?: string | null
  verified_at?: string | null
  review_note?: string | null
  created_at?: string | null
}

const PAY_TONE: Record<string, string> = {
  verified: 'border-emerald-300 bg-emerald-50 text-emerald-900',
  legacy_confirmed: 'border-amber-300 bg-amber-50 text-amber-900',
  awaiting_verification: 'border-amber-300 bg-amber-50 text-amber-900',
  pending: 'border-slate-300 bg-slate-100 text-slate-800',
  rejected: 'border-red-300 bg-red-50 text-red-900',
  other: 'border-slate-300 bg-slate-100 text-slate-800',
}

const methodLabel = (method: string | null) => {
  if (method === 'bank_transfer') return 'Bank transfer'
  if (method === 'cash') return 'Cash'
  if (method === 'card') return 'Card'
  return method ?? 'Method not recorded'
}

export default function LandlordPaymentsPage() {
  const router = useRouter()
  const [tenancies, setTenancies] = useState<TenancyRow[]>([])
  const [paymentsByTenancy, setPaymentsByTenancy] = useState<Record<string, PaymentRow[]>>({})
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [recordModalTenancy, setRecordModalTenancy] = useState<TenancyRow | null>(null)
  const [landlordId, setLandlordId] = useState<string | null>(null)

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const load = async () => {
    setLoading(true)
    setLoadError('')
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      router.push('/login')
      return
    }
    setLandlordId(user.id)

    const { data: tenancyRows, error: tErr } = await supabase
      .from('tenancies')
      .select('id, rent_amount, rent_period, start_date, status, listing_id, tenant_id')
      .eq('landlord_id', user.id)
      .eq('status', 'active')
      .order('created_at', { ascending: false })

    if (tErr) {
      setLoadError('Could not load your payments. Please refresh and try again.')
      setLoading(false)
      return
    }

    if (!tenancyRows || tenancyRows.length === 0) {
      setTenancies([])
      setLoading(false)
      return
    }

    const tenantIds = [...new Set(tenancyRows.map((t) => t.tenant_id))]

    const [{ data: tenants }, { data: signedRows }] = await Promise.all([
      supabase.from('profiles').select('id, full_name').in('id', tenantIds),
      supabase
        .from('rental_terms')
        .select('tenancy_id, rent_amount')
        .in('tenancy_id', tenancyRows.map((t) => t.id))
        .eq('status', 'signed'),
    ])

    const merged = tenancyRows.map((t) => ({
      ...t,
      rent_amount: signedRows?.find((s) => s.tenancy_id === t.id)?.rent_amount ?? t.rent_amount,
      tenant: tenants?.find((p) => p.id === t.tenant_id),
    }))

    setTenancies(merged)

    const { data: payments } = await supabase
      .from('payments')
      .select('id, tenancy_id, amount, type, payment_method, status, confirmed_at, verified_by, verified_at, review_note, created_at')
      .in('tenancy_id', merged.map((t) => t.id))
      .order('confirmed_at', { ascending: false })

    const map: Record<string, PaymentRow[]> = {}
    payments?.forEach((p) => {
      if (!map[p.tenancy_id]) map[p.tenancy_id] = []
      map[p.tenancy_id].push(p)
    })
    setPaymentsByTenancy(map)
    setLoading(false)
  }

  const { listings, inspected } = usePropertyData(useMemo(() => tenancies.map((t) => t.listing_id), [tenancies]))

  const totalAwaiting = Object.values(paymentsByTenancy)
    .flat()
    .filter((p) => getPaymentState(p) === 'awaiting_verification').length

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold text-foreground">Payments</h1>
      <p className="mb-4 text-sm text-muted-foreground">Payment records for your active tenancies.</p>

      <p className="mb-6 flex items-start gap-2 rounded-lg border border-border bg-secondary/60 p-3 text-xs text-muted-foreground">
        <Info size={14} className="mt-0.5 shrink-0" aria-hidden />
        <span>
          When you record a payment, it waits for EboHomes to check it. Only EboHomes can mark a payment as verified.
          {!loading && totalAwaiting > 0 && (
            <b className="mt-1 block text-amber-900">
              {totalAwaiting} {totalAwaiting === 1 ? 'payment is' : 'payments are'} waiting for EboHomes to verify.
            </b>
          )}
        </span>
      </p>

      {loadError && (
        <p role="alert" className="mb-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm font-medium text-red-900">
          {loadError}
        </p>
      )}

      {loading ? (
        <div className="space-y-4" aria-busy="true" aria-label="Loading payments">
          {[0, 1].map((i) => (
            <div key={i} className="animate-pulse space-y-3 rounded-xl border border-border bg-card p-4">
              <div className="flex gap-3">
                <div className="h-16 w-20 rounded-lg bg-secondary" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-2/3 rounded bg-secondary" />
                  <div className="h-3 w-1/2 rounded bg-secondary" />
                </div>
              </div>
              <div className="h-16 rounded-lg bg-secondary" />
            </div>
          ))}
        </div>
      ) : tenancies.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-14 text-center">
          <Wallet size={30} className="mx-auto mb-3 text-muted-foreground" aria-hidden />
          <p className="text-sm font-semibold text-foreground">No active tenancies yet</p>
          <p className="mx-auto mt-1 max-w-xs text-sm text-muted-foreground">
            Payments appear here once a tenancy is active.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {tenancies.map((t) => {
            const payments = paymentsByTenancy[t.id] ?? []
            const awaiting = payments.filter((p) => getPaymentState(p) === 'awaiting_verification').length
            return (
              <section key={t.id} className="overflow-hidden rounded-xl border border-border bg-card">
                <div className="space-y-3 border-b border-border p-4">
                  <PropertySummary compact listing={listings[t.listing_id]} inspected={inspected.has(t.listing_id)} />
                  <dl className="grid grid-cols-2 gap-3 rounded-lg bg-secondary/60 p-3 text-sm">
                    <div>
                      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Tenant</dt>
                      <dd className="truncate font-medium text-foreground">{t.tenant?.full_name ?? 'Tenant'}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Rent</dt>
                      <dd className="font-bold text-foreground">
                        {naira(t.rent_amount)}
                        <span className="text-xs font-normal text-muted-foreground"> / {t.rent_period}</span>
                      </dd>
                    </div>
                  </dl>
                  {awaiting > 0 && (
                    <p role="status" className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                      {awaiting} {awaiting === 1 ? 'payment is' : 'payments are'} recorded and waiting for EboHomes to verify.
                    </p>
                  )}
                </div>

                <div className="space-y-2 p-4">
                  <h2 className="text-sm font-bold text-foreground">Payment history</h2>
                  {payments.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
                      No payments recorded yet.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {payments.map((p) => {
                        const state = getPaymentState(p)
                        return (
                          <li key={p.id} className="space-y-1 rounded-lg border border-border p-3 text-sm">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-bold text-foreground">
                                {naira(p.amount)}{' '}
                                <span className="text-xs font-normal capitalize text-muted-foreground">{p.type}</span>
                              </span>
                              <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${PAY_TONE[state]}`}>
                                {paymentLabel(p)}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {methodLabel(p.payment_method)}
                              {p.verified_by && p.verified_at
                                ? ` · Verified ${fmtDate(p.verified_at)}`
                                : p.created_at
                                  ? ` · Recorded ${fmtDate(p.created_at)}`
                                  : ''}
                            </p>
                            {p.status === 'rejected' && p.review_note && (
                              <p className="text-xs font-medium text-red-800">Reason: {p.review_note}</p>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                  )}

                  <div className="flex flex-wrap items-center gap-2 pt-2">
                    <button
                      onClick={() => setRecordModalTenancy(t)}
                      className="inline-flex min-h-11 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
                    >
                      <Wallet size={14} aria-hidden /> Record a payment
                    </button>
                    <Link
                      href={tenancyPath('landlord', t.id)}
                      className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-border px-4 text-sm font-semibold hover:bg-secondary"
                    >
                      Open tenancy <ArrowRight size={14} aria-hidden />
                    </Link>
                  </div>
                </div>
              </section>
            )
          })}
        </div>
      )}

      {recordModalTenancy && landlordId && (
        <RecordPaymentModal
          tenancy={recordModalTenancy}
          landlordId={landlordId}
          onClose={() => setRecordModalTenancy(null)}
          onCreated={(payment) => {
            setPaymentsByTenancy((prev) => ({
              ...prev,
              [payment.tenancy_id]: [payment, ...(prev[payment.tenancy_id] ?? [])],
            }))
            setRecordModalTenancy(null)
          }}
        />
      )}
    </div>
  )
}