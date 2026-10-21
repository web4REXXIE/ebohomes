'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight, Check, Loader2 } from 'lucide-react'
import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { supabase } from '@/lib/supabase'
import { PropertySummary, usePropertyData } from '@/components/property-summary'
import { buildJourney, pickTenancy, statusPanel, type Journey } from '@/lib/rental-journey'
import { TONE_CLASS } from '@/lib/viewing-status'

type AppRow = {
  id: string
  status: string
  listing_id: string
  created_at: string
  case_ref: string | null
  tenant_interest_at: string | null
}
type Entry = { app: AppRow; journey: Journey }

const btnP = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground transition active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'
const btnS = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-semibold text-foreground transition hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'

const isClosed = (j: Journey) => j.phase === 'withdrawn' || j.phase === 'rejected' || j.phase === 'ended'

export default function MyRentalJourneyHubPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [entries, setEntries] = useState<Entry[]>([])

  const load = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser()
    const uid = auth.user?.id
    if (!uid) { router.replace('/login?redirect=/journey'); return }

    const { data: apps, error } = await supabase
      .from('applications')
      .select('id, status, listing_id, created_at, case_ref, tenant_interest_at')
      .eq('tenant_id', uid)
      .order('created_at', { ascending: false })
      .limit(50)
    if (error) { console.error('Journey hub: applications failed:', error.message); setFailed(true); setLoading(false); return }

    const rows = (apps ?? []) as AppRow[]
    if (rows.length === 0) { setEntries([]); setLoading(false); return }

    // One application only: go straight to its journey.
    if (rows.length === 1) { router.replace(`/journey/${rows[0].id}`); return }

    const ids = rows.map((a) => a.id)
    const [vw, tn] = await Promise.all([
      supabase.from('viewings').select('*').in('application_id', ids).order('created_at', { ascending: false }),
      supabase.from('tenancies').select('id, application_id, status').in('application_id', ids),
    ])
    const tenancies = (tn.data ?? []) as { id: string; application_id: string; status: string | null }[]
    let terms: any[] = []
    if (tenancies.length) {
      const rt = await supabase
        .from('rental_terms')
        .select('id, tenancy_id, status, tenant_accepted_at, landlord_accepted_at')
        .in('tenancy_id', tenancies.map((t) => t.id))
      terms = rt.data ?? []
    }
    setFailed(!!(vw.error || tn.error))

    const built = rows.map((app): Entry => {
      const t = pickTenancy(tenancies.filter((x) => x.application_id === app.id))
      const live = t ? terms.find((x) => x.tenancy_id === t.id && ['proposed', 'accepted', 'signed'].includes(x.status)) ?? null : null
      const journey = buildJourney({
        app,
        viewings: ((vw.data ?? []) as any[]).filter((v) => v.application_id === app.id),
        tenancy: t ? { id: t.id, status: t.status } : null,
        terms: live,
      })
      return { app, journey }
    })
    setEntries(built)
    setLoading(false)
  }, [router])

  useEffect(() => { load() }, [load])

  const { listings, inspected } = usePropertyData(useMemo(() => entries.map((e) => e.app.listing_id), [entries]))

  const { active, closed } = useMemo(() => {
    const open = entries.filter((e) => !isClosed(e.journey))
    // Cards that need the tenant come first. The sort is stable, so newest stays first inside each group.
    open.sort((a, b) => Number(b.journey.steps.some((s) => s.needsYou)) - Number(a.journey.steps.some((s) => s.needsYou)))
    return { active: open, closed: entries.filter((e) => isClosed(e.journey)) }
  }, [entries])

  const card = (e: Entry) => {
    const { app, journey } = e
    const cur = journey.steps.find((s) => s.key === journey.currentKey)!
    const needs = journey.steps.some((s) => s.needsYou)
    const panel = statusPanel(journey.phase, { appStatus: app.status, listingId: app.listing_id, listingOpen: false })
    return (
      <li key={app.id} className={`rounded-xl border bg-card p-4 ${needs ? 'border-primary border-l-4' : 'border-border'}`}>
        <PropertySummary compact listing={listings[app.listing_id]} inspected={inspected.has(app.listing_id)} />
        <ol className="mt-3 flex items-center gap-1" aria-label="Journey progress">
          {journey.steps.map((s) => (
            <li
              key={s.key}
              title={`${s.number} ${s.title}`}
              className={`flex h-7 w-7 items-center justify-center rounded-full border-2 text-[11px] font-bold ${
                s.state === 'done' ? 'border-primary bg-primary text-primary-foreground'
                : s.state === 'current' ? 'border-primary bg-card text-primary'
                : s.state === 'stopped' ? 'border-red-600 bg-red-50 text-red-700'
                : 'border-border bg-card text-muted-foreground'
              }`}
            >
              {s.state === 'done' ? <Check size={13} aria-hidden /> : s.number}
            </li>
          ))}
        </ol>
        <p className="mt-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">Stage {cur.number} of 05 · {cur.title}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <span className={`inline-block whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold ${TONE_CLASS[cur.tone]}`}>{cur.label}</span>
          {needs && <span className="text-xs font-bold text-amber-900">Your action needed</span>}
        </div>
        <p className="mt-2 text-sm text-foreground">{panel.heading}</p>
        <Link href={`/journey/${app.id}`} className={`${needs ? btnP : btnS} mt-3`}>
          {needs ? 'Continue my journey' : 'Open journey'} <ArrowRight size={15} aria-hidden />
        </Link>
      </li>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <main className="flex-1">
        <div className="mx-auto w-full max-w-4xl space-y-5 px-4 py-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">My Rental Journey</h1>
            <p className="text-sm text-muted-foreground">Apply, get approved, view, agree terms and pay. Every step happens in your journey.</p>
          </div>

          {loading ? (
            <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground" aria-busy="true">
              <Loader2 className="animate-spin text-primary" size={18} aria-hidden /> Loading your journeys…
            </div>
          ) : failed && entries.length === 0 ? (
            <div className="space-y-3 rounded-xl border border-border bg-card p-6 text-center">
              <p className="font-semibold text-foreground">We could not load your rental journeys</p>
              <p className="text-sm text-muted-foreground">This is usually temporary. Please try again.</p>
              <button className={btnP} onClick={() => { setFailed(false); setLoading(true); load() }}>Try again</button>
            </div>
          ) : entries.length === 0 ? (
            <div className="space-y-3 rounded-xl border border-border bg-card p-6 text-center">
              <p className="font-semibold text-foreground">Your journey starts when you apply</p>
              <p className="text-sm text-muted-foreground">Find a property you like and tap Apply. It then appears here with every next step.</p>
              <Link href="/search" className={btnP}>Browse properties <ArrowRight size={15} aria-hidden /></Link>
            </div>
          ) : (
            <>
              {failed && <p role="alert" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">Some information could not load, so a stage may look behind. Please refresh the page.</p>}
              {active.length > 0 && <ul className="space-y-3">{active.map(card)}</ul>}
              {active.length === 0 && <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">You have no open journeys right now.</p>}
              {closed.length > 0 && (
                <details className="rounded-xl border border-border bg-card p-4">
                  <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold text-foreground">Closed ({closed.length})</summary>
                  <ul className="mt-3 space-y-3">{closed.map(card)}</ul>
                </details>
              )}
            </>
          )}
        </div>
      </main>
      <Footer />
    </div>
  )
}