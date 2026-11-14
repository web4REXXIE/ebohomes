'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { supabase } from '@/lib/supabase'
import { isValidListingId } from '@/lib/listing-id'
import { displayTitle } from '@/lib/property-display'
import { groupUnits, unitState, countToLet, type ViewUnit } from '@/lib/estate-view'

type EstateInfo = { id: string; name: string; kind: string; address_text: string | null }
type ListingInfo = { id: string; title: string | null; price_monthly: number | null; bedrooms: number | null; property_type: string | null; location_text: string | null }

const KIND_LABEL: Record<string, string> = {
  single_house: 'House',
  block: 'Block of flats',
  estate: 'Estate',
  hostel: 'Hostel',
}

function naira(n: number | null | undefined): string | null {
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? `₦${n.toLocaleString('en-NG')}` : null
}

export default function EstateViewPage() {
  const params = useParams<{ id: string }>()
  const estateId = params?.id
  const [estate, setEstate] = useState<EstateInfo | null>(null)
  const [units, setUnits] = useState<ViewUnit[]>([])
  const [listings, setListings] = useState<Record<string, ListingInfo>>({})
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [onlyToLet, setOnlyToLet] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!isValidListingId(estateId)) {
        setNotFound(true)
        setLoading(false)
        return
      }
      const { data: e, error: eErr } = await supabase
        .from('estates')
        .select('id, name, kind, address_text')
        .eq('id', estateId)
        .maybeSingle()
      if (cancelled) return
      if (eErr) {
        setLoadError(true)
        setLoading(false)
        return
      }
      if (!e) {
        setNotFound(true)
        setLoading(false)
        return
      }
      const { data: u, error: uErr } = await supabase
        .from('units')
        .select('id, unit_label, floor_no, group_label, status, listing_id')
        .eq('estate_id', estateId)
        .limit(400)
      if (cancelled) return
      if (uErr) {
        setLoadError(true)
        setLoading(false)
        return
      }
      const unitRows = (u ?? []) as ViewUnit[]
      const ids = unitRows.map((x) => x.listing_id).filter((x): x is string => !!x)
      const map: Record<string, ListingInfo> = {}
      if (ids.length > 0) {
        // Only approved listings come back for tenants, so this is also the list of "live" listings.
        const { data: l } = await supabase
          .from('listings')
          .select('id, title, price_monthly, bedrooms, property_type, location_text')
          .in('id', ids)
          .eq('status', 'approved')
        for (const row of (l ?? []) as ListingInfo[]) map[row.id] = row
      }
      if (cancelled) return
      setEstate(e as EstateInfo)
      setUnits(unitRows)
      setListings(map)
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [estateId])

  const live = useMemo(() => new Set(Object.keys(listings)), [listings])
  const groups = useMemo(() => groupUnits(units), [units])
  const toLet = useMemo(() => countToLet(units, live), [units, live])
  const selected = units.find((x) => x.id === selectedId) ?? null
  const selectedListing = selected?.listing_id ? listings[selected.listing_id] : undefined
  const selectedIsToLet = selected ? unitState(selected, live) === 'to_let' : false
  const floorGroups = groups.filter((g) => g.floor !== null)

  const jumpTo = (key: string) => {
    document.getElementById(key)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-2xl px-4 pb-48 pt-6 sm:px-6">
        {loading && <p className="py-16 text-center text-sm text-muted-foreground" role="status">Loading the building...</p>}
        {!loading && notFound && (
          <div className="py-16 text-center">
            <h1 className="text-xl font-bold text-foreground">Building not found</h1>
            <p className="mt-2 text-sm text-muted-foreground">This link may be old, or the building is not listed right now.</p>
            <Link href="/search" className="focus-ring mt-4 inline-flex min-h-11 items-center rounded-button bg-primary px-5 text-sm font-bold text-primary-foreground">Search homes</Link>
          </div>
        )}
        {!loading && loadError && <p className="py-16 text-center text-sm text-danger">Could not load this building. Refresh the page.</p>}

        {!loading && estate && (
          <>
            <h1 className="text-2xl font-bold text-foreground">{estate.name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {KIND_LABEL[estate.kind] ?? 'Building'}
              {estate.address_text ? `, ${estate.address_text}` : ''}
              {` · ${units.length} ${units.length === 1 ? 'unit' : 'units'} · ${toLet} to let`}
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              {floorGroups.length > 3 && (
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <span className="font-semibold">Jump to floor</span>
                  <select
                    className="focus-ring min-h-11 rounded-button border border-border bg-card px-3 text-sm"
                    defaultValue=""
                    onChange={(e) => { if (e.target.value) jumpTo(e.target.value) }}
                  >
                    <option value="" disabled>Choose</option>
                    {floorGroups.map((g) => (
                      <option key={g.key} value={g.key}>{g.title}</option>
                    ))}
                  </select>
                </label>
              )}
              <button
                type="button"
                aria-pressed={onlyToLet}
                onClick={() => setOnlyToLet((v) => !v)}
                className={`focus-ring min-h-11 rounded-button border px-4 text-sm font-semibold ${onlyToLet ? 'border-primary bg-secondary text-primary' : 'border-border bg-card text-foreground'}`}
              >
                Only to let
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {groups.map((g) => {
                const shown = onlyToLet ? g.units.filter((x) => unitState(x, live) === 'to_let') : g.units
                if (shown.length === 0) return null
                return (
                  <section key={g.key} id={g.key} className="scroll-mt-24 rounded-card border border-border bg-card p-3" aria-label={g.title}>
                    <h2 className="mb-2 text-sm font-semibold text-foreground">{g.title}</h2>
                    <div className="flex flex-wrap gap-2">
                      {shown.map((x) => {
                        const open = unitState(x, live) === 'to_let'
                        const isSel = x.id === selectedId
                        return (
                          <button
                            key={x.id}
                            type="button"
                            onClick={() => setSelectedId(x.id)}
                            aria-pressed={isSel}
                            aria-label={`Unit ${x.unit_label}, ${open ? 'to let' : 'not available'}`}
                            className={`focus-ring flex min-h-14 min-w-16 flex-col items-center justify-center rounded-button px-3 py-1 text-sm font-bold ${
                              open ? 'border-2 border-success bg-card text-success' : 'border border-transparent bg-muted text-muted-foreground'
                            } ${isSel ? 'ring-2 ring-primary ring-offset-2' : ''}`}
                          >
                            {x.unit_label}
                            <span className="text-xs font-normal">{open ? 'To let' : 'Taken'}</span>
                          </button>
                        )
                      })}
                    </div>
                  </section>
                )
              })}
              {onlyToLet && toLet === 0 && <p className="text-sm text-muted-foreground">Nothing is to let here right now.</p>}
            </div>
            <p className="mt-4 text-xs text-muted-foreground">Tenant names are never shown. Grey means not available to rent right now.</p>
          </>
        )}
      </main>

      {selected && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card px-4 pb-6 pt-4 shadow-lg" role="dialog" aria-label={`Unit ${selected.unit_label}`}>
          <div className="mx-auto flex max-w-2xl items-start justify-between gap-3">
            <div>
              <p className="text-xs text-muted-foreground">
                {selected.floor_no !== null ? `Floor ${selected.floor_no}, ` : ''}unit {selected.unit_label}
              </p>
              {selectedIsToLet && selectedListing ? (
                <>
                  <p className="text-base font-bold text-foreground">{displayTitle(selectedListing)}</p>
                  {naira(selectedListing.price_monthly) && (
                    <p className="text-sm text-foreground">
                      <span className="font-bold text-primary">{naira(selectedListing.price_monthly)}</span> a month
                      {naira((selectedListing.price_monthly ?? 0) * 12) && <span className="text-muted-foreground">, {naira((selectedListing.price_monthly ?? 0) * 12)} a year</span>}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-base font-bold text-foreground">Not available right now</p>
              )}
            </div>
            <button type="button" onClick={() => setSelectedId(null)} className="focus-ring min-h-11 shrink-0 rounded-button px-3 text-sm font-semibold text-primary">Close</button>
          </div>
          {selectedIsToLet && selectedListing && (
            <Link
              href={`/listing/${selectedListing.id}`}
              className="focus-ring mx-auto mt-3 flex min-h-12 max-w-2xl items-center justify-center rounded-button bg-primary px-4 text-sm font-bold text-primary-foreground"
            >
              See this flat
            </Link>
          )}
        </div>
      )}
      <Footer />
    </>
  )
      }
