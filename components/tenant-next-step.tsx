'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, CheckCircle2, Clock, Heart, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { PropertySummary, usePropertyData } from '@/components/property-summary'
import { buildSteps, splitSteps, type NextStepInput, type Step } from '@/lib/next-step'

type Loaded = Omit<NextStepInput, 'now'>

const FIRST_VISIBLE = 3

// "Continue your rental journey". Same data and rules as before (lib/next-step.ts); only the look changed.
// savedCount is optional: when the page passes it, a card links to the tenant's saved homes.
export function TenantNextStep({ savedCount = 0 }: { savedCount?: number }) {
  const [data, setData] = useState<Loaded | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState<string[]>([])
  const [showAll, setShowAll] = useState(false)

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
  const { listings, inspected } = usePropertyData(steps.map((s) => s.listingId).filter(Boolean) as string[])

  const shell = (children: React.ReactNode) => (
    <section
      aria-labelledby="journey-title"
      className="rounded-2xl border border-emerald-200/70 bg-emerald-50/70 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/20 sm:p-6"
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 id="journey-title" className="text-lg font-bold text-foreground sm:text-xl">Continue your rental journey</h2>
          <p className="text-sm text-muted-foreground">Pick up where you left off and complete your next step.</p>
        </div>
        <Link href="/applications" className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-primary">
          View all <ArrowRight size={14} />
        </Link>
      </div>
      {children}
    </section>
  )

  if (loading) {
    return shell(
      <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
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

  const ordered = [...action, ...waiting]
  const visible = showAll ? ordered : ordered.slice(0, FIRST_VISIBLE)
  const hiddenCount = ordered.length - visible.length

  const stepCard = (s: Step) => {
    const mine = s.owner === 'you'
    return (
      <div
        key={s.key}
        className={`flex flex-col rounded-xl border bg-card p-4 ${mine ? 'border-amber-300 dark:border-amber-500/60' : 'border-border'}`}
      >
        <span
          className={`mb-3 inline-flex w-fit items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${
            mine
              ? 'border-amber-400 bg-amber-50 text-amber-900'
              : 'border-blue-200 bg-blue-50 text-blue-900'
          }`}
        >
          {mine ? 'ACTION NEEDED FROM YOU' : (<><Clock size={11} aria-hidden /> WAITING</>)}
        </span>
        {property(s)}
        <p className="mt-3 text-sm font-extrabold text-foreground">{s.title}</p>
        <p className="mt-1 flex-1 text-xs leading-relaxed text-muted-foreground">{s.body}</p>
        {s.cta && (
          <Link
            href={s.href}
            className="mt-3 inline-flex min-h-10 w-fit items-center gap-2 rounded-full bg-primary px-4 text-sm font-bold text-primary-foreground hover:bg-primary/90"
          >
            {s.cta} <ArrowRight size={14} />
          </Link>
        )}
      </div>
    )
  }

  const savedCard =
    savedCount > 0 ? (
      <div key="saved" className="flex flex-col rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-rose-50 text-rose-600 dark:bg-rose-950/40">
            <Heart size={20} />
          </span>
          <p className="text-sm font-extrabold text-foreground">
            {savedCount} saved {savedCount === 1 ? 'home' : 'homes'}
          </p>
        </div>
        <p className="mt-2 flex-1 text-xs leading-relaxed text-muted-foreground">Shortlist your favourites and compare them.</p>
        <Link href="/saved" className="mt-3 inline-flex w-fit items-center gap-1 text-sm font-bold text-primary underline-offset-2 hover:underline">
          View saved homes <ArrowRight size={14} />
        </Link>
      </div>
    ) : null

  return shell(
    <>
      {failed.length > 0 && (
        <div className="mb-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">
          Some of your information could not load ({failed.join(', ')}), so this list may be incomplete. Please refresh.
        </div>
      )}

      {ordered.length === 0 && failed.length === 0 && (
        <div className="mb-3 flex items-start gap-3 rounded-xl border border-emerald-300 bg-card p-4 text-sm text-emerald-900 dark:text-emerald-200">
          <CheckCircle2 className="mt-0.5 shrink-0" size={20} />
          <div>
            <p className="font-bold">Nothing to do right now.</p>
            <p className="text-muted-foreground">When you apply for a property or book a viewing, your next step shows here.</p>
            <Link href="/search" className="mt-1 inline-block font-bold text-primary underline">Search homes</Link>
          </div>
        </div>
      )}

      {(visible.length > 0 || savedCard) && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map(stepCard)}
          {savedCard}
        </div>
      )}

      {ordered.length > FIRST_VISIBLE && (
        <button
          onClick={() => setShowAll((v) => !v)}
          className="mt-3 text-sm font-bold text-primary underline-offset-2 hover:underline"
        >
          {showAll ? 'Show fewer' : `Show ${hiddenCount} more`}
        </button>
      )}
    </>
  )
}