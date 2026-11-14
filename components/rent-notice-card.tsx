'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, ShieldCheck } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { isValidListingId } from '@/lib/listing-id'

type Props = {
  role: 'tenant' | 'landlord'
  tenancyId?: string
  applicationId?: string
}

// The way into official rent notices.
// Tenant: shows how many unread notices are waiting. Landlord: the way to send one.
// If only the application is known, it finds the tenancy from it.
// If anything cannot be read, the card is simply not shown. It never blocks the page.
export function RentNoticeCard({ role, tenancyId, applicationId }: Props) {
  const [id, setId] = useState<string | null>(null)
  const [waiting, setWaiting] = useState(0)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        let tid: string | null = tenancyId && isValidListingId(tenancyId) ? tenancyId : null

        if (!tid && applicationId && isValidListingId(applicationId)) {
          const { data, error } = await supabase
            .from('tenancies')
            .select('id')
            .eq('application_id', applicationId)
            .limit(1)
            .maybeSingle()
          if (error) return
          tid = (data as { id: string } | null)?.id ?? null
        }

        if (!tid || cancelled) return
        setId(tid)

        const { count, error: countError } = await supabase
          .from('rent_notices')
          .select('id', { count: 'exact', head: true })
          .eq('tenancy_id', tid)
          .eq('status', 'sent')
          .is('acknowledged_at', null)
        if (!cancelled && !countError) setWaiting(count ?? 0)
      } catch {
        // Quietly skip: the page works without this card.
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [tenancyId, applicationId])

  if (!id) return null

  const isTenant = role === 'tenant'
  const href = isTenant ? `/tenancies/${id}/rent-notices` : `/dashboard/tenancies/${id}/rent-notice`

  return (
    <section aria-label="Rent notices" className="rounded-card border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <ShieldCheck size={16} aria-hidden className="text-primary" />
          Rent notices
        </p>
        {waiting > 0 && (
          <span className="rounded-chip bg-primary px-2.5 py-0.5 text-xs font-semibold text-primary-foreground">
            {isTenant ? `${waiting} new` : `${waiting} waiting to be read`}
          </span>
        )}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {isTenant
          ? 'A rent change is official only if it is shown here.'
          : 'Change the rent officially. Your tenant is told through EboHomes.'}
      </p>
      <Link
        href={href}
        className="focus-ring mt-3 flex min-h-11 items-center justify-between rounded-md border border-border px-3 text-sm font-semibold text-foreground hover:bg-secondary"
      >
        {isTenant ? 'See rent notices' : 'Send a rent notice'}
        <ArrowRight size={14} aria-hidden />
      </Link>
    </section>
  )
}
