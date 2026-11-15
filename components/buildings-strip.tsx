'use client'

import Link from 'next/link'
import { Building2, ChevronRight } from 'lucide-react'
import { usePublicBuildings, type PublicBuilding } from '@/lib/use-public-buildings'

// Stage B4: building, compound and estate cards for tenants. A card opens the building page.

function kindWord(b: PublicBuilding): string {
  if (b.buildingCount > 1) return 'Compound'
  if (b.kind === 'estate') return 'Estate'
  if (b.kind === 'hostel') return 'Hostel'
  return 'Building'
}

function naira(n: number): string {
  return `₦${n.toLocaleString('en-NG')}`
}

export function BuildingCard({ b, wide }: { b: PublicBuilding; wide?: boolean }) {
  return (
    <Link
      href={`/estate/${b.id}`}
      className={`focus-ring block overflow-hidden rounded-card border border-border bg-card shadow-rest transition-colors hover:bg-secondary ${wide ? 'w-full' : 'w-64 shrink-0'}`}
    >
      {b.cover ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={b.cover} alt={`${b.name} from outside`} className="h-32 w-full object-cover" loading="lazy" />
      ) : (
        <div className="flex h-32 w-full items-center justify-center bg-secondary text-muted-foreground" aria-hidden>
          <Building2 size={32} />
        </div>
      )}
      <div className="space-y-0.5 p-3">
        <p className="line-clamp-1 text-sm font-bold text-foreground">{b.name}</p>
        <p className="line-clamp-1 text-xs text-muted-foreground">
          {kindWord(b)}
          {b.address ? ` · ${b.address}` : ''}
        </p>
        <p className="text-xs font-semibold text-primary">
          {b.toLet} {b.toLet === 1 ? 'home' : 'homes'} to let
          {b.fromPrice ? <span className="font-normal text-muted-foreground"> · from {naira(b.fromPrice)} a month</span> : null}
        </p>
      </div>
    </Link>
  )
}

// A short row for the top of Search. Renders nothing while loading, on an error, or when there is nothing to show.
export function BuildingsStrip() {
  const { items, loading } = usePublicBuildings(8)
  if (loading || items.length === 0) return null
  return (
    <section aria-label="Browse by building" className="mt-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-base font-bold text-foreground">Browse by building</h2>
        <Link href="/buildings" className="focus-ring inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-primary">
          See all <ChevronRight size={14} aria-hidden />
        </Link>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {items.map((b) => (
          <BuildingCard key={b.id} b={b} />
        ))}
      </div>
    </section>
  )
}
