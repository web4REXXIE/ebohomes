'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, CheckCircle2, Clock, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { PropertySummary, usePropertyData } from '@/components/property-summary'
import { buildSteps, splitSteps, type NextStepInput, type Step } from '@/lib/next-step'
import { buildJourney, pickTenancy } from '@/lib/rental-journey'
import { TONE_CLASS } from '@/lib/viewing-status'

type Loaded = Omit<NextStepInput, 'now'>

export function TenantNextStep() {
  const [data, setData] = useState<Loaded | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState<string[]>([])

  const load = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser()
    const uid = auth.user?.id
    if (!uid) {
      setLoading(false)
      return
    }
    const bad: string[] = []
    const take = (label: string, res: { data: any[] | null; error: any }): any[] => {
      if (res.error) {
        bad.push(label)
        console.error('Next step: could not load ' + label + ':', res.error.message)
        return []
      }
      return res.data ?? []
    }

    const [vRes, aRes, tRes] = await Promise.all([
      supabase.from('viewings').select('id, listing_id, application_id, status, tenant_decision, scheduled_for').eq('tenant_id', uid).order('created_at', { ascending: false }).limit(100),
      supabase.from('applications').select('id, listing_id, status, tenant_interest_at').eq('tenant_id', uid).order('created_at', { ascending: false }).limit(100),
      supabase.rpc('my_tenancies', { p_as: 'tenant' }),
    ])
    const viewings = take('viewings', vRes as any)
    const applications = take('applications', aRes as any)
    const tenancies = take('tenancies', tRes as any)

    // Tenancies from the database function may not include the application, so look it up separately.
    const tenancyIds = tenancies.map((t) => t.id as string)
    let appByTenancy: Record<string, string> = {}
    let terms: any[] = []
    let handovers: any[] = []
    let payments: any[] = []
    if (tenancyIds.length) {
      const [a, b, c, d] = await Promise.all([
        supabase.from('tenancies').select('id, application_id').in('id', tenancyIds),
        supabase.from('rental_terms').select('id, tenancy_id, status, tenant_accepted_at').in('tenancy_id', tenancyIds),
        supabase.from('handover_records').select('id, tenancy_id, kind, status, submitted_by').in('tenancy_id', tenancyIds),
        supabase.from('payments').select('id, tenancy_id, amount, status, verified_by').in('tenancy_id', tenancyIds),
      ])
      appByTenancy = Object.fromEntries(take('tenancy details', a as any).map((x) => [x.id, x.application_id]))
      terms = take('rental terms', b as any)
      handovers = take('handover records', c as any)
      payments = take('payments', d as any)
    }

    setData({
      userId: uid,
      viewings,
      applications,
      tenancies: tenancies.map((t) => ({ id: t.id, listing_id: t.listing_id ?? null, title: t.title ?? null, status: t.status ?? null, application_id: appByTenancy[t.id] ?? null })),
      terms,
      handovers,
      payments,
    })
    setFailed(Array.from(new Set(bad)))
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const steps = useMemo(() => (data ? buildSteps({ ...data, now: Date.now() }) : []), [data])
  const { action, waiting } = useMemo(() => splitSteps(steps), [steps])
  // One journey summary per open application, built from the records already loaded above.
  const journeys = useMemo(() => {
    if (!data) return []
    return data.applications
      .map((a) => {
        const t = pickTenancy(data.tenancies.filter((x) => x.application_id === a.id) as any[])
        const live = t ? data.terms.find((x) => x.tenancy_id === t.id && ['proposed', 'accepted', 'signed'].includes(x.status)) ?? null : null
        const j = buildJourney({
          app: a,
          viewings: data.viewings.filter((v) => v.application_id === a.id) as any[],
          tenancy: t ? { id: t.id, status: t.status } : null,
          terms: live,
                    paymentVerified: t ? data.payments.some((p) => p.tenancy_id === t.id && p.status === 'confirmed' && !!p.verified_by) : undefined,
        })
        return { a, j }
      })
      .filter(({ j }) => j.phase !== 'withdrawn' && j.phase !== 'rejected')
  }, [data])
  const { listings, inspected } = usePropertyData([
    ...(steps.map((s) => s.listingId).filter(Boolean) as string[]),
    ...journeys.map(({ a }) => a.listing_id),
  ])

  if (loading) {
    return (
      <div className="mb-6 flex items-center gap-2 rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
        <Loader2 className="animate-spin text-primary" size={18} /> Checking what you need to do…
      </div>
    )
  }
  if (!data) return null

  const property = (s: Step) =>
    s.listingId ? (
      <PropertySummary compact listing={listings[s.listingId]} inspected={inspected.has(s.listingId)} href={s.href} />
    ) : s.label ? (
      <p className="text-sm font-bold text-foreground">{s.label}</p>
    ) : null

  const first = action[0]
  const more = action.slice(1)

  return (
    <section className="mb-8" aria-labelledby="next-step-title">
      <h2 id="next-step-title" className="mb-3 text-lg font-bold text-foreground">Your next step</h2>

      {failed.length > 0 && (
        <div className="mb-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">
          Some of your information could not load ({failed.join(', ')}), so this list may be incomplete. Please refresh.
        </div>
      )}

      {first ? (
        <div className="rounded-2xl border-2 border-amber-400 bg-amber-50 p-4">
          <span className="inline-block rounded-full border border-amber-400 bg-white px-2.5 py-1 text-xs font-bold text-amber-900">ACTION NEEDED FROM YOU</span>
          <div className="mt-3 rounded-lg bg-white p-3">{property(first)}</div>
          <p className="mt-3 text-base font-extrabold text-foreground">{first.title}</p>
          <p className="mt-1 text-sm text-foreground">{first.body}</p>
          {first.cta && (
            <Link href={first.href} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-bold text-primary-foreground">
              {first.cta} <ArrowRight size={15} />
            </Link>
          )}
        </div>
      ) : failed.length === 0 ? (
        <div className="flex items-start gap-3 rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900">
          <CheckCircle2 className="mt-0.5 shrink-0" size={20} />
          <div>
            <p className="font-bold">Nothing to do right now.</p>
            <p>{waiting.length > 0 ? 'EboHomes is working on the items below.' : 'When you apply for a property or book a viewing, your next step shows here.'}</p>
            {waiting.length === 0 && <Link href="/search" className="mt-1 inline-block font-bold underline">Search homes</Link>}
          </div>
        </div>
      ) : null}

      {more.length > 0 && (
        <div className="mt-4 space-y-3">
          <p className="text-sm font-bold text-foreground">Also needs you ({more.length})</p>
          {more.map((s) => (
            <div key={s.key} className="rounded-xl border border-amber-300 bg-card p-4">
              {property(s)}
              <p className="mt-2 text-sm font-bold text-foreground">{s.title}</p>
              <p className="text-xs text-muted-foreground">{s.body}</p>
              {s.cta && <Link href={s.href} className="mt-2 inline-flex min-h-10 items-center rounded-full bg-primary px-4 text-xs font-bold text-primary-foreground">{s.cta}</Link>}
            </div>
          ))}
        </div>
      )}

      {waiting.length > 0 && (
        <details className="mt-4 rounded-xl border border-border bg-card p-4" open={action.length === 0}>
          <summary className="cursor-pointer text-sm font-bold text-foreground">Waiting on EboHomes or the landlord ({waiting.length})</summary>
          <div className="mt-3 space-y-3">
            {waiting.map((s) => (
              <div key={s.key} className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                {property(s)}
                <p className="mt-2 flex items-start gap-1.5 text-sm font-bold text-blue-900"><Clock size={14} className="mt-0.5 shrink-0" /> {s.title}</p>
                <p className="text-xs text-blue-900">{s.body}</p>
              </div>
            ))}
          </div>
        </details>
      )}

      {journeys.length > 0 && (
        <div className="mt-6">
          <h3 className="mb-1 text-base font-bold text-foreground">Your rental journey</h3>
          <p className="mb-3 text-xs text-muted-foreground">Application, decision, viewing, tenancy setup and active tenancy, all in one place.</p>
          <div className="space-y-3">
            {journeys.map(({ a, j }) => {
              const cur = j.steps.find((s) => s.key === j.currentKey)!
              return (
                <div key={a.id} className="rounded-xl border border-border bg-card p-4">
                  <PropertySummary compact listing={listings[a.listing_id]} inspected={inspected.has(a.listing_id)} />
                  <p className="mt-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">Stage {cur.number} of 05 · {cur.title}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span className={`inline-block whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold ${TONE_CLASS[cur.tone]}`}>{cur.label}</span>
                    {cur.needsYou && <span className="text-xs font-bold text-amber-900">Your action needed</span>}
                  </div>
                  <Link href={`/journey/${a.id}`} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-bold text-primary-foreground">
                    Open rental journey <ArrowRight size={15} aria-hidden />
                  </Link>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </section>
  )
}