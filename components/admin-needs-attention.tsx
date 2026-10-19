'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Loader2, CheckCircle2, ArrowRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { PropertySummary, usePropertyData } from '@/components/property-summary'
import { QUEUE_META, QUEUE_ORDER, buildQueues, type QueueInput, type QueueItem, type QueueKey, type QueueMeta } from '@/lib/admin-queues'
import { readyForTenancy } from '@/lib/admin-ready'

const LIMIT = 300
const SHOW_FIRST = 3

type Key = QueueKey | 'ready'

const READY_META: QueueMeta = {
  title: 'Tenant confirmed, tenancy not created',
  help: 'The application is approved and the tenant wants to proceed. The landlord now creates the tenancy.',
  href: '/admin/applications',
  urgent: false,
}

// "Tenant confirmed" sits right after "Applications to review" so the whole story reads in order.
const ORDER: Key[] = [...QUEUE_ORDER.slice(0, 5), 'ready', ...QUEUE_ORDER.slice(5)]

export function AdminNeedsAttention() {
  const [data, setData] = useState<QueueInput | null>(null)
  const [ready, setReady] = useState<QueueItem[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState<string[]>([])
  const [capped, setCapped] = useState(false)
  const [open, setOpen] = useState<Record<string, boolean>>({})

  const load = useCallback(async () => {
    setLoading(true)
    const bad: string[] = []
    let hitCap = false
    const take = (label: string, res: { data: any[] | null; error: any }): any[] => {
      if (res.error) {
        bad.push(label)
        console.error('Needs attention: could not load ' + label + ':', res.error.message)
        return []
      }
      const rows = res.data ?? []
      if (rows.length >= LIMIT) hitCap = true
      return rows
    }

    const [lRes, vRes, aRes, tRes, pRes, dRes, sRes, rRes] = await Promise.all([
      supabase.from('listings').select('id, created_at').or('status.eq.pending,status.is.null').order('created_at', { ascending: true }).limit(LIMIT),
      supabase.from('viewings').select('id, listing_id, tenant_id, application_id, status, tenant_decision, created_at')
        .or('status.in.(requested,approved),and(status.eq.completed,tenant_decision.eq.interested)').order('created_at', { ascending: true }).limit(LIMIT),
      supabase.from('applications').select('id, case_ref, status, listing_id, tenant_id, tenant_reply, created_at')
        .in('status', ['pending', 'info_requested']).order('created_at', { ascending: true }).limit(LIMIT),
      supabase.from('rental_terms').select('id, tenancy_id, version, status, updated_at').eq('status', 'accepted').limit(LIMIT),
      supabase.from('payments').select('id, listing_id, tenancy_id, amount, status, type, created_at')
        .in('status', ['recorded', 'pending']).order('created_at', { ascending: true }).limit(LIMIT),
      supabase.from('tenancy_disputes').select('id, tenancy_id, category, status, created_at').in('status', ['open', 'under_review']).limit(LIMIT),
      supabase.from('tenancy_settlements').select('id, tenancy_id, status, updated_at').in('status', ['agreed', 'disputed']).limit(LIMIT),
      supabase.from('applications').select('id, case_ref, status, listing_id, tenant_id, tenant_interest_at')
        .eq('status', 'approved').not('tenant_interest_at', 'is', null).order('tenant_interest_at', { ascending: true }).limit(LIMIT),
    ])

    const listings = take('listings', lRes as any)
    const viewings = take('viewings', vRes as any)
    const applications = take('applications', aRes as any)
    const terms = take('agreements', tRes as any)
    const payments = take('payments', pRes as any)
    const disputes = take('disputes', dRes as any)
    const settlements = take('settlements', sRes as any)
    const readyApps = take('confirmed tenants', rRes as any)

    // Second step: which tenancies already exist, and who the people are.
    const appIds = Array.from(new Set([
      ...viewings.filter((v) => v.tenant_decision === 'interested' && v.application_id).map((v) => v.application_id as string),
      ...readyApps.map((a) => a.id as string),
    ]))
    const tenancyIds = Array.from(new Set([...terms, ...disputes, ...settlements, ...payments].map((x) => x.tenancy_id).filter(Boolean) as string[]))
    const personIds = Array.from(new Set([...viewings, ...applications, ...readyApps].map((x) => x.tenant_id).filter(Boolean) as string[]))

    const [byApp, byId, people] = await Promise.all([
      appIds.length ? supabase.from('tenancies').select('id, application_id, listing_id').in('application_id', appIds) : Promise.resolve({ data: [], error: null } as any),
      tenancyIds.length ? supabase.from('tenancies').select('id, application_id, listing_id').in('id', tenancyIds) : Promise.resolve({ data: [], error: null } as any),
      personIds.length ? supabase.from('profiles').select('id, full_name').in('id', personIds) : Promise.resolve({ data: [], error: null } as any),
    ])
    const tenA = take('tenancies', byApp as any)
    const tenB = take('tenancies', byId as any)
    const profs = take('names', people as any)

    const tenancyApplicationIds = tenA.map((t) => t.application_id).filter(Boolean)
    const names = Object.fromEntries(profs.map((p) => [p.id, p.full_name || 'Applicant']))

    setData({
      listings, viewings, applications, terms, payments, disputes, settlements,
      tenancyApplicationIds,
      tenancyListing: Object.fromEntries(tenB.map((t) => [t.id, t.listing_id])),
      names,
    })
    setReady(readyForTenancy({ applications: readyApps, tenancyApplicationIds, names }))
    setFailed(Array.from(new Set(bad)))
    setCapped(hitCap)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const queues = useMemo<Record<Key, QueueItem[]> | null>(() => (data ? { ...buildQueues(data), ready } : null), [data, ready])
  const listingIds = useMemo(
    () => (queues ? ORDER.flatMap((k) => queues[k].map((i) => i.listingId).filter(Boolean) as string[]) : []),
    [queues],
  )
  const { listings, inspected } = usePropertyData(listingIds)

  if (loading || !queues) {
    return (
      <div className="mb-8 flex items-center gap-2 rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
        <Loader2 className="animate-spin text-primary" size={18} /> Loading what needs your attention…
      </div>
    )
  }

  const metaOf = (k: Key): QueueMeta => (k === 'ready' ? READY_META : QUEUE_META[k])
  const active = ORDER.filter((k) => queues[k].length > 0)
  const total = active.reduce((n, k) => n + queues[k].length, 0)

  return (
    <section className="mb-8" aria-labelledby="needs-attention-title">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="needs-attention-title" className="text-xl font-bold text-foreground">Needs attention{total > 0 ? ` (${total})` : ''}</h2>
          <p className="text-sm text-muted-foreground">The oldest request in each list is shown first.</p>
        </div>
        <button onClick={load} className="min-h-10 rounded-full border border-border px-4 text-xs font-bold text-foreground">Refresh</button>
      </div>

      {failed.length > 0 && (
        <div className="mb-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">
          Some lists could not load ({failed.join(', ')}), so the numbers below may be incomplete. Please refresh.
        </div>
      )}
      {capped && (
        <p className="mb-3 text-xs text-muted-foreground">Each list shows up to {LIMIT} items. Open the full page to see everything.</p>
      )}

      {active.length === 0 && failed.length === 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900">
          <CheckCircle2 className="mt-0.5 shrink-0" size={20} />
          <div>
            <p className="font-bold">Nothing needs your attention right now.</p>
            <p>New listings, viewing requests, applications and payments will appear here.</p>
          </div>
        </div>
      )}

      {active.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {active.map((k) => (
            <a key={k} href={`#queue-${k}`} className={`rounded-full border px-3 py-1.5 text-xs font-bold ${metaOf(k).urgent ? 'border-red-300 bg-red-50 text-red-900' : 'border-amber-300 bg-amber-50 text-amber-900'}`}>
              {metaOf(k).title} ({queues[k].length})
            </a>
          ))}
        </div>
      )}

      <div className="space-y-6">
        {active.map((k) => {
          const meta = metaOf(k)
          const items = queues[k]
          const shown = open[k] ? items : items.slice(0, SHOW_FIRST)
          return (
            <div key={k} id={`queue-${k}`} className="scroll-mt-24">
              <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h3 className="text-base font-bold text-foreground">{meta.title} ({items.length})</h3>
                  <p className="text-xs text-muted-foreground">{meta.help}</p>
                </div>
                <Link href={meta.href} className="inline-flex min-h-10 items-center gap-1 text-xs font-bold text-primary hover:underline">
                  Open full list <ArrowRight size={12} />
                </Link>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {shown.map((i) => (
                  <div key={i.key} className={`rounded-xl border bg-card p-4 ${meta.urgent ? 'border-red-200' : 'border-border'}`}>
                    <PropertySummary compact listing={i.listingId ? listings[i.listingId] : undefined} inspected={!!i.listingId && inspected.has(i.listingId)} />
                    <div className="mt-3 space-y-1 text-sm">
                      <p className="flex flex-wrap items-center gap-2">
                        <span className={`inline-block rounded-full border px-2.5 py-1 text-xs font-bold ${meta.urgent ? 'border-red-300 bg-red-50 text-red-900' : 'border-amber-300 bg-amber-50 text-amber-900'}`}>{i.status}</span>
                        {i.ref && <span className="text-xs text-muted-foreground">Ref {i.ref}</span>}
                      </p>
                      {i.who && <p className="text-xs text-foreground">Tenant: <span className="font-semibold">{i.who}</span></p>}
                      {i.detail && <p className="text-xs text-muted-foreground">{i.detail}</p>}
                      <p className="font-semibold text-foreground">Next: <span className="font-normal">{i.next}</span></p>
                    </div>
                    <Link href={i.href} className="mt-3 inline-flex min-h-10 items-center rounded-full bg-primary px-4 text-xs font-bold text-primary-foreground">
                      Open
                    </Link>
                  </div>
                ))}
              </div>
              {items.length > SHOW_FIRST && (
                <button onClick={() => setOpen((p) => ({ ...p, [k]: !p[k] }))} className="mt-2 min-h-10 rounded-full border border-border px-4 text-xs font-bold text-foreground">
                  {open[k] ? 'Show fewer' : `Show all ${items.length}`}
                </button>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}