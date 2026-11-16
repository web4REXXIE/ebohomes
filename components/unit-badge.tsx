'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Building2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { isValidListingId } from '@/lib/listing-id'
import { naturalSort, unitState, type ViewUnit } from '@/lib/estate-view'

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

const SHOWN = 12

// A feature card on the listing page: "This flat is part of a building. See the whole building."
// It shows a small picture of the building with this flat highlighted, plus how many flats are to let.
// Hidden for one-unit homes (single houses), and hidden if the lookup fails. It never blocks the listing page.
// If only the picture cannot load, the card still works as a link to the building.
export function UnitBadge({ listingId, className = '' }: { listingId: string; className?: string }) {
  const [info, setInfo] = useState<Info | null>(null)
  const [peek, setPeek] = useState<Peek | null>(null)
  const [shown, setShown] = useState(false)

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

  // Let the tiles fade in one after another once everything is ready.
  useEffect(() => {
    if (!info) return
    const t = requestAnimationFrame(() => setShown(true))
    return () => cancelAnimationFrame(t)
  }, [info, peek])

  const view = useMemo(() => {
    if (!peek || !info) return null
    const sorted = [...peek.units].sort((a, b) => naturalSort(a.unit_label, b.unit_label))
    const idx = Math.max(0, sorted.findIndex((x) => x.id === info.unitId))
    const start = Math.max(0, Math.min(idx - 5, sorted.length - SHOWN))
    const tiles = sorted.slice(start, start + SHOWN)
    const toLet = sorted.filter((x) => unitState(x, peek.live) === 'to_let').length
    return {
      tiles,
      total: sorted.length,
      toLet,
      before: start,
      after: Math.max(0, sorted.length - (start + SHOWN)),
    }
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
        <div className="mt-3 rounded-md bg-secondary p-3" role="img" aria-label={summary ?? undefined}>
          <div aria-hidden className="grid grid-cols-6 gap-1.5">
            {view.tiles.map((x, i) => {
              const mine = x.id === info.unitId
              const open = unitState(x, peek!.live) === 'to_let'
              const tone = mine
                ? 'relative bg-primary text-primary-foreground'
                : open
                  ? 'border-2 border-success bg-card text-success'
                  : 'bg-muted text-muted-foreground'
              return (
                <span
                  key={x.id}
                  style={{ transitionDelay: `${i * 40}ms` }}
                  className={`flex h-10 items-center justify-center overflow-hidden rounded-t-md rounded-b-sm px-0.5 text-[10px] font-bold transition-all duration-300 motion-reduce:transition-none ${shown ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0'} motion-reduce:translate-y-0 motion-reduce:opacity-100 ${tone}`}
                >
                  {mine && <span className="absolute -inset-0.5 rounded-t-md rounded-b-sm ring-2 ring-primary/60 motion-safe:animate-pulse" />}
                  <span className="relative truncate">{x.unit_label}</span>
                </span>
              )
            })}
          </div>
          {(view.before > 0 || view.after > 0) && (
            <p aria-hidden className="mt-2 text-[11px] text-muted-foreground">
              {view.before > 0 ? `+${view.before} before` : ''}
              {view.before > 0 && view.after > 0 ? ' · ' : ''}
              {view.after > 0 ? `+${view.after} more` : ''}
            </p>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">{view.total} {view.total === 1 ? 'flat' : 'flats'}</span>
            {' · '}
            <span className="font-semibold text-success">{view.toLet} to let</span>
            {' · '}
            <span className="font-semibold text-primary">You are here</span>
          </p>
        </div>
      )}

      <span className="mt-3 flex min-h-12 items-center justify-center gap-2 rounded-button bg-primary px-4 text-sm font-bold text-primary-foreground">
        View {place?.word ?? 'building'}
        <ArrowRight size={16} aria-hidden className="transition-transform group-hover:translate-x-1 group-active:translate-x-1 motion-reduce:transition-none" />
      </span>
    </Link>
  )
}
