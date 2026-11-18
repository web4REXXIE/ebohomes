'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { ArrowLeft, ArrowRight, Building2, Loader2, MapPin, X } from 'lucide-react'
import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { BlockScene, CompoundScene, type SceneGroup, type TileTone } from '@/components/building-scene'
import { supabase } from '@/lib/supabase'
import { isValidListingId } from '@/lib/listing-id'
import { bedroomsLabel, displayTitle, toMoney } from '@/lib/property-display'
import { TrustedBadge } from '@/components/trusted-badge'
import { buildingNames, groupUnits, naturalSort, unitState, type ViewUnit } from '@/lib/estate-view'

const Building3D = dynamic(() => import('@/components/building-3d'), {
  ssr: false,
  loading: () => <div className="h-[460px] animate-pulse rounded-xl bg-secondary" />,
})

// The tenant's view of a building, compound, estate or hostel: what is in it and which homes are to let.
// Read only. A home is "to let" only when its unit is available AND its listing is approved (see lib/estate-view.ts).
// No tenant names, reasons or landlord details are shown here. Row-level security decides which places can be read.
type Estate = { id: string; owner_id: string | null; name: string; kind: string; address_text: string | null; cover_photo_url: string | null; units: ViewUnit[] | null }
type LandlordInfo = { id: string; name: string; trusted: boolean }
type LiveListing = { id: string; title: string | null; price_monthly: number | string | null; bedrooms: number | string | null; property_type: string | null; location_text: string | null }

const naira = (n: number) => '₦' + n.toLocaleString('en-NG', { maximumFractionDigits: 0 })

const btnP =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground transition active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'
const btnS =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-semibold text-foreground transition active:scale-[0.98] hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'

export default function EstatePage() {
  const params = useParams<{ id: string }>()
  const estateId = params?.id
  const [estate, setEstate] = useState<Estate | null>(null)
  const [live, setLive] = useState<Record<string, LiveListing>>({})
  const [state, setState] = useState<'loading' | 'ok' | 'notfound' | 'error'>('loading')
  const [onlyLet, setOnlyLet] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [landlord, setLandlord] = useState<LandlordInfo | null>(null)
  const [mode, setMode] = useState<'3d' | 'flat'>('3d')

  const load = useCallback(async () => {
    if (!isValidListingId(estateId)) {
      setState('notfound')
      return
    }
    setState('loading')
    const { data, error } = await supabase
      .from('estates')
      .select('id, owner_id, name, kind, address_text, cover_photo_url, units(id, unit_label, floor_no, group_label, status, listing_id)')
      .eq('id', estateId)
      .maybeSingle()
    if (error) {
      console.error('Building page: load failed:', error.message)
      setState('error')
      return
    }
    if (!data) {
      setState('notfound')
      return
    }
    const e = data as unknown as Estate
    const ids = (e.units ?? []).map((u) => u.listing_id).filter((x): x is string => !!x)
    const map: Record<string, LiveListing> = {}
    if (ids.length > 0) {
      const { data: ls, error: lErr } = await supabase
        .from('listings')
        .select('id, title, price_monthly, bedrooms, property_type, location_text')
        .in('id', ids)
        .eq('status', 'approved')
      if (lErr) {
        console.error('Building page: listings failed:', lErr.message)
        setState('error')
        return
      }
      for (const l of (ls ?? []) as LiveListing[]) map[l.id] = l
    }
    setEstate(e)
    setLive(map)
    setState('ok')

    // The landlord card is a bonus. If it cannot load, the building page works without it.
    setLandlord(null)
    if (e.owner_id) {
      const [pRes, tRes] = await Promise.all([
        supabase.from('profiles_public').select('full_name').eq('id', e.owner_id).maybeSingle(),
        supabase.rpc('landlord_is_trusted', { p_landlord: e.owner_id }),
      ])
      const fullName = (pRes.data as { full_name: string | null } | null)?.full_name
      if (!pRes.error && fullName) {
        setLandlord({ id: e.owner_id, name: fullName, trusted: !tRes.error && tRes.data === true })
      }
    }
  }, [estateId])

  useEffect(() => { void load() }, [load])

  const units = useMemo(() => estate?.units ?? [], [estate])
  const liveIds = useMemo(() => new Set(Object.keys(live)), [live])
  const groups = useMemo(() => groupUnits(units), [units])
  const buildings = useMemo(() => buildingNames(groups), [groups])
  const isCompound = buildings.length > 1
  const hasFloors = units.some((u) => u.floor_no !== null)
  const toLet = useMemo(() => units.filter((u) => unitState(u, liveIds) === 'to_let'), [units, liveIds])

  const toneOf = (u: ViewUnit): TileTone => (unitState(u, liveIds) === 'to_let' ? 'to_let' : 'taken')
  const sceneGroups = (list: typeof groups): SceneGroup[] =>
    list
      .map((g) => ({ ...g, shown: onlyLet ? g.units.filter((u) => unitState(u, liveIds) === 'to_let') : g.units }))
      .filter((g) => g.shown.length > 0)

  const kindWord = isCompound ? 'Compound' : estate?.kind === 'hostel' ? 'Hostel' : estate?.kind === 'estate' && !hasFloors ? 'Estate' : 'Building'
  const selected = units.find((u) => u.id === selectedId) ?? null
  const selectedListing = selected?.listing_id ? live[selected.listing_id] : undefined
  const selectedOpen = selected ? unitState(selected, liveIds) === 'to_let' : false

  const homeLine = (u: ViewUnit) => {
    const l = u.listing_id ? live[u.listing_id] : undefined
    const rent = l ? toMoney(l.price_monthly) : null
    const beds = l ? bedroomsLabel(l.bedrooms) : null
    return [rent !== null ? `${naira(rent)} a month` : null, beds].filter(Boolean).join(' · ')
  }
  const where = (u: ViewUnit) => [(u.group_label ?? '').trim(), u.floor_no !== null ? (u.floor_no === 0 ? 'Ground floor' : `Floor ${u.floor_no}`) : ''].filter(Boolean).join(', ')

  let body: React.ReactNode
  if (state === 'loading') {
    body = (
      <div className="flex justify-center py-20" role="status" aria-label="Loading">
        <Loader2 className="animate-spin text-primary" size={28} aria-hidden />
      </div>
    )
  } else if (state === 'error') {
    body = (
      <div className="space-y-3 py-16 text-center">
        <p className="font-semibold text-foreground">We could not load this place</p>
        <p className="text-sm text-muted-foreground">This is usually temporary. Please try again.</p>
        <div className="flex justify-center gap-2">
          <button type="button" className={btnP} onClick={() => void load()}>Try again</button>
          <Link href="/search" className={btnS}>Back to search</Link>
        </div>
      </div>
    )
  } else if (state === 'notfound' || !estate) {
    body = (
      <div className="space-y-3 py-16 text-center">
        <p className="font-semibold text-foreground">Place not found</p>
        <p className="text-sm text-muted-foreground">It may have no homes to let right now, or the link may be wrong.</p>
        <Link href="/search" className={btnP}>Find a home <ArrowRight size={15} aria-hidden /></Link>
      </div>
    )
  } else {
    body = (
      <div className="space-y-6">
        <header className="overflow-hidden rounded-xl border border-border bg-card">
          {estate.cover_photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={estate.cover_photo_url} alt={`${estate.name} from outside`} className="h-44 w-full object-cover" />
          ) : (
            <div className="flex h-24 w-full items-center justify-center bg-secondary text-muted-foreground" aria-hidden>
              <Building2 size={32} />
            </div>
          )}
          <div className="space-y-1 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">{kindWord}</p>
            <h1 className="text-2xl font-bold text-foreground">{estate.name}</h1>
            {estate.address_text && (
              <p className="flex items-center gap-1 text-sm text-muted-foreground"><MapPin size={14} aria-hidden /> {estate.address_text}</p>
            )}
            <p className="pt-1 text-sm text-foreground">
              <span className="font-semibold">{units.length} {units.length === 1 ? 'home' : 'homes'}</span>
              {isCompound ? <> · <span className="font-semibold">{buildings.length} buildings</span></> : null}
              {' · '}
              <span className="font-semibold text-success">{toLet.length} to let</span>
            </p>
          </div>
        </header>

        {landlord && (
          <Link
            href={`/landlord/${landlord.id}`}
            className="focus-ring flex min-h-11 items-center gap-3 rounded-xl border border-border bg-card p-3 transition hover:bg-secondary"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground" aria-hidden>
              {landlord.name[0]}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
                <span className="truncate">{landlord.name}</span>
                {landlord.trusted && <TrustedBadge />}
              </span>
              <span className="block text-xs text-muted-foreground">Landlord. See all their properties and checks.</span>
            </span>
            <ArrowRight size={16} className="shrink-0 text-muted-foreground" aria-hidden />
          </Link>
        )}

        {/* Homes to let: the quickest way to a vacant home */}
        <section aria-labelledby="to-let-heading" className="space-y-3">
          <h2 id="to-let-heading" className="text-lg font-bold text-foreground">Homes to let ({toLet.length})</h2>
          {toLet.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
              Nothing is to let here right now. Check back later, or look at other places.
            </p>
          ) : (
            <ul className="space-y-2">
              {[...toLet].sort((a, b) => naturalSort(a.unit_label, b.unit_label)).map((u) => (
                <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card p-3">
                  <div className="min-w-0">
                    <p className="font-bold text-foreground">Unit {u.unit_label}</p>
                    <p className="text-sm text-muted-foreground">{[where(u), homeLine(u)].filter(Boolean).join(' · ') || 'Open to see the details'}</p>
                  </div>
                  <Link href={`/listing/${u.listing_id}`} className={btnS}>View home <ArrowRight size={15} aria-hidden /></Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* The picture: buildings, floors and flats */}
        <section aria-labelledby="map-heading" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="map-heading" className="text-lg font-bold text-foreground">{isCompound ? 'Buildings and flats' : 'All the homes'}</h2>
            <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-medium text-foreground">
              <input type="checkbox" checked={onlyLet} onChange={(e) => setOnlyLet(e.target.checked)} className="h-5 w-5 accent-primary" />
              Show only homes to let
            </label>
          </div>
          <p className="text-xs text-muted-foreground">Green: to let. Grey: taken or not available. Tap a home for details.</p>

          <div className="flex gap-2">
            <button type="button" className={mode === '3d' ? btnP : btnS} onClick={() => setMode('3d')}>3D view</button>
            <button type="button" className={mode === 'flat' ? btnP : btnS} onClick={() => setMode('flat')}>Flat view</button>
          </div>

          {isCompound && (
            <nav aria-label="Buildings" className="flex flex-wrap gap-2">
              {buildings.map((b, i) => {
                const inB = units.filter((u) => ((u.group_label ?? '').trim() || 'Other') === b)
                const n = inB.filter((u) => unitState(u, liveIds) === 'to_let').length
                return (
                  <a key={b} href={`#building-${i}`} className="focus-ring inline-flex min-h-11 items-center rounded-full border border-border bg-card px-4 text-sm font-semibold text-foreground hover:bg-secondary">
                    {b} <span className="ml-2 font-normal text-success">{n} to let</span>
                  </a>
                )
              })}
            </nav>
          )}

          {onlyLet && toLet.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">No homes are to let right now.</p>
          ) : mode === '3d' ? (
            <div className="space-y-6">
              {(isCompound ? buildings : [null]).map((b, i) => {
                const list = (b === null ? units : units.filter((u) => ((u.group_label ?? '').trim() || 'Other') === b))
                  .filter((u) => !onlyLet || unitState(u, liveIds) === 'to_let')
                if (list.length === 0) return null
                return (
                  <div key={b ?? 'all'} id={`building-${i}`} className="scroll-mt-24">
                    <Building3D units={list} name={b ?? estate.name} toneOf={toneOf} selectedId={selectedId} onSelect={setSelectedId} />
                  </div>
                )
              })}
            </div>
          ) : isCompound ? (
            <div className="space-y-6">
              {buildings.map((b, i) => {
                const g = sceneGroups(groups.filter((x) => x.building === b))
                if (g.length === 0) return null
                return (
                  <div key={b} id={`building-${i}`} className="scroll-mt-24">
                    <BlockScene name={b} groups={g} toneOf={toneOf} selectedId={selectedId} onSelect={setSelectedId} light="unknown" />
                  </div>
                )
              })}
            </div>
          ) : hasFloors ? (
            <BlockScene name={estate.name} groups={sceneGroups(groups)} toneOf={toneOf} selectedId={selectedId} onSelect={setSelectedId} light="unknown" />
          ) : (
            <CompoundScene name={estate.name} groups={sceneGroups(groups)} toneOf={toneOf} selectedId={selectedId} onSelect={setSelectedId} light="unknown" />
          )}
        </section>

        {/* Pop-out card: opens over the page when a home is tapped */}
        {selected && (
          <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={`Unit ${selected.unit_label}`}>
            <button type="button" aria-label="Close" className="absolute inset-0 bg-black/50" onClick={() => setSelectedId(null)} />
            <div className="relative w-full max-w-md space-y-3 rounded-t-2xl border border-border bg-card p-5 pb-8 shadow-2xl sm:rounded-2xl sm:pb-5">
              <button
                type="button"
                aria-label="Close"
                onClick={() => setSelectedId(null)}
                className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary"
              >
                <X size={20} aria-hidden />
              </button>
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">{hasFloors ? 'Flat' : 'House'}</p>
              <h3 className="pr-10 text-2xl font-bold text-foreground">{hasFloors ? 'Flat' : 'House'} {selected.unit_label}</h3>
              {where(selected) && <p className="text-sm text-muted-foreground">{where(selected)}</p>}
              {selectedOpen && selectedListing ? (
                <>
                  <span className="inline-block rounded-full bg-success/10 px-3 py-1 text-xs font-semibold text-success">To let</span>
                  <p className="font-semibold text-foreground">{displayTitle(selectedListing as any)}</p>
                  {homeLine(selected) && <p className="text-sm text-muted-foreground">{homeLine(selected)}</p>}
                  <Link href={`/listing/${selectedListing.id}`} className={`${btnP} w-full`}>View this home <ArrowRight size={15} aria-hidden /></Link>
                </>
              ) : (
                <>
                  <span className="inline-block rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-muted-foreground">Not available</span>
                  <p className="text-sm text-muted-foreground">This home is not available right now.</p>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <main className="flex-1">
        <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-6">
          <Link href="/search" className="inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft size={14} aria-hidden /> Back to search
          </Link>
          {body}
        </div>
      </main>
      <Footer />
    </div>
  )
}
