'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Building2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { isValidListingId } from '@/lib/listing-id'

type EstateRef = { id: string; name: string; kind: string }
type UnitInfo = {
  unit_label: string
  floor_no: number | null
  estates: EstateRef | EstateRef[] | null
}

// Shows "Unit 8B, Estate name" with a link to the building view.
// Hidden for one-unit homes (single houses), and hidden if the lookup fails. It never blocks the listing page.
export function UnitBadge({ listingId, className = '' }: { listingId: string; className?: string }) {
  const [info, setInfo] = useState<{ unit: string; floor: number | null; estateId: string; estateName: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!isValidListingId(listingId)) return
      try {
        const { data, error } = await supabase
          .from('units')
          .select('unit_label, floor_no, estates(id, name, kind)')
          .eq('listing_id', listingId)
          .maybeSingle()
        if (cancelled || error || !data) return
        const row = data as unknown as UnitInfo
        const estate = Array.isArray(row.estates) ? row.estates[0] : row.estates
        if (!estate || estate.kind === 'single_house') return
        setInfo({ unit: row.unit_label, floor: row.floor_no, estateId: estate.id, estateName: estate.name })
      } catch {
        // Quietly skip: the listing page works without this.
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [listingId])

  if (!info) return null

  return (
    <div className={`flex flex-wrap items-center justify-between gap-2 rounded-card border border-border bg-card px-4 py-3 ${className}`}>
      <p className="flex items-center gap-2 text-sm text-foreground">
        <Building2 size={16} aria-hidden className="shrink-0 text-primary" />
        <span>
          <span className="font-semibold">Unit {info.unit}</span>
          {info.floor !== null ? `, floor ${info.floor}` : ''}
          <span className="text-muted-foreground">, {info.estateName}</span>
        </span>
      </p>
      <Link
        href={`/estate/${info.estateId}`}
        className="focus-ring inline-flex min-h-11 items-center text-sm font-semibold text-primary hover:underline"
      >
        View building
      </Link>
    </div>
  )
}
