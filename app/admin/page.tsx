'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, RefreshCw, ClipboardCheck, ShieldCheck, BadgeCheck, ShieldAlert, ClipboardList } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { MetricCard } from '@/components/dashboard-ui'

// Admin home: only what is waiting for a decision. Everything else is in the menu.
// Every number is a live count. A count that could not be loaded shows a dash, never a zero.
type Item = { label: string; hint: string; href: string; count: number | null; icon: LucideIcon }

export default function AdminHome() {
  const [items, setItems] = useState<Item[] | null>(null)

  const load = useCallback(async () => {
    setItems(null)
    const count = async (q: PromiseLike<{ count: number | null; error: unknown }>) => {
      const { count, error } = await q
      return error ? null : count ?? 0
    }
    const [listings, authority, landlords, risk, cases] = await Promise.all([
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
    ])
    setItems([
      { label: 'Listings ready to approve', hint: 'Authority accepted, waiting for your approval', href: '/admin/property-review', count: listings, icon: ClipboardCheck },
      { label: 'Authority to review', hint: 'Evidence that a lister may list a property', href: '/admin/listing-authority', count: authority, icon: ShieldCheck },
      { label: 'Landlords to verify', hint: 'Identity checks waiting for a decision', href: '/admin/verify-landlords', count: landlords, icon: BadgeCheck },
      { label: 'Risk alerts to investigate', hint: 'Signals that need a person to look. Nothing is blocked automatically.', href: '/admin/risk', count: risk, icon: ShieldAlert },
      { label: 'Open investigations', hint: 'Tracked cases in Trust Operations', href: '/admin/operations?tab=cases', count: cases, icon: ClipboardList },
    ])
  }, [])

  useEffect(() => { load() }, [load])

  const missing = items ? items.filter((i) => i.count === null).length : 0

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">Needs your attention</h1>
        <p className="text-sm text-muted-foreground">Open the menu for everything else.</p>
      </div>

      {!items ? (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={16} className="animate-spin" aria-hidden /> Loading...</p>
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
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {items.map((i) => (
              <li key={i.href} className="flex">
                <div className="flex-1 [&>a]:h-full">
                  <MetricCard icon={i.icon} label={i.label} hint={i.hint} value={i.count} href={i.href} tone={i.count ? 'warning' : 'neutral'} />
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
