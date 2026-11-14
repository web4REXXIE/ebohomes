'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { supabase } from '@/lib/supabase'
import { isValidListingId } from '@/lib/listing-id'
import { unitState, countToLet, type ViewUnit } from '@/lib/estate-view'

type EstateCard = {
  id: string
  name: string
  kind: string
  address_text: string | null
  unitCount: number
  toLet: number
  firstListingId: string | null
}

const KIND_LABEL: Record<string, string> = {
  single_house: 'House',
  block: 'Block of flats',
  estate: 'Estate',
  hostel: 'Hostel',
}

export default function LandlordProfilePage() {
  const params = useParams<{ id: string }>()
  const ownerId = params?.id
  const [name, setName] = useState<string | null>(null)
  const [estates, setEstates] = useState<EstateCard[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!isValidListingId(ownerId)) {
        setNotFound(true)
        setLoading(false)
        return
      }
      try {
        const { data: p, error: pErr } = await supabase
          .from('profiles_public')
          .select('full_name')
          .eq('id', ownerId)
          .maybeSingle()
        if (cancelled) return
        if (pErr) throw pErr
        if (!p) {
          setNotFound(true)
          setLoading(false)
          return
        }

        // Row-level security only returns estates that have at least one live listing.
        const { data: e, error: eErr } = await supabase
          .from('estates')
          .select('id, name, kind, address_text, units(id, unit_label, floor_no, group_label, status, listing_id)')
          .eq('owner_id', ownerId)
          .order('created_at', { ascending: false })
          .limit(100)
        if (cancelled) return
        if (eErr) throw eErr

        const rows = (e ?? []) as unknown as Array<{
          id: string
          name: string
          kind: string
          address_text: string | null
          units: ViewUnit[] | null
        }>
        const listingIds = rows.flatMap((r) => (r.units ?? []).map((u) => u.listing_id).filter((x): x is string => !!x))
        const live = new Set<string>()
        if (listingIds.length > 0) {
          const { data: l } = await supabase.from('listings').select('id').in('id', listingIds).eq('status', 'approved')
          for (const row of (l ?? []) as { id: string }[]) live.add(row.id)
        }
        if (cancelled) return

        const cards: EstateCard[] = rows.map((r) => {
          const us = r.units ?? []
          const firstLive = us.find((u) => u.listing_id && live.has(u.listing_id))
          return {
            id: r.id,
            name: r.name,
            kind: r.kind,
            address_text: r.address_text,
            unitCount: us.length,
            toLet: countToLet(us, live),
            firstListingId: firstLive?.listing_id ?? null,
          }
        })
        // Keep only places that still have something live; units with no live listing are never shown.
        setName((p as { full_name: string | null }).full_name ?? 'Landlord')
        setEstates(cards.filter((c) => c.unitCount > 0 && unitStateAny(c)))
        setLoading(false)
      } catch (err) {
        console.error('Could not load landlord profile:', err)
        if (!cancelled) {
          setLoadError(true)
          setLoading(false)
        }
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [ownerId])

  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-2xl px-4 pb-16 pt-6 sm:px-6">
        {loading && <p className="py-16 text-center text-sm text-muted-foreground" role="status">Loading...</p>}
        {!loading && notFound && (
          <div className="py-16 text-center">
            <h1 className="text-xl font-bold text-foreground">Profile not found</h1>
            <p className="mt-2 text-sm text-muted-foreground">This link may be old.</p>
            <Link href="/search" className="focus-ring mt-4 inline-flex min-h-11 items-center rounded-button bg-primary px-5 text-sm font-bold text-primary-foreground">Search homes</Link>
          </div>
        )}
        {!loading && loadError && <p className="py-16 text-center text-sm text-danger">Could not load this profile. Refresh the page.</p>}

        {!loading && !notFound && !loadError && (
          <>
            <div className="flex items-center gap-3">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-secondary text-lg font-bold text-foreground" aria-hidden>
                {(name ?? 'L')[0]}
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-2xl font-bold text-foreground">{name}</h1>
                <p className="text-sm text-muted-foreground">Landlord on EboHomes</p>
              </div>
            </div>

            <p className="mt-4 rounded-card border border-border bg-card p-3 text-xs text-muted-foreground">
              Identity and document checks are shown on each listing, with their dates. No phone numbers are shown here. EboHomes is the only channel.
            </p>

            <h2 className="mt-6 text-base font-semibold text-foreground">Estates and properties</h2>
            {estates.length === 0 && (
              <p className="mt-2 text-sm text-muted-foreground">Nothing is listed right now.</p>
            )}
            <div className="mt-3 space-y-3">
              {estates.map((c) => {
                const href = c.kind === 'single_house' && c.firstListingId ? `/listing/${c.firstListingId}` : `/estate/${c.id}`
                return (
                  <div key={c.id} className="rounded-card border border-border bg-card p-4">
                    <p className="font-semibold text-foreground">{c.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {KIND_LABEL[c.kind] ?? 'Property'}
                      {c.address_text ? `, ${c.address_text}` : ''}
                    </p>
                    <p className="mt-1 text-sm text-foreground">
                      {c.unitCount} {c.unitCount === 1 ? 'unit' : 'units'} · {c.toLet} to let
                    </p>
                    <Link href={href} className="focus-ring mt-1 inline-flex min-h-11 items-center text-sm font-semibold text-primary hover:underline">
                      {c.kind === 'single_house' ? 'See this home' : 'View building'}
                    </Link>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </main>
      <Footer />
    </>
  )
}

// An estate is worth showing if at least one of its units is to let or taken but live.
function unitStateAny(c: EstateCard): boolean {
  return c.toLet > 0 || c.unitCount > 0
}
