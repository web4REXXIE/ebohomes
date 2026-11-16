'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, Check, Home as HomeIcon } from 'lucide-react'
import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { supabase } from '@/lib/supabase'
import { isValidListingId } from '@/lib/listing-id'
import { groupUnits, buildingNames, unitState, countToLet, type ViewUnit } from '@/lib/estate-view'
import { LightDeyCard } from '@/components/light-dey-card'
import { BlockScene } from '@/components/building-scene'
import type { LightState } from '@/lib/light-status'

type EstateInfo = { id: string; name: string; kind: string; address_text: string | null }
type ListingInfo = {
  id: string
  title: string | null
  price_monthly: number | null
  bedrooms: number | null
  property_type: string | null
  location_text: string | null
}
type ResidentView = { my_unit: string | null; occupied: Set<string> }
type TileTone = 'to_let' | 'taken' | 'mine' | 'neighbour'

const KIND_LABEL: Record<string, string> = {
  single_house: 'House',
  block: 'Block of flats',
  estate: 'Estate',
  hostel: 'Hostel',
}

const TONE_NOTE: Record<TileTone, string> = { to_let: 'To let', taken: 'Taken', mine: 'You', neighbour: 'Neighbour' }

const STICKERS: { key: 'knock' | 'welcome' | 'howfar'; icon: string; label: string }[] = [
  { key: 'knock', icon: '👋', label: 'Knock knock' },
  { key: 'welcome', icon: '🎉', label: 'Welcome, neighbour' },
  { key: 'howfar', icon: '🤝', label: 'How far?' },
]

function naira(n: number | null | undefined): string | null {
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? `₦${n.toLocaleString('en-NG')}` : null
}

// Stage E2: the tenant building page, polished.
// - Top bar with a back button, the name and a one-line summary.
// - Houses and estates show a clean "Units" card (a tile grid with a tick on flats that are to let).
//   Blocks of flats keep the floor-by-floor building picture.
// - A sticky button takes the tenant to the flat's listing page, where Apply and viewing already live.
// - The small sheet for taken flats and neighbours sits above the bottom bar and the help button.
// Only facts that come from the data are shown. Nothing is claimed about water, security or verification.
export default function EstateViewPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const estateId = params?.id
  const [estate, setEstate] = useState<EstateInfo | null>(null)
  const [cover, setCover] = useState<string | null>(null)
  const [units, setUnits] = useState<ViewUnit[]>([])
  const [listings, setListings] = useState<Record<string, ListingInfo>>({})
  const [resident, setResident] = useState<ResidentView>({ my_unit: null, occupied: new Set() })
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [onlyToLet, setOnlyToLet] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [groupKey, setGroupKey] = useState<string>('all')
  const [buildingKey, setBuildingKey] = useState<string>('')
  const [sending, setSending] = useState(false)
  const [light, setLight] = useState<LightState>('unknown')
  const [knockMsg, setKnockMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [showAll, setShowAll] = useState(false)

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
      // Overview photo: read on its own. An error here just means no photo is shown.
      let coverUrl: string | null = null
      try {
        const { data: c } = await supabase.from('estates').select('cover_photo_url').eq('id', estateId).maybeSingle()
        const value = (c as { cover_photo_url?: string | null } | null)?.cover_photo_url
        coverUrl = typeof value === 'string' && value.startsWith('https://') ? value : null
      } catch {
        coverUrl = null
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
      setCover(coverUrl)
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
  const buildings = useMemo(() => buildingNames(groups), [groups])
  const isCompound = buildings.length > 0
  const activeBuilding = isCompound ? (buildings.includes(buildingKey) ? buildingKey : buildings[0]) : ''
  // For a compound only the chosen building's floors are shown. Otherwise everything.
  const baseGroups = isCompound ? groups.filter((g) => g.building === activeBuilding) : groups
  const toLetIn = (name: string) =>
    groups.filter((g) => g.building === name).reduce((n, g) => n + countToLet(g.units, live), 0)

  const selected = units.find((x) => x.id === selectedId) ?? null
  const isResident = resident.my_unit !== null
  const selectedIsMine = !!selected && selected.id === resident.my_unit
  const selectedIsNeighbour = !!selected && resident.occupied.has(selected.id)

  // Facts that really come from the data.
  const lowestRent = useMemo(() => {
    const rents = Object.values(listings)
      .map((l) => l.price_monthly)
      .filter((n): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0)
    return rents.length > 0 ? Math.min(...rents) : null
  }, [listings])

  const toLetUnits = useMemo(
    () =>
      units
        .filter((x) => unitState(x, live) === 'to_let' && x.listing_id && listings[x.listing_id])
        .sort((a, b) => String(a.unit_label).localeCompare(String(b.unit_label), undefined, { numeric: true })),
    [units, live, listings],
  )

  const toneOf = (x: ViewUnit): TileTone => {
    if (x.id === resident.my_unit) return 'mine'
    if (resident.occupied.has(x.id)) return 'neighbour'
    return unitState(x, live) === 'to_let' ? 'to_let' : 'taken'
  }

  const isBlock = groups.some((g) => g.floor !== null)
  const visibleGroups = baseGroups
    .filter((g) => isBlock || groupKey === 'all' || g.key === groupKey)
    .map((g) => ({ ...g, shown: onlyToLet ? g.units.filter((x) => unitState(x, live) === 'to_let') : g.units }))
    .filter((g) => g.shown.length > 0)

  const jumpTo = (key: string) => {
    document.getElementById(key)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const openList = () => {
    setShowAll(true)
    window.setTimeout(() => {
      document.getElementById('to-let-list')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 50)
  }

  // A flat that is to let goes straight to its full listing page. Anything else opens the small sheet.
  const selectUnit = (id: string) => {
    const unit = units.find((x) => x.id === id)
    if (
      unit &&
      unit.listing_id &&
      listings[unit.listing_id] &&
      unitState(unit, live) === 'to_let' &&
      unit.id !== resident.my_unit &&
      !resident.occupied.has(unit.id)
    ) {
      router.push(`/listing/${unit.listing_id}`)
      return
    }
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

  const kindText = isCompound ? 'Compound' : (KIND_LABEL[estate?.kind ?? ''] ?? 'Building')
  const singleToLet = toLetUnits.length === 1 ? toLetUnits[0] : null

  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-2xl px-4 pb-56 pt-4 sm:px-6">
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
            {/* Top bar */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => router.back()}
                aria-label="Go back"
                className="focus-ring flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-card text-foreground"
              >
                <ArrowLeft size={20} aria-hidden />
              </button>
              <div className="min-w-0">
                <h1 className="truncate text-xl font-bold text-foreground">{estate.name}</h1>
                <p className="truncate text-xs text-muted-foreground">
                  {kindText} · {units.length} {units.length === 1 ? 'unit' : 'units'} · {toLet} to let
                </p>
              </div>
            </div>

            {cover && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={cover}
                alt={`${estate.name} from outside`}
                className="mt-3 h-52 w-full rounded-card object-cover sm:h-64"
              />
            )}

            {estate.address_text && <p className="mt-3 text-sm text-muted-foreground">{estate.address_text}</p>}

            <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
              {isCompound && <span className="rounded-chip border border-border bg-card px-3 py-1 text-foreground">{buildings.length} buildings</span>}
              <span className="rounded-chip border border-success bg-success-soft px-3 py-1 text-success">{toLet} to let</span>
              {lowestRent && <span className="rounded-chip border border-border bg-card px-3 py-1 text-foreground">From {naira(lowestRent)} a month</span>}
            </div>

            {toLetUnits.length > 0 && (
              <div className="mt-4 rounded-card border-2 border-success bg-success-soft p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-success">To let now</p>
                {singleToLet && singleToLet.listing_id ? (
                  <>
                    <p className="mt-1 text-lg font-bold text-foreground">
                      {singleToLet.group_label ? `${singleToLet.group_label}, ` : ''}Unit {singleToLet.unit_label}
                      {naira(listings[singleToLet.listing_id]?.price_monthly) && (
                        <span className="text-primary"> · {naira(listings[singleToLet.listing_id]?.price_monthly)} a month</span>
                      )}
                    </p>
                    <Link
                      href={`/listing/${singleToLet.listing_id}`}
                      className="focus-ring mt-3 flex min-h-14 items-center justify-between rounded-button bg-primary px-5 text-lg font-bold text-primary-foreground"
                    >
                      Apply to view
                      <ArrowRight size={20} aria-hidden />
                    </Link>
                  </>
                ) : (
                  <>
                    <p className="mt-1 text-lg font-bold text-foreground">{toLetUnits.length} units are to let</p>
                    <button
                      type="button"
                      onClick={openList}
                      className="focus-ring mt-3 flex min-h-14 w-full items-center justify-between rounded-button bg-primary px-5 text-lg font-bold text-primary-foreground"
                    >
                      See flats to let
                      <ArrowRight size={20} aria-hidden />
                    </button>
                  </>
                )}
              </div>
            )}

            <LightDeyCard estateId={estate.id} isResident={isResident} onStatus={setLight} />

            {isCompound && (
              <div className="mt-4 flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Choose a building">
                {buildings.map((b) => (
                  <button
                    key={b}
                    type="button"
                    aria-pressed={activeBuilding === b}
                    onClick={() => { setBuildingKey(b); setSelectedId(null) }}
                    className={`focus-ring min-h-11 shrink-0 rounded-button border px-4 text-sm font-semibold ${activeBuilding === b ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-foreground'}`}
                  >
                    {b} <span className="font-normal opacity-80">· {toLetIn(b)} to let</span>
                  </button>
                ))}
              </div>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              {isBlock && baseGroups.length > 3 && (
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <span className="font-semibold">Jump to floor</span>
                  <select
                    className="focus-ring min-h-11 rounded-button border border-border bg-card px-3 text-sm"
                    defaultValue=""
                    onChange={(e) => { if (e.target.value) jumpTo(e.target.value) }}
                  >
                    <option value="" disabled>Choose</option>
                    {baseGroups.map((g) => (
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
              {isBlock && toLetUnits.length > 0 && (
                <button
                  type="button"
                  aria-expanded={showAll}
                  onClick={() => setShowAll((v) => !v)}
                  className="focus-ring min-h-11 rounded-button border border-border bg-card px-4 text-sm font-semibold text-primary"
                >
                  {showAll ? 'Hide list' : `View all (${toLetUnits.length})`}
                </button>
              )}
            </div>

            {isBlock && showAll && <ToLetList units={toLetUnits} listings={listings} />}

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
              {isResident
                ? 'This is your building. Tap a neighbour’s door to say hi.'
                : 'Tap a green flat to open its full details and apply.'}
            </p>

            {isBlock ? (
              <BlockScene name={isCompound ? `${estate.name}, ${activeBuilding}` : estate.name} groups={visibleGroups} toneOf={toneOf} selectedId={selectedId} onSelect={selectUnit} light={light} />
            ) : (
              <section className="mt-3 rounded-card border border-border bg-card p-4" aria-label="Units">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-lg font-bold text-foreground">Units</h2>
                    <p className="text-xs text-muted-foreground">Select a unit to view details and apply</p>
                  </div>
                  {toLetUnits.length > 0 && (
                    <button
                      type="button"
                      aria-expanded={showAll}
                      onClick={() => setShowAll((v) => !v)}
                      className="focus-ring inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-button border border-primary px-4 text-sm font-semibold text-primary"
                    >
                      {showAll ? 'Hide list' : 'View all'}
                      <ArrowRight size={14} aria-hidden />
                    </button>
                  )}
                </div>

                {showAll && <ToLetList units={toLetUnits} listings={listings} />}

                <div className="mt-3 space-y-4">
                  {visibleGroups.map((g) => (
                    <div key={g.key} id={g.key} className="scroll-mt-24">
                      {groups.length > 1 && (
                        <h3 className="mb-2 w-fit rounded-chip bg-secondary px-3 py-1 text-sm font-semibold text-foreground">{g.title}</h3>
                      )}
                      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                        {g.shown.map((x) => (
                          <UnitTile
                            key={x.id}
                            unit={x}
                            tone={toneOf(x)}
                            selected={x.id === selectedId}
                            light={light}
                            onSelect={selectUnit}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {onlyToLet && visibleGroups.length === 0 && <p className="mt-3 text-sm text-muted-foreground">Nothing is to let {isCompound ? 'in this building' : 'here'} right now.</p>}

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

      {/* Sticky action: only when something is to let and no sheet is open. */}
      {!loading && estate && !selected && toLetUnits.length > 0 && (
        <div className="pointer-events-none fixed inset-x-0 bottom-[7.5rem] z-30 px-4 sm:bottom-4">
          <div className="pointer-events-auto mx-auto max-w-2xl">
            {singleToLet && singleToLet.listing_id ? (
              <Link
                href={`/listing/${singleToLet.listing_id}`}
                className="focus-ring flex min-h-14 items-center justify-between rounded-button bg-primary px-5 text-lg font-bold text-primary-foreground shadow-lg"
              >
                Apply to view · Unit {singleToLet.unit_label}
                <ArrowRight size={18} aria-hidden />
              </Link>
            ) : (
              <button
                type="button"
                onClick={openList}
                className="focus-ring flex min-h-14 w-full items-center justify-between rounded-button bg-primary px-5 text-lg font-bold text-primary-foreground shadow-lg"
              >
                See flats to let ({toLetUnits.length})
                <ArrowRight size={18} aria-hidden />
              </button>
            )}
          </div>
        </div>
      )}

      {selected && (
        <div className="fixed inset-x-0 bottom-0 z-40 max-h-[60vh] overflow-y-auto rounded-t-modal border-t border-border bg-card px-4 pb-24 pt-4 shadow-lg sm:pb-6" role="dialog" aria-label={`Unit ${selected.unit_label}`}>
          <div className="mx-auto flex max-w-2xl items-start justify-between gap-3 pr-14">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">
                {selected.floor_no !== null ? `Floor ${selected.floor_no}, ` : ''}unit {selected.unit_label}
              </p>
              {selectedIsMine ? (
                <p className="text-base font-bold text-foreground">This is your home</p>
              ) : selectedIsNeighbour ? (
                <p className="text-base font-bold text-foreground">Your neighbour lives here</p>
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
        </div>
      )}
      <Footer />
    </>
  )
}

// A list of every flat or house that is to let. Each row opens that listing.
function ToLetList({ units, listings }: { units: ViewUnit[]; listings: Record<string, ListingInfo> }) {
  return (
    <ul id="to-let-list" className="mt-3 divide-y divide-border rounded-card border border-border bg-card" aria-label="All units to let">
      {units.map((x) => {
        const l = x.listing_id ? listings[x.listing_id] : undefined
        if (!l) return null
        return (
          <li key={x.id}>
            <Link
              href={`/listing/${l.id}`}
              className="focus-ring flex min-h-12 w-full items-center justify-between gap-3 px-4 py-2 text-left"
            >
              <span className="text-sm font-semibold text-foreground">
                {x.group_label ? `${x.group_label}, ` : ''}Unit {x.unit_label}
                {typeof l.bedrooms === 'number' && l.bedrooms > 0 && (
                  <span className="font-normal text-muted-foreground"> · {l.bedrooms} bed</span>
                )}
              </span>
              <span className="text-sm font-bold text-primary">{naira(l.price_monthly) ?? 'See price'}</span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

// One house or unit in the Units card. A green tick means it is to let.
function UnitTile({
  unit,
  tone,
  selected,
  light,
  onSelect,
}: {
  unit: ViewUnit
  tone: TileTone
  selected: boolean
  light: LightState
  onSelect: (id: string) => void
}) {
  const lived = tone === 'mine' || tone === 'neighbour'
  const lit = lived && light === 'on'
  const dim = lived && light === 'off'
  const toneClass =
    tone === 'to_let'
      ? 'border-success bg-success-soft text-success'
      : tone === 'mine'
        ? 'border-primary bg-primary text-primary-foreground'
        : tone === 'neighbour'
          ? lit
            ? 'border-featured/60 bg-featured/25 text-foreground'
            : 'border-primary/40 bg-secondary text-foreground'
          : 'border-transparent bg-muted text-muted-foreground'
  return (
    <button
      type="button"
      onClick={() => onSelect(unit.id)}
      aria-pressed={selected}
      aria-label={`Unit ${unit.unit_label}, ${TONE_NOTE[tone].toLowerCase()}`}
      className={`focus-ring relative flex min-h-[4.5rem] flex-col items-center justify-center rounded-xl border-2 px-2 py-2 text-sm font-bold transition ${toneClass} ${dim ? 'opacity-70' : ''} ${selected ? 'ring-2 ring-primary ring-offset-2' : ''}`}
    >
      {tone === 'to_let' && (
        <span aria-hidden className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-success text-primary-foreground">
          <Check size={12} strokeWidth={3} />
        </span>
      )}
      {lived && light !== 'unknown' && (
        <span aria-hidden className="absolute -right-1 -top-2 text-sm leading-none">{light === 'on' ? '💡' : '🕯️'}</span>
      )}
      <HomeIcon size={18} aria-hidden className="mb-0.5" />
      <span className="text-base leading-tight">{unit.unit_label}</span>
      <span className="text-[11px] font-normal leading-tight">{TONE_NOTE[tone]}</span>
    </button>
  )
}
