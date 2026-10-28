'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight, CalendarDays, MessageCircle, Users } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { PropertySummary, usePropertyData } from '@/components/property-summary'
import { TenancyChecklist } from '@/components/tenancy-checklist'
import { EBOHOMES_WHATSAPP } from '@/lib/contact'
import { naira, fmtDate, tenancyPath } from '@/lib/case-status'

type Row = {
  id: string
  listing_id: string | null
  status: string | null
  start_date: string | null
  end_date: string | null
  rent_amount: number | null
  rent_period: string | null
  tenancy_code: string | null
}

const TERMS_TEXT: Record<string, string> = {
  proposed: 'Terms proposed, waiting for a reply',
  accepted: 'Terms accepted, agreement being recorded',
  signed: 'Agreement signed',
}

function daysLeft(end: string | null): number | null {
  if (!end) return null
  return Math.ceil((new Date(end).getTime() - Date.now()) / 86400000)
}

export function TenancyProperties({ role }: { role: 'tenant' | 'landlord' }) {
  const router = useRouter()
  const [rows, setRows] = useState<Row[]>([])
  const [party, setParty] = useState<Record<string, string>>({})
  const [terms, setTerms] = useState<Record<string, any>>({})
  const [renewals, setRenewals] = useState<Record<string, any>>({})
  const [applicants, setApplicants] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const listingIds = rows.map((r) => r.listing_id ?? '')
  const { listings, inspected } = usePropertyData(listingIds)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data: auth } = await supabase.auth.getUser()
      if (!auth.user) {
        router.push('/login')
        return
      }
      const mine = await supabase.rpc('my_tenancies', { p_as: role })
      if (mine.error) {
        if (alive) {
          setError('Could not load your properties. Please refresh and try again.')
          setLoading(false)
        }
        return
      }
      const list = (mine.data ?? []) as any[]
      const ids: string[] = list.map((x) => x.id)
      if (ids.length === 0) {
        if (alive) {
          setRows([])
          setLoading(false)
        }
        return
      }

      const [t, rt, rn] = await Promise.all([
        supabase
          .from('tenancies')
          .select('id, listing_id, status, start_date, end_date, rent_amount, rent_period, tenancy_code')
          .in('id', ids),
        supabase
          .from('rental_terms')
          .select('tenancy_id, status, rent_amount, deposit_amount, fees_amount')
          .in('tenancy_id', ids)
          .in('status', ['proposed', 'accepted', 'signed']),
        supabase
          .from('renewals')
          .select('tenancy_id, status, new_rent, new_end_date, created_at')
          .in('tenancy_id', ids)
          .order('created_at', { ascending: false }),
      ])
      if (!alive) return

      const tenancyRows = (t.data ?? []) as Row[]
      setRows(tenancyRows)
      setParty(Object.fromEntries(list.map((x) => [x.id, x.other_party ?? ''])))
      setTerms(Object.fromEntries((rt.data ?? []).map((x: any) => [x.tenancy_id, x])))

      const rm: Record<string, any> = {}
      ;(rn.data ?? []).forEach((r: any) => {
        if (!rm[r.tenancy_id]) rm[r.tenancy_id] = r
      })
      setRenewals(rm)

      if (role === 'landlord') {
        const lids = Array.from(new Set(tenancyRows.map((r) => r.listing_id).filter(Boolean))) as string[]
        const { data: apps } = await supabase
          .from('applications')
          .select('listing_id, status')
          .in('listing_id', lids)
          .in('status', ['pending', 'info_requested', 'approved'])
        if (!alive) return
        const counts: Record<string, number> = {}
        ;(apps ?? []).forEach((a: any) => {
          counts[a.listing_id] = (counts[a.listing_id] ?? 0) + 1
        })
        setApplicants(counts)
      }
      setLoading(false)
    })()
    return () => {
      alive = false
    }
  }, [role, router])

  if (loading) {
    return <div className="mx-auto max-w-3xl px-4 pt-6 text-sm text-muted-foreground">Loading your properties</div>
  }
  if (error) {
    return (
      <p role="alert" className="mx-auto mt-6 max-w-3xl rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900">
        {error}
      </p>
    )
  }
  if (rows.length === 0) return null

  const accepted = rows.filter((r) => terms[r.id]?.status === 'signed')
  const inProgress = rows.filter((r) => terms[r.id]?.status !== 'signed')
  const whoLabel = role === 'tenant' ? 'Landlord' : 'Tenant'

  const card = (r: Row) => {
    const listing = r.listing_id ? listings[r.listing_id] : undefined
    const tm = terms[r.id]
    const rn = renewals[r.id]
    const left = daysLeft(r.end_date)
    const help = `https://wa.me/${EBOHOMES_WHATSAPP}?text=${encodeURIComponent(`Hello EboHomes, I need help with tenancy ${r.tenancy_code ?? r.id}`)}`

    return (
      <div key={r.id} className="rounded-xl border border-border bg-card p-4">
        <PropertySummary listing={listing} inspected={r.listing_id ? inspected.has(r.listing_id) : false} />

        <dl className="mt-3 grid grid-cols-2 gap-3 rounded-lg bg-secondary p-3 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Rent</dt>
            <dd className="font-semibold text-foreground">
              {r.rent_amount != null ? `${naira(r.rent_amount)} / ${r.rent_period ?? 'period'}` : 'Not set'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Tenancy code</dt>
            <dd className="font-semibold text-foreground">{r.tenancy_code ?? 'Not issued yet'}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Starts</dt>
            <dd className="font-semibold text-foreground">{r.start_date ? fmtDate(r.start_date) : 'Not set'}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Ends</dt>
            <dd className="font-semibold text-foreground">
              {r.end_date ? fmtDate(r.end_date) : 'Not set'}
              {left != null && left >= 0 ? ` (${left} days left)` : ''}
              {left != null && left < 0 ? ' (ended)' : ''}
            </dd>
          </div>
          {tm && (
            <div className="col-span-2">
              <dt className="text-xs text-muted-foreground">Agreed amounts</dt>
              <dd className="font-semibold text-foreground">
                Rent {naira(tm.rent_amount)}, deposit {naira(tm.deposit_amount)}, fees {naira(tm.fees_amount)}
              </dd>
            </div>
          )}
        </dl>

        <div className="mt-3 space-y-1 text-sm">
          <p className="text-foreground">
            <span className="font-semibold">Terms: </span>
            {tm ? (TERMS_TEXT[tm.status] ?? tm.status) : 'No terms proposed yet'}
          </p>
          <p className="text-foreground">
            <span className="font-semibold">{whoLabel}: </span>
            {party[r.id] ? party[r.id] : 'Name not available'}
            <span className="text-muted-foreground"> (contact goes through EboHomes)</span>
          </p>
          {rn && (
            <p className="flex items-center gap-1.5 text-foreground">
              <CalendarDays size={14} aria-hidden />
              Renewal offer: {naira(rn.new_rent)} until {fmtDate(rn.new_end_date)} ({rn.status})
            </p>
          )}
          {role === 'landlord' && r.listing_id && (applicants[r.listing_id] ?? 0) > 0 && (
            <p className="flex items-center gap-1.5 text-foreground">
              <Users size={14} aria-hidden />
              {applicants[r.listing_id]} application(s) on this property
            </p>
          )}
        </div>

        <TenancyChecklist tenancyId={r.id} />

        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href={tenancyPath(role, r.id)}
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground"
          >
            Open this tenancy <ArrowRight size={15} aria-hidden />
          </Link>
          <a
            href={help}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-border px-5 text-sm font-semibold text-foreground hover:bg-secondary"
          >
            <MessageCircle size={15} aria-hidden /> Contact EboHomes
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 pt-8">
      <h1 className="text-2xl font-bold text-foreground">{role === 'tenant' ? 'My properties' : 'Properties and tenancies'}</h1>

      {inProgress.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">In progress</h2>
          {inProgress.map(card)}
        </section>
      )}

      {accepted.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Agreement signed</h2>
          {accepted.map(card)}
        </section>
      )}
    </div>
  )
}