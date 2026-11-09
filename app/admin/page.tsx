'use client'

import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, ClipboardCheck, ShieldCheck, BadgeCheck, ShieldAlert, ClipboardList, Camera, FileText, Users, Wallet, CreditCard } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { MetricCard } from '@/components/dashboard-ui'
import { AdminPageHeader, LoadingState } from '@/components/admin-ui'

// Admin home: only what is waiting for a decision. Everything else is in the menu.
// Every number is a live count from the same table or function the page it links to uses.
// A count that could not be loaded shows a dash, never a zero.
type Item = { label: string; hint: string; href: string; count: number | null; icon: LucideIcon }
type Group = { heading: string; items: Item[] }

type CountResult = PromiseLike<{ count: number | null; error: unknown }>
type RpcResult = PromiseLike<{ data: any; error: unknown }>

// Payment evidence is read through the same admin route the Payment evidence page uses.
async function awaitingSubmissions(): Promise<number | null> {
  try {
    const token = (await supabase.auth.getSession()).data.session?.access_token ?? ''
    const res = await fetch('/api/admin/payment-submissions?filter=awaiting', { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) return null
    const body = await res.json()
    return Array.isArray(body?.items) ? body.items.length : null
  } catch {
    return null
  }
}

export default function AdminHome() {
  const [groups, setGroups] = useState<Group[] | null>(null)

  const load = useCallback(async () => {
    setGroups(null)
    const count = async (q: CountResult) => {
      const { count, error } = await q
      return error ? null : count ?? 0
    }
    // Remote inspection queues are read-only database functions. The count is how many rows they return.
    const fromRpc = async (q: RpcResult, pick: (data: any) => unknown) => {
      const { data, error } = await q
      if (error) return null
      const rows = pick(data)
      return Array.isArray(rows) ? rows.length : null
    }
    const [listings, authority, landlords, risk, cases, inspections, remoteAssign, remoteReview, applications, payments, submissions] = await Promise.all([
      count(supabase.from('listings').select('id', { count: 'exact', head: true }).eq('status', 'pending').eq('authority_status', 'accepted')),
      count(supabase.from('listings').select('id', { count: 'exact', head: true }).eq('authority_status', 'submitted')),
      count(
        supabase.from('profiles').select('id', { count: 'exact', head: true })
          .eq('role', 'landlord').eq('verification_status', 'pending')
          .not('id_document_url', 'is', null).not('selfie_url', 'is', null),
      ),
      // Phase 9.4 / 9.5 tables. If they are not installed yet the count is null and shows a dash.
      count(supabase.from('risk_alerts').select('id', { count: 'exact', head: true }).neq('status', 'resolved').in('severity', ['investigation', 'high'])),
      count(supabase.from('trust_cases').select('id', { count: 'exact', head: true }).neq('status', 'closed')),
      // Stage 18k: the Inspections page lists these under "submitted".
      count(supabase.from('property_inspections').select('id', { count: 'exact', head: true }).eq('service_type', 'verification').eq('review_status', 'submitted')),
      fromRpc(supabase.rpc('admin_remote_queue'), (d) => (d?.requests ?? []).filter((r: any) => r.status === 'ready_for_assignment')),
      fromRpc(supabase.rpc('admin_remote_review_queue'), (d) => d),
      // Same statuses the "Needs attention" queue uses for applications and payments.
      count(supabase.from('applications').select('id', { count: 'exact', head: true }).in('status', ['pending', 'info_requested'])),
      count(supabase.from('payments').select('id', { count: 'exact', head: true }).in('status', ['recorded', 'pending'])),
      awaitingSubmissions(),
    ])
    setGroups([
      {
        heading: 'Properties and verification',
        items: [
          { label: 'Listings ready to approve', hint: 'Authority accepted, waiting for your approval', href: '/admin/property-review', count: listings, icon: ClipboardCheck },
          { label: 'Authority to review', hint: 'Evidence that a lister may list a property', href: '/admin/listing-authority', count: authority, icon: ShieldCheck },
          { label: 'Landlords to verify', hint: 'Identity checks waiting for a decision', href: '/admin/verify-landlords', count: landlords, icon: BadgeCheck },
        ],
      },
      {
        heading: 'Inspections',
        items: [
          { label: 'Inspections to review', hint: 'Property verification evidence submitted by inspectors', href: '/admin/inspections', count: inspections, icon: Camera },
          { label: 'Remote requests to assign', hint: 'Tenant requests ready for an inspector', href: '/admin/remote-inspections', count: remoteAssign, icon: ClipboardList },
          { label: 'Remote reports to review', hint: 'Evidence waiting before a report is released', href: '/admin/remote-inspection-reviews', count: remoteReview, icon: FileText },
        ],
      },
      {
        heading: 'Applications and payments',
        items: [
          { label: 'Applications to review', hint: 'New, or waiting on an answer from the tenant', href: '/admin/applications', count: applications, icon: Users },
          { label: 'Payments to verify', hint: 'Recorded by landlords, not yet verified', href: '/admin/payments', count: payments, icon: Wallet },
          { label: 'Payment evidence to review', hint: 'Tenant uploads awaiting a bank check (shows up to 200)', href: '/admin/payment-submissions', count: submissions, icon: CreditCard },
        ],
      },
      {
        heading: 'Risk and cases',
        items: [
          { label: 'Risk alerts to investigate', hint: 'Signals that need a person to look. Nothing is blocked automatically.', href: '/admin/risk', count: risk, icon: ShieldAlert },
          { label: 'Open investigations', hint: 'Tracked cases in Trust Operations', href: '/admin/operations?tab=cases', count: cases, icon: ClipboardList },
        ],
      },
    ])
  }, [])

  useEffect(() => { load() }, [load])

  const missing = groups ? groups.flatMap((g) => g.items).filter((i) => i.count === null).length : 0

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
      <AdminPageHeader title="Needs your attention" description="Open the menu for everything else." />

      {!groups ? (
        <LoadingState label="Loading..." />
      ) : (
        <>
          {missing > 0 && (
            <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-warning/30 bg-warning-soft p-3 text-sm font-medium text-warning">
              <span>{missing === 1 ? '1 count could not be loaded and shows a dash.' : `${missing} counts could not be loaded and show a dash.`}</span>
              <button type="button" onClick={load} className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-button border border-warning/40 px-3 font-semibold">
                <RefreshCw size={14} aria-hidden /> Try again
              </button>
            </div>
          )}
          {groups.map((g) => (
            <section key={g.heading} aria-labelledby={`grp-${g.heading.replace(/\W+/g, '-')}`} className="space-y-2">
              <h2 id={`grp-${g.heading.replace(/\W+/g, '-')}`} className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{g.heading}</h2>
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {g.items.map((i) => (
                  <li key={i.href} className="flex">
                    <div className="flex-1 [&>a]:h-full">
                      <MetricCard icon={i.icon} label={i.label} hint={i.hint} value={i.count} href={i.href} tone={i.count ? 'warning' : 'neutral'} />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
    </div>
  )
}
