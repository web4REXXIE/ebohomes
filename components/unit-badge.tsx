'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { ArrowRight, Building2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { isValidListingId } from '@/lib/listing-id'
import { naturalSort, unitState, type ViewUnit } from '@/lib/estate-view'

const Building3D = dynamic(() => import('@/components/building-3d'), {
  ssr: false,
  loading: () => <div className="h-[260px] animate-pulse rounded-md bg-secondary" />,
})

type EstateRef = { id: string; name: string; kind: string }
type UnitRow = {
  id: string
  unit_label: string
  floor_no: number | null
  estates: EstateRef | EstateRef[] | null
}
type Info = {
  unitId: string
  unit: string
  floor: number | null
  estateId: string
  estateName: string
  kind: string
}
type Peek = { units: ViewUnit[]; live: Set<string> }

// A feature card on the listing page: "This flat is part of a building. See the whole building."
// It shows a small spinning 3D model of the building with this flat highlighted, plus how many flats are to let.
// Hidden for one-unit homes (single houses), and hidden if the lookup fails. It never blocks the listing page.
// If only the picture cannot load, the card still works as a link to the building.
export function UnitBadge({ listingId, className = '' }: { listingId: string; className?: string }) {
  const [info, setInfo] = useState<Info | null>(null)
  const [peek, setPeek] = useState<Peek | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!isValidListingId(listingId)) return
      try {
        const { data, error } = await supabase
          .from('units')
          .select('id, unit_label, floor_no, estates(id, name, kind)')
          .eq('listing_id', listingId)
          .maybeSingle()
        if (cancelled || error || !data) return
        const row = data as unknown as UnitRow
        const estate = Array.isArray(row.estates) ? row.estates[0] : row.estates
        if (!estate || estate.kind === 'single_house') return
        setInfo({ unitId: row.id, unit: row.unit_label, floor: row.floor_no, estateId: estate.id, estateName: estate.name, kind: estate.kind })

        // The picture of the building. If this part fails, the card is still shown without it.
        try {
          const { data: u, error: uErr } = await supabase
            .from('units')
            .select('id, unit_label, floor_no, group_label, status, listing_id')
            .eq('estate_id', estate.id)
            .limit(400)
          if (cancelled || uErr || !u) return
          const units = u as ViewUnit[]
          const ids = units.map((x) => x.listing_id).filter((x): x is string => !!x)
          const live = new Set<string>()
          if (ids.length > 0) {
            const { data: l } = await supabase.from('listings').select('id').in('id', ids).eq('status', 'approved')
            for (const r of (l ?? []) as { id: string }[]) live.add(r.id)
          }
          if (!cancelled) setPeek({ units, live })
        } catch {
          // Quietly skip the picture.
        }
      } catch {
        // Quietly skip: the listing page works without this.
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [listingId])

  const view = useMemo(() => {
    if (!peek || !info) return null
    const sorted = [...peek.units].sort((a, b) => naturalSort(a.unit_label, b.unit_label))
    const toLet = sorted.filter((x) => unitState(x, peek.live) === 'to_let').length
    // In a compound, show only the building this flat is in, so the model stays clear.
    const hasFloors = sorted.some((u) => u.floor_no !== null)
    const hasBuildings = hasFloors && sorted.some((u) => (u.group_label ?? '').trim() !== '')
    const me = sorted.find((u) => u.id === info.unitId)
    const myGroup = (me?.group_label ?? '').trim()
    const scene = hasBuildings && myGroup ? sorted.filter((u) => (u.group_label ?? '').trim() === myGroup) : sorted
    return { scene, total: sorted.length, toLet, sceneName: hasBuildings && myGroup ? myGroup : info.estateName }
  }, [peek, info])

  // Say plainly what this place is and where the flat sits: a flat in a building, a flat in a building of a compound,
  // a house in an estate, a room in a hostel.
  const place = useMemo(() => {
    if (!info) return null
    const all = peek?.units ?? []
    const hasFloors = all.some((u) => u.floor_no !== null)
    const hasBuildings = hasFloors && all.some((u) => (u.group_label ?? '').trim() !== '')
    const me = all.find((u) => u.id === info.unitId)
    const bName = (me?.group_label ?? '').trim()
    if (hasBuildings) {
      return {
        word: 'compound',
        eyebrow: 'Part of a compound',
        sentence: `A flat in ${bName || 'one of the buildings'}, inside ${info.estateName} (a compound).`,
      }
    }
    if (info.kind === 'hostel') {
      return { word: 'hostel', eyebrow: 'Part of a hostel', sentence: `A room in ${info.estateName} (a hostel).` }
    }
    if (info.kind === 'estate' && !hasFloors) {
      return { word: 'estate', eyebrow: 'Part of an estate', sentence: `A house in ${info.estateName} (an estate).` }
    }
    return {
      word: 'building',
      eyebrow: 'Part of a building',
      sentence: `A flat${info.floor !== null ? ` on floor ${info.floor}` : ''} in ${info.estateName} (a building).`,
    }
  }, [info, peek])

  if (!info) return null

  const summary = view ? `${view.total} ${view.total === 1 ? 'unit' : 'units'}, ${view.toLet} to let` : null

  return (
    <Link
      href={`/estate/${info.estateId}`}
      aria-label={`View the whole building, ${info.estateName}${summary ? `. ${summary}` : ''}`}
      className={`focus-ring group block rounded-card border border-primary/30 bg-card p-4 shadow-sm transition-shadow hover:shadow-md motion-reduce:transition-none ${className}`}
    >
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary">
        <Building2 size={14} aria-hidden className="shrink-0" />
        {place?.eyebrow ?? 'Part of a building'}
      </p>

      <p className="mt-1 text-base text-foreground">
        <span className="font-bold">Unit {info.unit}</span>
        {info.floor !== null ? `, floor ${info.floor}` : ''}
        <span className="text-muted-foreground">, {info.estateName}</span>
      </p>
      {place && <p className="mt-1 text-sm text-muted-foreground">{place.sentence}</p>}

      {view && (
        <div className="mt-3 rounded-md bg-secondary p-2" role="img" aria-label={summary ?? undefined}>
          <div aria-hidden>
            <Building3D
              preview
              height={260}
              units={view.scene}
              name={view.sceneName}
              toneOf={(u) => (unitState(u, peek!.live) === 'to_let' ? 'to_let' : 'taken')}
              selectedId={info.unitId}
            />
          </div>
          <p className="mt-2 px-1 text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">{view.total} {view.total === 1 ? 'flat' : 'flats'}</span>
            {' · '}
            <span className="font-semibold text-success">{view.toLet} to let</span>
            {' · '}
            <span className="font-semibold text-primary">Your flat is gold</span>
          </p>
        </div>
      )}

      <span className="mt-3 flex min-h-12 items-center justify-center gap-2 rounded-button bg-primary px-4 text-sm font-bold text-primary-foreground">
        Explore the {place?.word ?? 'building'} in 3D
        <ArrowRight size={16} aria-hidden className="transition-transform group-hover:translate-x-1 group-active:translate-x-1 motion-reduce:transition-none" />
      </span>
    </Link>
  )
}
