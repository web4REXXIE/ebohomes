'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

type Found = { unitLabel: string; estateId: string; estateName: string; kind: string }

// Shows "Unit 8B, Maker Man's Lodge. See the whole building" on a listing page.
// Renders nothing for one-unit homes, while loading, or if anything fails. It never blocks the page.
export function UnitBadge({ listingId }: { listingId: string }) {
  const [found, setFound] = useState<Found | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const { data } = await supabase
          .from('units')
          .select('unit_label, estate_id, estates(name, kind)')
          .eq('listing_id', listingId)
          .maybeSingle()
        if (cancelled || !data) return
        const raw = (data as unknown as { estates: unknown }).estates
        const est = (Array.isArray(raw) ? raw[0] : raw) as { name?: string; kind?: string } | null
        if (!est || !est.name || est.kind === 'single_house') return
        setFound({ unitLabel: (data as { unit_label: string }).unit_label, estateId: (data as { estate_id: string }).estate_id, estateName: est.name, kind: est.kind ?? '' })
      } catch {
        // Leave the page as it was.
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [listingId])

  if (!found) return null
  return (
    <Link
      href={`/estate/${found.estateId}`}
      className="focus-ring mb-4 flex min-h-11 items-center justify-between gap-3 rounded-card border border-border bg-card px-4 py-2 text-sm"
    >
      <span className="text-foreground">
        <span className="font-semibold">Unit {found.unitLabel}</span>, {found.estateName}
      </span>
      <span className="shrink-0 font-semibold text-primary">See the building</span>
    </Link>
  )
}
