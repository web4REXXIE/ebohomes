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
import { LightDeyCard } from '@/components/light-dey-card'
import { BlockScene, CompoundScene } from '@/components/building-scene'
import type { LightState } from '@/lib/light-status'

type EstateInfo = { id: string; name: string; kind: string; address_text: string | null }
type ListingInfo = { id: string; title: string | null; price_monthly: number | null; bedrooms: number | null; property_type: string | null; location_text: string | null }
type ResidentView = { my_unit: string | null; occupied: Set<string> }
type TileTone = 'to_let' | 'taken' | 'mine' | 'neighbour'

const KIND_LABEL: Record<string, string> = {
  single_house: 'House',
  block: 'Block of flats',
  estate: 'Estate',
  hostel: 'Hostel',
}

const STICKERS: { key: 'knock' | 'welcome' | 'howfar'; icon: string; label: string }[] = [
  { key: 'knock', icon: '👋', label: 'Knock knock' },
  { key: 'welcome', icon: '🎉', label: 'Welcome, neighbour' },
  { key: 'howfar', icon: '🤝', label: 'How far?' },
]

function naira(n: number | null | undefined): string | null {
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? `₦${n.toLocaleString('en-NG')}` : null
}

export default function EstateViewPage() {
  const params = useParams<{ id: string }>()
  const estateId = params?.id
  const [estate, setEstate] = useState<EstateInfo | null>(null)
  const [units, setUnits] = useState<ViewUnit[]>([])
  const [listings, setListings] = useState<Record<string, ListingInfo>>({})
  const [resident, setResident] = useState<ResidentView>({ my_unit: null, occupied: new Set() })
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [onlyToLet, setOnlyToLet] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [groupKey, setGroupKey] = useState<string>('all')
  const [sending, setSending] = useState(false)
  const [light, setLight] = useState<LightState>('unknown')
  const [knockMsg, setKnockMsg] = useState<{ ok: boolean; text: string } | null>(null)

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
      // Residents only: which door is mine, which doors are lived in. Anyone else gets nothing back.
      // If this fails, the page still works as a normal building view.
      const { data: rv, error: rvErr } = await supabase.rpc('estate_resident_view', { p_estate: estateId })
      if (cancelled) return
      if (!rvErr && rv && typeof rv === 'object') {
        const r = rv as { my_unit?: string | null; occupied?: string[] }
        setResident({ my_unit: r.my_unit ?? null, occupied: new Set(Array.isArray(r.occupied) ? r.occupied : []) })
      }
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
  const isResident = resident.my_unit !== null
  const selectedIsMine = !!selected && selected.id === resident.my_unit
  const selectedIsNeighbour = !!selected && resident.occupied.has(selected.id)

  const toneOf = (x: ViewUnit): TileTone => {
    if (x.id === resident.my_unit) return 'mine'
    if (resident.occupied.has(x.id)) return 'neighbour'
    return unitState(x, live) === 'to_let' ? 'to_let' : 'taken'
  }

  const isBlock = groups.some((g) => g.floor !== null)
  const visibleGroups = groups
    .filter((g) => isBlock || groupKey === 'all' || g.key === groupKey)
    .map((g) => ({ ...g, shown: onlyToLet ? g.units.filter((x) => unitState(x, live) === 'to_let') : g.units }))
    .filter((g) => g.shown.length > 0)

  const jumpTo = (key: string) => {
    document.getElementById(key)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const selectUnit = (id: string) => {
    setSelectedId(id)
    setKnockMsg(null)
  }

  const sendKnock = async (sticker: 'knock' | 'welcome' | 'howfar') => {
    if (!selected || sending) return
    setSending(true)
    setKnockMsg(null)
    const { error } = await supabase.rpc('send_knock', { p_to_unit: selected.id, p_sticker: sticker })
    setSending(false)
    setKnockMsg(
      error
        ? { ok: false, text: error.message || 'Could not send it. Try again.' }
        : { ok: true, text: 'Sent. They only see your unit number, never your name.' },
    )
  }

  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-2xl px-4 pb-56 pt-6 sm:px-6">
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

            <LightDeyCard estateId={estate.id} isResident={isResident} onStatus={setLight} />

            <div className="mt-4 flex flex-wrap items-center gap-2">
              {isBlock && groups.length > 3 && (
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <span className="font-semibold">Jump to floor</span>
                  <select
                    className="focus-ring min-h-11 rounded-button border border-border bg-card px-3 text-sm"
                    defaultValue=""
                    onChange={(e) => { if (e.target.value) jumpTo(e.target.value) }}
                  >
                    <option value="" disabled>Choose</option>
                    {groups.map((g) => (
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

            {!isBlock && groups.length > 1 && (
              <div className="mt-3 flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Filter by street or phase">
                {[{ key: 'all', title: 'All' }, ...groups.map((g) => ({ key: g.key, title: g.title }))].map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    aria-pressed={groupKey === c.key}
                    onClick={() => setGroupKey(c.key)}
                    className={`focus-ring min-h-9 shrink-0 rounded-chip border px-3 text-sm font-semibold ${groupKey === c.key ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-foreground'}`}
                  >
                    {c.title}
                  </button>
                ))}
              </div>
            )}

            <p className="mt-4 text-sm text-muted-foreground">
              {isResident ? 'This is your building. Tap a neighbour’s door to say hi.' : (isBlock ? 'Tap any window to peek inside.' : 'Tap any house to peek inside.')}
            </p>

            {isBlock ? (
              <BlockScene name={estate.name} groups={visibleGroups} toneOf={toneOf} selectedId={selectedId} onSelect={selectUnit} light={light} />
            ) : (
              <CompoundScene name={estate.name} groups={visibleGroups} toneOf={toneOf} selectedId={selectedId} onSelect={selectUnit} light={light} />
            )}

            {onlyToLet && toLet === 0 && <p className="mt-3 text-sm text-muted-foreground">Nothing is to let here right now.</p>}

            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm border-2 border-success bg-card" aria-hidden />To let</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-muted" aria-hidden />Taken</span>
              {isResident && (
                <>
                  <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-primary" aria-hidden />You</span>
                  <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm border border-primary/40 bg-secondary" aria-hidden />Neighbour</span>
                </>
              )}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Tenant names are never shown. Grey means not available to rent right now.</p>
          </>
        )}
      </main>

      {selected && (
        <div className="fixed inset-x-0 bottom-0 z-40 max-h-[70vh] overflow-y-auto rounded-t-modal border-t border-border bg-card px-4 pb-6 pt-4 shadow-lg" role="dialog" aria-label={`Unit ${selected.unit_label}`}>
          <div className="mx-auto flex max-w-2xl items-start justify-between gap-3">
            <div>
              <p className="text-xs text-muted-foreground">
                {selected.floor_no !== null ? `Floor ${selected.floor_no}, ` : ''}unit {selected.unit_label}
              </p>
              {selectedIsMine ? (
                <p className="text-base font-bold text-foreground">This is your home</p>
              ) : selectedIsNeighbour ? (
                <p className="text-base font-bold text-foreground">Your neighbour lives here</p>
              ) : selectedIsToLet && selectedListing ? (
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

          {selectedIsNeighbour && (
            <div className="mx-auto mt-3 max-w-2xl">
              <p className="mb-2 text-sm text-muted-foreground">Send a greeting. They see your unit number, not your name.</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {STICKERS.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    disabled={sending}
                    onClick={() => sendKnock(s.key)}
                    className="focus-ring flex min-h-12 items-center justify-center gap-2 rounded-button border border-border bg-card px-3 text-sm font-semibold text-foreground hover:bg-secondary disabled:opacity-50"
                  >
                    <span aria-hidden className="text-lg">{s.icon}</span>
                    {s.label}
                  </button>
                ))}
              </div>
              {knockMsg && (
                <p role="status" className={`mt-2 rounded-card border p-3 text-sm ${knockMsg.ok ? 'border-success bg-success-soft text-success' : 'border-danger bg-danger-soft text-danger'}`}>
                  {knockMsg.text}
                </p>
              )}
            </div>
          )}

          {!selectedIsMine && !selectedIsNeighbour && selectedIsToLet && selectedListing && (
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
