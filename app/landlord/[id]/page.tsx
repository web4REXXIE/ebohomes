'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowRight, CheckCircle2, Circle, ChevronDown } from 'lucide-react'
import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { MiniBuilding } from '@/components/mini-building'
import { TrustedBadge } from '@/components/trusted-badge'
import { supabase } from '@/lib/supabase'
import { isValidListingId } from '@/lib/listing-id'
import { countToLet, naturalSort, unitState, type ViewUnit } from '@/lib/estate-view'
import { bedroomsLabel, toMoney } from '@/lib/property-display'
import { formatInspectionDate } from '@/lib/property-trust'

type PlaceKind = 'house' | 'building' | 'compound' | 'estate' | 'hostel'

type EstateCard = {
  id: string
  name: string
  kind: string
  place: PlaceKind
  address_text: string | null
  units: ViewUnit[]
  unitCount: number
  toLet: number
  firstListingId: string | null
}

type LiveListing = { id: string; price_monthly: number | string | null; bedrooms: number | string | null }

// What the database says about this landlord's checks. Counts and dates only.
type Checks = {
  identityChecked: boolean
  identityAt: string | null
  memberSince: string | null
  liveListings: number
  documentsListings: number
  documentsAt: string | null
  authorityListings: number
  authorityAt: string | null
  inspectedListings: number
  inspectedAt: string | null
  completedRentals: number
}

const PLACE_LABEL: Record<PlaceKind, string> = {
  house: 'House',
  building: 'Building',
  compound: 'Compound',
  estate: 'Estate',
  hostel: 'Hostel',
}
const PLACE_PLURAL: Record<PlaceKind, string> = {
  house: 'Houses',
  building: 'Buildings',
  compound: 'Compounds',
  estate: 'Estates',
  hostel: 'Hostels',
}
const PLACE_ORDER: PlaceKind[] = ['compound', 'building', 'estate', 'hostel', 'house']

const PAGE_SIZE = 6
const LET_SIZE = 5

const naira = (n: number) => '₦' + n.toLocaleString('en-NG', { maximumFractionDigits: 0 })
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const dateStr = (v: unknown) => (typeof v === 'string' && !Number.isNaN(new Date(v).getTime()) ? v : null)

// A compound is a place with floors AND building names. A building has floors only.
function placeOf(kind: string, units: ViewUnit[]): PlaceKind {
  if (kind === 'single_house') return 'house'
  if (kind === 'hostel') return 'hostel'
  const hasFloors = units.some((u) => u.floor_no !== null)
  const hasBuildings = hasFloors && units.some((u) => (u.group_label ?? '').trim() !== '')
  if (hasBuildings) return 'compound'
  if (hasFloors) return 'building'
  if (kind === 'estate') return 'estate'
  return 'building'
}

function parseChecks(v: unknown): Checks | null {
  if (typeof v !== 'object' || v === null) return null
  const o = v as Record<string, unknown>
  return {
    identityChecked: o.identity_checked === true,
    identityAt: dateStr(o.identity_at),
    memberSince: dateStr(o.member_since),
    liveListings: num(o.live_listings),
    documentsListings: num(o.documents_listings),
    documentsAt: dateStr(o.documents_at),
    authorityListings: num(o.authority_listings),
    authorityAt: dateStr(o.authority_at),
    inspectedListings: num(o.inspected_listings),
    inspectedAt: dateStr(o.inspected_at),
    completedRentals: num(o.completed_rentals),
  }
}

function monthYear(iso: string | null) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-NG', { month: 'long', year: 'numeric' })
}

function CheckRow({ done, title, detail }: { done: boolean; title: string; detail: string }) {
  return (
    <li className="flex items-start gap-3 py-3">
      {done ? (
        <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-success" aria-hidden />
      ) : (
        <Circle size={18} className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden />
      )}
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">
          {title}
          <span className="sr-only">{done ? ': yes' : ': not yet'}</span>
        </p>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </div>
    </li>
  )
}

function Chip({ text }: { text: string }) {
  return (
    <a
      href="#checks"
      className="focus-ring inline-flex min-h-9 items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-3 text-xs font-semibold text-success"
    >
      <CheckCircle2 size={14} aria-hidden /> {text}
    </a>
  )
}

function Skeleton() {
  return (
    <div className="animate-pulse" aria-busy="true" aria-label="Loading profile">
      <div className="flex items-center gap-3">
        <div className="h-14 w-14 rounded-full bg-secondary" />
        <div className="flex-1 space-y-2">
          <div className="h-6 w-2/3 rounded bg-secondary" />
          <div className="h-4 w-1/3 rounded bg-secondary" />
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <div className="h-16 rounded-card bg-secondary" />
        <div className="h-16 rounded-card bg-secondary" />
        <div className="h-16 rounded-card bg-secondary" />
      </div>
      <div className="mt-6 h-40 rounded-card bg-secondary" />
      <div className="mt-6 h-48 rounded-card bg-secondary" />
    </div>
  )
}

type Filter = 'all' | 'to_let' | PlaceKind

export default function LandlordProfilePage() {
  const params = useParams<{ id: string }>()
  const ownerId = params?.id
  const [name, setName] = useState<string | null>(null)
  const [trusted, setTrusted] = useState(false)
  const [checks, setChecks] = useState<Checks | null>(null)
  const [checksFailed, setChecksFailed] = useState(false)
  const [estates, setEstates] = useState<EstateCard[]>([])
  const [live, setLive] = useState<Set<string>>(new Set())
  const [listings, setListings] = useState<Record<string, LiveListing>>({})
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [shareMsg, setShareMsg] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [shown, setShown] = useState(PAGE_SIZE)
  const [letShown, setLetShown] = useState(LET_SIZE)

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
        const liveIds = new Set<string>()
        const info: Record<string, LiveListing> = {}
        if (listingIds.length > 0) {
          const { data: l } = await supabase
            .from('listings')
            .select('id, price_monthly, bedrooms')
            .in('id', listingIds)
            .eq('status', 'approved')
          for (const row of (l ?? []) as LiveListing[]) {
            liveIds.add(row.id)
            info[row.id] = row
          }
        }
        if (cancelled) return

        const cards: EstateCard[] = rows
          .map((r) => {
            const us = r.units ?? []
            const firstLive = us.find((u) => u.listing_id && liveIds.has(u.listing_id))
            return {
              id: r.id,
              name: r.name,
              kind: r.kind,
              place: placeOf(r.kind, us),
              address_text: r.address_text,
              units: us,
              unitCount: us.length,
              toLet: countToLet(us, liveIds),
              firstListingId: firstLive?.listing_id ?? null,
            }
          })
          .filter((c) => c.unitCount > 0)
          // Places with something to let come first. Equal places keep the newest first.
          .sort((a, b) => Number(b.toLet > 0) - Number(a.toLet > 0))

        // The Trusted label and the checks are decided by the database. If a lookup fails we show nothing false.
        const [trustedRes, checksRes] = await Promise.all([
          supabase.rpc('landlord_is_trusted', { p_landlord: ownerId }),
          supabase.rpc('landlord_public_checks', { p_landlord: ownerId }),
        ])
        if (cancelled) return
        setTrusted(!trustedRes.error && trustedRes.data === true)
        const parsed = checksRes.error ? null : parseChecks(checksRes.data)
        setChecks(parsed)
        setChecksFailed(parsed === null)

        setName((p as { full_name: string | null }).full_name ?? 'Landlord')
        setLive(liveIds)
        setListings(info)
        setEstates(cards)
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

  const totalUnits = estates.reduce((a, c) => a + c.unitCount, 0)
  const totalToLet = estates.reduce((a, c) => a + c.toLet, 0)

  // The kinds of place this landlord has, so the filter only offers real choices.
  const kinds = useMemo(() => PLACE_ORDER.filter((k) => estates.some((c) => c.place === k)), [estates])
  const letPlaces = useMemo(() => estates.filter((c) => c.toLet > 0).length, [estates])

  const filtered = useMemo(() => {
    if (filter === 'all') return estates
    if (filter === 'to_let') return estates.filter((c) => c.toLet > 0)
    return estates.filter((c) => c.place === filter)
  }, [estates, filter])
  const visible = filtered.slice(0, shown)

  // Every home that is to let right now, with its place, rent and bedrooms.
  const letHomes = useMemo(() => {
    const out: { key: string; label: string; estateName: string; listingId: string; line: string }[] = []
    for (const c of estates) {
      const hasFloors = c.units.some((u) => u.floor_no !== null)
      for (const u of c.units) {
        if (unitState(u, live) !== 'to_let' || !u.listing_id) continue
        const l = listings[u.listing_id]
        const rent = l ? toMoney(l.price_monthly) : null
        const beds = l ? bedroomsLabel(l.bedrooms) : null
        const where = [(u.group_label ?? '').trim(), u.floor_no !== null ? (u.floor_no === 0 ? 'Ground floor' : `Floor ${u.floor_no}`) : ''].filter(Boolean).join(', ')
        out.push({
          key: u.id,
          label: `${hasFloors ? 'Flat' : c.place === 'hostel' ? 'Room' : 'House'} ${u.unit_label}`,
          estateName: c.name,
          listingId: u.listing_id,
          line: [where, rent !== null ? `${naira(rent)} a month` : null, beds].filter(Boolean).join(' · '),
        })
      }
    }
    return out.sort((a, b) => naturalSort(a.estateName + a.label, b.estateName + b.label))
  }, [estates, live, listings])

  const share = async () => {
    setShareMsg(null)
    try {
      const url = window.location.href
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        await navigator.share({ title: `${name ?? 'Landlord'} on EboHomes`, url })
      } else {
        await navigator.clipboard.writeText(url)
        setShareMsg('Link copied.')
      }
    } catch {
      // Closing the share sheet is not an error.
    }
  }

  const of = (n: number, total: number) => `${n} of ${total} ${total === 1 ? 'property' : 'properties'}`

  const filterOptions: { value: Filter; label: string }[] = [
    { value: 'all', label: `All (${estates.length})` },
    ...(letPlaces > 0 ? [{ value: 'to_let' as Filter, label: `To let (${letPlaces})` }] : []),
    ...(kinds.length > 1 ? kinds.map((k) => ({ value: k as Filter, label: `${PLACE_PLURAL[k]} (${estates.filter((c) => c.place === k).length})` })) : []),
  ]

  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-2xl px-4 pb-16 pt-6 sm:px-6">
        {loading && <Skeleton />}
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
            {/* Who */}
            <div className="flex items-center gap-3">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary text-lg font-bold text-primary-foreground" aria-hidden>
                {(name ?? 'L')[0]}
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="truncate text-2xl font-bold text-foreground">{name}</h1>
                <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  Landlord on EboHomes {trusted && <TrustedBadge />}
                </p>
              </div>
              <button
                type="button"
                onClick={share}
                className="focus-ring min-h-11 shrink-0 rounded-button border border-border bg-card px-4 text-sm font-semibold text-foreground hover:bg-secondary"
              >
                Share
              </button>
            </div>
            {shareMsg && <p role="status" className="mt-2 text-sm text-success">{shareMsg}</p>}

            {/* Badges: only checks that are really done */}
            {checks && (checks.identityChecked || checks.documentsListings > 0 || checks.authorityListings > 0 || checks.inspectedListings > 0 || checks.completedRentals > 0) && (
              <div className="mt-3 flex flex-wrap gap-2" aria-label="Checks at a glance">
                {checks.identityChecked && <Chip text="Identity checked" />}
                {checks.documentsListings > 0 && <Chip text="Documents reviewed" />}
                {checks.authorityListings > 0 && <Chip text="Authority reviewed" />}
                {checks.inspectedListings > 0 && <Chip text="Inspected" />}
                {checks.completedRentals > 0 && <Chip text={`${checks.completedRentals} ${checks.completedRentals === 1 ? 'rental' : 'rentals'} completed`} />}
              </div>
            )}

            {/* Numbers */}
            <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-card border border-border bg-card p-3">
                <dd className="text-xl font-bold text-foreground">{estates.length}</dd>
                <dt className="text-xs text-muted-foreground">{estates.length === 1 ? 'Property' : 'Properties'}</dt>
              </div>
              <div className="rounded-card border border-border bg-card p-3">
                <dd className="text-xl font-bold text-foreground">{totalUnits}</dd>
                <dt className="text-xs text-muted-foreground">{totalUnits === 1 ? 'Home' : 'Homes'}</dt>
              </div>
              <div className="rounded-card border border-border bg-card p-3">
                <dd className="text-xl font-bold text-success">{totalToLet}</dd>
                <dt className="text-xs text-muted-foreground">To let</dt>
              </div>
            </dl>

            {trusted && (
              <p className="mt-4 rounded-card border border-primary/30 bg-primary/5 p-3 text-xs text-foreground">
                Trusted is earned, not bought. This landlord has completed several rentals through EboHomes where both sides confirmed the key handover, and has no upheld problems on record.
              </p>
            )}

            {/* Homes to let now: the quickest way to a vacant home */}
            {letHomes.length > 0 && (
              <section aria-labelledby="let-now" className="mt-6">
                <h2 id="let-now" className="text-base font-semibold text-foreground">Homes to let now ({letHomes.length})</h2>
                <ul className="mt-2 space-y-2">
                  {letHomes.slice(0, letShown).map((h) => (
                    <li key={h.key}>
                      <Link
                        href={`/listing/${h.listingId}`}
                        className="focus-ring flex min-h-14 items-center justify-between gap-3 rounded-card border border-border bg-card p-3 transition hover:bg-secondary"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-bold text-foreground">{h.label}, {h.estateName}</span>
                          {h.line && <span className="block truncate text-xs text-muted-foreground">{h.line}</span>}
                        </span>
                        <ArrowRight size={16} className="shrink-0 text-muted-foreground" aria-hidden />
                      </Link>
                    </li>
                  ))}
                </ul>
                {letHomes.length > letShown && (
                  <button
                    type="button"
                    onClick={() => setLetShown((n) => n + LET_SIZE)}
                    className="focus-ring mx-auto mt-3 flex min-h-11 items-center gap-1.5 rounded-full border border-border bg-card px-5 text-sm font-semibold text-foreground hover:bg-secondary"
                  >
                    Show more <ChevronDown size={14} aria-hidden />
                    <span className="text-xs font-normal text-muted-foreground">({letHomes.length - letShown} left)</span>
                  </button>
                )}
              </section>
            )}

            {/* Properties */}
            <section aria-labelledby="properties" className="mt-8">
              <h2 id="properties" className="text-base font-semibold text-foreground">Properties and lodges</h2>

              {filterOptions.length > 1 && (
                <div role="group" aria-label="Filter properties" className="-mx-1 mt-2 flex gap-2 overflow-x-auto px-1 pb-1">
                  {filterOptions.map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      aria-pressed={filter === o.value}
                      onClick={() => {
                        setFilter(o.value)
                        setShown(PAGE_SIZE)
                      }}
                      className={`focus-ring min-h-11 shrink-0 whitespace-nowrap rounded-full px-4 text-xs font-medium transition-colors ${
                        filter === o.value ? 'bg-primary text-primary-foreground' : 'bg-secondary text-foreground'
                      }`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              )}

              {estates.length === 0 && <p className="mt-2 text-sm text-muted-foreground">Nothing is listed right now.</p>}
              {estates.length > 0 && filtered.length === 0 && (
                <p className="mt-2 text-sm text-muted-foreground">Nothing here right now. Choose All to see every property.</p>
              )}

              <div className="mt-3 space-y-3">
                {visible.map((c) => {
                  const href = c.place === 'house' && c.firstListingId ? `/listing/${c.firstListingId}` : `/estate/${c.id}`
                  const word = PLACE_LABEL[c.place].toLowerCase()
                  return (
                    <div key={c.id} className="rounded-card border border-border bg-card p-4 transition-shadow hover:shadow-rest">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-foreground">{c.name}</p>
                          {c.address_text && <p className="truncate text-xs text-muted-foreground">{c.address_text}</p>}
                        </div>
                        <span className="shrink-0 rounded-chip bg-secondary px-2 py-0.5 text-xs font-semibold text-foreground">{PLACE_LABEL[c.place]}</span>
                      </div>
                      <div className="mt-3">
                        <MiniBuilding units={c.units} live={live} kind={c.kind} />
                      </div>
                      <p className="mt-2 text-sm text-foreground">
                        {c.unitCount} {c.unitCount === 1 ? 'home' : 'homes'} · <span className={c.toLet > 0 ? 'font-semibold text-success' : 'text-muted-foreground'}>{c.toLet > 0 ? `${c.toLet} to let` : 'None to let'}</span>
                      </p>
                      <Link
                        href={href}
                        className="focus-ring mt-3 flex min-h-11 items-center justify-center gap-2 rounded-button bg-primary px-4 text-sm font-bold text-primary-foreground"
                      >
                        {c.place === 'house' ? 'See this home' : `Explore the ${word} in 3D`}
                        <ArrowRight size={15} aria-hidden />
                      </Link>
                    </div>
                  )
                })}
              </div>

              {filtered.length > shown && (
                <button
                  type="button"
                  onClick={() => setShown((n) => n + PAGE_SIZE)}
                  className="focus-ring mx-auto mt-4 flex min-h-11 items-center gap-1.5 rounded-full border border-border bg-card px-5 text-sm font-semibold text-foreground hover:bg-secondary"
                >
                  Show more <ChevronDown size={14} aria-hidden />
                  <span className="text-xs font-normal text-muted-foreground">({filtered.length - shown} left)</span>
                </button>
              )}
            </section>

            {/* Verifications */}
            <section id="checks" aria-labelledby="checks-heading" className="mt-8 scroll-mt-24">
              <h2 id="checks-heading" className="text-base font-semibold text-foreground">Checks by EboHomes</h2>
              {checksFailed || !checks ? (
                <p className="mt-2 rounded-card border border-border bg-card p-3 text-sm text-muted-foreground">
                  Could not load the checks. Refresh the page to try again.
                </p>
              ) : (
                <>
                  <ul className="mt-2 divide-y divide-border rounded-card border border-border bg-card px-4">
                    <CheckRow
                      done={checks.identityChecked}
                      title="Identity checked"
                      detail={checks.identityChecked ? (checks.identityAt ? `Checked on ${formatInspectionDate(checks.identityAt)}` : 'Checked by EboHomes') : 'Not checked yet'}
                    />
                    <CheckRow
                      done={checks.documentsListings > 0}
                      title="Property documents reviewed"
                      detail={checks.documentsListings > 0 ? `${of(checks.documentsListings, checks.liveListings)}${checks.documentsAt ? `. Latest on ${formatInspectionDate(checks.documentsAt)}` : ''}` : 'No reviewed documents yet'}
                    />
                    <CheckRow
                      done={checks.authorityListings > 0}
                      title="Listing authority reviewed"
                      detail={checks.authorityListings > 0 ? `${of(checks.authorityListings, checks.liveListings)}${checks.authorityAt ? `. Latest on ${formatInspectionDate(checks.authorityAt)}` : ''}` : 'Not reviewed yet'}
                    />
                    <CheckRow
                      done={checks.inspectedListings > 0}
                      title="Inspected by EboHomes"
                      detail={checks.inspectedListings > 0 ? `${of(checks.inspectedListings, checks.liveListings)}${checks.inspectedAt ? `. Latest on ${formatInspectionDate(checks.inspectedAt)}` : ''}` : 'No inspections yet'}
                    />
                  </ul>
                  <p className="mt-2 text-xs text-muted-foreground">
                    These are checks EboHomes did, with their dates. They are not a promise about ownership. Each listing shows its own checks.
                  </p>

                  <dl className="mt-4 grid grid-cols-2 gap-2">
                    <div className="rounded-card border border-border bg-card p-3">
                      <dd className="text-lg font-bold text-foreground">{checks.completedRentals}</dd>
                      <dt className="text-xs text-muted-foreground">Rentals completed on EboHomes</dt>
                    </div>
                    <div className="rounded-card border border-border bg-card p-3">
                      <dd className="text-lg font-bold text-foreground">{checks.memberSince ? monthYear(checks.memberSince) : 'Not shown'}</dd>
                      <dt className="text-xs text-muted-foreground">Member since</dt>
                    </div>
                  </dl>
                </>
              )}
            </section>

            <p className="mt-4 rounded-card border border-border bg-card p-3 text-xs text-muted-foreground">
              No phone numbers are shown here. EboHomes is the only channel.
            </p>
          </>
        )}
      </main>
      <Footer />
    </>
  )
}
