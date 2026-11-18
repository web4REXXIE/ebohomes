'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { PropertySummary, usePropertyData } from '@/components/property-summary'
import { ApplicationStatusBadge } from '@/components/application-ui'

// "My application" in the tenant menu. It used to be a copy of the single journey page with no application id,
// so it always failed. Now:
//   one open application  -> go straight to its journey
//   several, none, or ?all=1 -> a short list (open ones first)
// It only reads the tenant's own applications, the same way the journey page does. Nothing is changed here.
type Row = { id: string; status: string; created_at: string; listing_id: string; case_ref: string | null }

const OPEN = ['pending', 'info_requested', 'approved', 'accepted']
const isOpen = (r: Row) => OPEN.includes(r.status)
const day = (iso: string) => new Date(iso).toLocaleDateString('en-NG')

const btnP =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground transition active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'
const btnS =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-semibold text-foreground transition active:scale-[0.98] hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'

export default function MyApplicationsPage() {
  const router = useRouter()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [failed, setFailed] = useState(false)

  const load = useCallback(async () => {
    setFailed(false)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.replace('/login?redirect=/journey')
      return
    }
    const { data, error } = await supabase
      .from('applications')
      .select('id, status, created_at, listing_id, case_ref')
      .eq('tenant_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50)
    if (error) {
      console.error('My applications: load failed:', error.message)
      setFailed(true)
      return
    }
    const list = (data ?? []) as Row[]
    const showAll = new URLSearchParams(window.location.search).get('all') === '1'
    const open = list.filter(isOpen)
    if (!showAll && open.length === 1) {
      router.replace(`/journey/${open[0].id}`)
      return
    }
    setRows(list)
  }, [router])

  useEffect(() => { load() }, [load])

  const open = useMemo(() => (rows ?? []).filter(isOpen), [rows])
  const closed = useMemo(() => (rows ?? []).filter((r) => !isOpen(r)), [rows])
  const { listings, inspected } = usePropertyData(useMemo(() => (rows ?? []).map((r) => r.listing_id), [rows]))

  const card = (r: Row) => (
    <li key={r.id} className="space-y-3 rounded-xl border border-border bg-card p-4">
      <PropertySummary compact listing={listings[r.listing_id]} inspected={inspected.has(r.listing_id)} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-1">
          <ApplicationStatusBadge status={r.status} />
          <p className="text-xs text-muted-foreground">{r.case_ref ? `${r.case_ref} · ` : ''}Applied {day(r.created_at)}</p>
        </div>
        <Link href={`/journey/${r.id}`} className={isOpen(r) ? btnP : btnS}>
          {isOpen(r) ? 'Continue' : 'View'} <ArrowRight size={15} aria-hidden />
        </Link>
      </div>
    </li>
  )

  let body: React.ReactNode
  if (failed) {
    body = (
      <div className="space-y-3 py-12 text-center">
        <p className="font-semibold text-foreground">We could not load your applications</p>
        <p className="text-sm text-muted-foreground">This is usually temporary. Please try again.</p>
        <button type="button" className={btnP} onClick={() => { setRows(null); load() }}>Try again</button>
      </div>
    )
  } else if (rows === null) {
    body = (
      <div className="flex justify-center py-16" role="status" aria-label="Loading your applications">
        <Loader2 className="animate-spin text-primary" size={26} aria-hidden />
      </div>
    )
  } else if (rows.length === 0) {
    body = (
      <div className="space-y-3 rounded-xl border border-border bg-card p-6 text-center">
        <p className="font-semibold text-foreground">You have not applied for a home yet</p>
        <p className="text-sm text-muted-foreground">Find a home, then tap Apply. Your application and every step after it will be here.</p>
        <Link href="/search" className={btnP}>Find a home <ArrowRight size={15} aria-hidden /></Link>
      </div>
    )
  } else {
    body = (
      <div className="space-y-6">
        {open.length > 0 && <ul className="space-y-3">{open.map(card)}</ul>}
        {closed.length > 0 && (
          <section aria-labelledby="closed-heading" className="space-y-3">
            <h2 id="closed-heading" className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Closed</h2>
            <ul className="space-y-3">{closed.map(card)}</ul>
          </section>
        )}
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <main className="flex-1">
        <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-6">
          <h1 className="text-2xl font-bold text-foreground">My applications</h1>
          {body}
        </div>
      </main>
      <Footer />
    </div>
  )
}
