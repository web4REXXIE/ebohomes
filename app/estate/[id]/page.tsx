'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Building2, Home, Minus, Plus, Trees } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import {
  buildUnits, floorWord, MAX_FLOORS, MAX_PER_FLOOR,
  type EstateKind, type UnitDraft,
} from '@/lib/unit-numbering'

type UnitRow = { id: string; unit_label: string; floor_no: number | null; group_label: string | null; status: string; listing_id: string | null }
type EstateRow = { id: string; name: string; kind: string; address_text: string | null; legacy_listing_id: string | null; units: UnitRow[] | null }
type MyListing = { id: string; title: string | null; location_text: string | null; status: string | null }

// Stage A (Idea 1): one place to list a property, in plain words.
// Landlords see "flat", "house" and "room". The database keeps its own names (estate, unit).
// Choice 1 (one house or flat) goes straight to the listing form. Choice 3 (compound) comes in Stage D.
type Choice = 'single' | 'building' | 'compound' | 'houses'

const KIND_LABEL: Record<string, string> = {
  single_house: 'One house or flat',
  block: 'Building with flats or rooms',
  estate: 'Estate of houses or duplexes',
  hostel: 'Building with rooms',
}

const input = 'focus-ring min-h-11 w-full rounded-button border border-border bg-card px-3 text-sm'

function toNum(s: string): number | undefined {
  return s.trim() === '' ? undefined : Number(s)
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

function noun(kind: string): [string, string] {
  if (kind === 'estate') return ['house', 'houses']
  if (kind === 'hostel') return ['room', 'rooms']
  return ['flat', 'flats']
}

function tileClass(u: UnitRow): string {
  if (!u.listing_id) return 'border border-dashed border-border bg-card text-muted-foreground'
  if (u.status === 'available') return 'border border-success bg-card text-success'
  return 'border border-transparent bg-muted text-muted-foreground'
}

function tileNote(u: UnitRow): string {
  if (!u.listing_id) return 'Not listed yet'
  if (u.status === 'available') return 'To let'
  if (u.status === 'reserved') return 'Reserved'
  if (u.status === 'rented') return 'Taken'
  return 'Off market'
}

function listingName(l: MyListing): string {
  const t = (l.title ?? '').trim()
  return t !== '' ? t : 'Untitled home'
}

// A number with minus and plus buttons. Easier than typing on a phone.
function Stepper({ label, value, onChange, min, max }: { label: string; value: string; onChange: (v: string) => void; min: number; max: number }) {
  const n = Number.parseInt(value, 10)
  const current = Number.isFinite(n) ? n : 0
  const set = (v: number) => onChange(String(Math.min(max, Math.max(min, v))))
  return (
    <div>
      <p className="mb-1 text-sm font-semibold text-foreground">{label}</p>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => set(current - 1)} disabled={current <= min} aria-label={`Fewer: ${label}`} className="focus-ring flex h-11 w-11 items-center justify-center rounded-button border border-border bg-card text-foreground disabled:opacity-40">
          <Minus size={16} aria-hidden />
        </button>
        <input
          className={`${input} text-center font-semibold`}
          inputMode="numeric"
          aria-label={label}
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
        />
        <button type="button" onClick={() => set(current + 1)} disabled={current >= max} aria-label={`More: ${label}`} className="focus-ring flex h-11 w-11 items-center justify-center rounded-button border border-border bg-card text-foreground disabled:opacity-40">
          <Plus size={16} aria-hidden />
        </button>
      </div>
    </div>
  )
}

export default function ListAPropertyPage() {
  const [estates, setEstates] = useState<EstateRow[]>([])
  const [myListings, setMyListings] = useState<MyListing[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  const [choice, setChoice] = useState<Choice | null>(null)
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [floors, setFloors] = useState('4')
  const [perFloor, setPerFloor] = useState('4')
  const [more, setMore] = useState(false)
  const [differ, setDiffer] = useState(false)
  const [hasGround, setHasGround] = useState(false)
  const [groundStr, setGroundStr] = useState('')
  const [floorCountsStr, setFloorCountsStr] = useState<string[]>([])
  const [count, setCount] = useState('10')
  const [groupLabel, setGroupLabel] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  // Attach an existing listing to an empty flat or house
  const [pickUnit, setPickUnit] = useState<{ id: string; label: string; estateName: string } | null>(null)
  const [pickListingId, setPickListingId] = useState<string | null>(null)
  const [attaching, setAttaching] = useState(false)
  const [attachMsg, setAttachMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const loadEstates = async () => {
    setLoading(true)
    setLoadError(false)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setLoading(false)
      return
    }
    const [estatesResult, listingsResult] = await Promise.all([
      supabase
        .from('estates')
        .select('id, name, kind, address_text, legacy_listing_id, units(id, unit_label, floor_no, group_label, status, listing_id)')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('listings')
        .select('id, title, location_text, status')
        .eq('landlord_id', user.id)
        .order('created_at', { ascending: false }),
    ])
    if (estatesResult.error) setLoadError(true)
    else setEstates((estatesResult.data ?? []) as unknown as EstateRow[])
    // The listing list only feeds the attach panel. If it fails, the rest of the page still works.
    if (!listingsResult.error) setMyListings((listingsResult.data ?? []) as MyListing[])
    setLoading(false)
  }

  useEffect(() => {
    loadEstates()
  }, [])

  // The database kind behind each plain choice.
  const kind: EstateKind = choice === 'houses' ? 'estate' : 'block'

  const floorsNum = toNum(floors)
  const floorCountsNums = useMemo(() => {
    if (kind !== 'block' || !differ) return undefined
    if (floorsNum === undefined || !Number.isInteger(floorsNum) || floorsNum < 1) return undefined
    return Array.from({ length: Math.min(floorsNum, MAX_FLOORS) }, (_, i) => {
      const own = floorCountsStr[i]
      return toNum(own !== undefined && own.trim() !== '' ? own : perFloor) ?? NaN
    })
  }, [kind, differ, floorsNum, floorCountsStr, perFloor])

  const built = useMemo(
    () => buildUnits({
      kind,
      floors: floorsNum,
      perFloor: toNum(perFloor),
      floorCounts: floorCountsNums,
      groundCount: kind === 'block' && hasGround ? (toNum(groundStr) ?? NaN) : undefined,
      count: toNum(count),
      groupLabel,
    }),
    [kind, floorsNum, perFloor, floorCountsNums, hasGround, groundStr, count, groupLabel],
  )

  const units: UnitDraft[] = built.units
  const unitCount = units.length
  const [one, many] = noun(kind)

  const resetForm = () => {
    setName('')
    setAddress('')
    setFloors('4')
    setPerFloor('4')
    setMore(false)
    setDiffer(false)
    setHasGround(false)
    setGroundStr('')
    setFloorCountsStr([])
    setCount('10')
    setGroupLabel('')
  }

  const create = async () => {
    setMsg(null)
    if (name.trim().length < 1) {
      setMsg({ ok: false, text: 'Enter a name for this place.' })
      return
    }
    if (built.error) {
      setMsg({ ok: false, text: built.error })
      return
    }
    setSaving(true)
    const { error } = await supabase.rpc('create_estate_with_units', {
      p_name: name.trim(),
      p_kind: kind,
      p_address: address.trim() || null,
      p_units: units,
    })
    setSaving(false)
    if (error) {
      setMsg({ ok: false, text: error.message || 'Could not save this place. Try again.' })
      return
    }
    setMsg({ ok: true, text: `Saved. ${plural(unitCount, one, many)} added to your places below. Nothing is public until you list one.` })
    resetForm()
    setChoice(null)
    loadEstates()
  }

  const ownEstates = estates.filter((e) => !e.legacy_listing_id)
  const singleCount = estates.length - ownEstates.length

  // Listings that are not yet on one of the owner's own places. A listing that only sits on its automatic
  // single-house record can be moved. The database does the move.
  const placedIds = useMemo(() => {
    const ids = new Set<string>()
    for (const e of ownEstates) for (const u of e.units ?? []) if (u.listing_id) ids.add(u.listing_id)
    return ids
  }, [ownEstates])
  const attachable = myListings.filter((l) => !placedIds.has(l.id))

  const openPicker = (u: UnitRow, estateName: string) => {
    setPickUnit({ id: u.id, label: u.unit_label, estateName })
    setPickListingId(null)
    setAttachMsg(null)
  }

  const attach = async () => {
    if (!pickUnit || !pickListingId) return
    setAttaching(true)
    setAttachMsg(null)
    const { error } = await supabase.rpc('attach_listing_to_unit', { p_unit: pickUnit.id, p_listing: pickListingId })
    setAttaching(false)
    if (error) {
      setAttachMsg({ ok: false, text: error.message || 'Could not attach the listing. Try again.' })
      return
    }
    setMsg({ ok: true, text: `The listing is now on ${pickUnit.label}, ${pickUnit.estateName}. Tenants see it once the listing is live.` })
    setPickUnit(null)
    setPickListingId(null)
    loadEstates()
  }

  // Preview: top floors first, then "...", then the bottom floor. Houses show the first few numbers.
  const previewRows: { label: string; tiles: string[] }[] = []
  let previewMore = false
  if (!built.error && choice !== null && choice !== 'single' && choice !== 'compound') {
    if (kind === 'block') {
      const byFloor = new Map<number, string[]>()
      for (const u of units) {
        const f = u.floor_no ?? 0
        byFloor.set(f, [...(byFloor.get(f) ?? []), u.unit_label])
      }
      const order = [...byFloor.keys()].sort((a, b) => b - a)
      const shown = order.length > 4 ? [...order.slice(0, 2), ...order.slice(-1)] : order
      previewMore = order.length > 4
      for (const f of shown) previewRows.push({ label: floorWord(f), tiles: byFloor.get(f) ?? [] })
    } else {
      previewRows.push({ label: '', tiles: units.slice(0, 12).map((u) => u.unit_label) })
      previewMore = units.length > 12
    }
  }

  const cardBase = 'focus-ring flex min-h-20 w-full items-center gap-3 rounded-card border border-border bg-card p-4 text-left hover:bg-secondary'

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">List a property</h1>
        <p className="mt-1 text-sm text-muted-foreground">Tell us what you are adding. You add photos and rent for each one after this.</p>
      </div>

      {choice === null && (
        <section className="space-y-3" aria-label="What are you adding?">
          <h2 className="text-lg font-bold text-foreground">What are you adding?</h2>

          <Link href="/list-property" className={cardBase}>
            <Home size={22} aria-hidden className="shrink-0 text-primary" />
            <span className="flex-1">
              <span className="block text-sm font-semibold text-foreground">One house or flat</span>
              <span className="block text-xs text-muted-foreground">List it straight away.</span>
            </span>
            <ArrowRight size={16} aria-hidden className="text-muted-foreground" />
          </Link>

          <button type="button" onClick={() => { setChoice('building'); setMsg(null) }} className={cardBase}>
            <Building2 size={22} aria-hidden className="shrink-0 text-primary" />
            <span className="flex-1">
              <span className="block text-sm font-semibold text-foreground">A building with flats or rooms</span>
              <span className="block text-xs text-muted-foreground">A block, a lodge or a hostel.</span>
            </span>
            <ArrowRight size={16} aria-hidden className="text-muted-foreground" />
          </button>

          <div className="flex min-h-20 w-full items-center gap-3 rounded-card border border-dashed border-border bg-card p-4 opacity-70">
            <Building2 size={22} aria-hidden className="shrink-0 text-muted-foreground" />
            <span className="flex-1">
              <span className="block text-sm font-semibold text-foreground">A compound with several buildings</span>
              <span className="block text-xs text-muted-foreground">Coming soon. For now, add each building on its own.</span>
            </span>
          </div>

          <button type="button" onClick={() => { setChoice('houses'); setMsg(null) }} className={cardBase}>
            <Trees size={22} aria-hidden className="shrink-0 text-primary" />
            <span className="flex-1">
              <span className="block text-sm font-semibold text-foreground">An estate of houses or duplexes</span>
              <span className="block text-xs text-muted-foreground">Numbered 1, 2, 3 and so on.</span>
            </span>
            <ArrowRight size={16} aria-hidden className="text-muted-foreground" />
          </button>
        </section>
      )}

      {msg && choice === null && (
        <p role="status" className={`rounded-card border p-3 text-sm ${msg.ok ? 'border-success bg-success-soft text-success' : 'border-danger bg-danger-soft text-danger'}`}>
          {msg.text}
        </p>
      )}

      {(choice === 'building' || choice === 'houses') && (
        <section className="space-y-4 rounded-card border border-border bg-card p-4" aria-label="Add a place">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-foreground">{choice === 'building' ? 'Your building' : 'Your estate'}</h2>
            <button type="button" onClick={() => { setChoice(null); setMsg(null) }} className="focus-ring min-h-11 rounded-button px-3 text-sm font-semibold text-primary">Back</button>
          </div>

          <label className="block text-sm font-semibold text-foreground">
            Name
            <input className={`${input} mt-1 font-normal`} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="For example: Maker Man's Lodge" />
          </label>

          <label className="block text-sm font-semibold text-foreground">
            Street or landmark <span className="font-normal text-muted-foreground">(optional)</span>
            <input className={`${input} mt-1 font-normal`} value={address} maxLength={200} onChange={(e) => setAddress(e.target.value)} />
          </label>

          {choice === 'building' && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Stepper label="Floors above the ground" value={floors} onChange={setFloors} min={1} max={MAX_FLOORS} />
                <Stepper label="Flats on each floor" value={perFloor} onChange={setPerFloor} min={1} max={MAX_PER_FLOOR} />
              </div>

              <button type="button" onClick={() => setMore(!more)} aria-expanded={more} className="focus-ring min-h-11 text-sm font-semibold text-primary underline">
                {more ? 'Hide extra options' : 'Ground floor has flats, or floors are different?'}
              </button>

              {more && (
                <div className="space-y-3 rounded-card border border-border bg-background p-3">
                  <label className="flex min-h-11 items-center gap-3 text-sm text-foreground">
                    <input type="checkbox" className="h-5 w-5" checked={hasGround} onChange={(e) => setHasGround(e.target.checked)} />
                    The ground floor has flats too
                  </label>
                  {hasGround && (
                    <Stepper label="Flats on the ground floor" value={groundStr} onChange={setGroundStr} min={0} max={MAX_PER_FLOOR} />
                  )}
                  <label className="flex min-h-11 items-center gap-3 text-sm text-foreground">
                    <input type="checkbox" className="h-5 w-5" checked={differ} onChange={(e) => setDiffer(e.target.checked)} />
                    Some floors have a different number of flats
                  </label>
                  {differ && floorsNum !== undefined && Number.isInteger(floorsNum) && floorsNum >= 1 && floorsNum <= MAX_FLOORS && (
                    <div className="grid grid-cols-3 gap-2">
                      {Array.from({ length: floorsNum }, (_, i) => (
                        <label key={i} className="block text-xs text-muted-foreground">
                          {floorWord(i + 1)} floor
                          <input
                            className={`${input} mt-1 text-foreground`}
                            inputMode="numeric"
                            value={floorCountsStr[i] ?? ''}
                            placeholder={perFloor || '0'}
                            onChange={(e) => {
                              const next = [...floorCountsStr]
                              next[i] = e.target.value.replace(/\D/g, '')
                              setFloorCountsStr(next)
                            }}
                          />
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {choice === 'houses' && (
            <div className="space-y-3">
              <Stepper label="How many houses?" value={count} onChange={setCount} min={1} max={300} />
              <label className="block text-sm font-semibold text-foreground">
                Street or phase <span className="font-normal text-muted-foreground">(optional)</span>
                <input className={`${input} mt-1 font-normal`} value={groupLabel} maxLength={60} onChange={(e) => setGroupLabel(e.target.value)} placeholder="Phase 1" />
              </label>
            </div>
          )}

          <div className="rounded-card border border-border bg-background p-3" aria-live="polite">
            {built.error ? (
              <p className="text-xs text-muted-foreground">{built.error}</p>
            ) : (
              <>
                <p className="text-sm font-semibold text-foreground">
                  That makes {plural(unitCount, one, many)}.{' '}
                  <span className="font-normal text-muted-foreground">
                    {choice === 'building' ? 'We number them 1A, 1B, 2A and so on.' : `We number them 1 to ${unitCount}.`}
                  </span>
                </p>
                <div className="mt-2 space-y-1.5">
                  {previewRows.map((row, i) => (
                    <div key={i}>
                      {previewMore && kind === 'block' && i === 2 && <p className="py-0.5 pl-12 text-xs text-muted-foreground">...</p>}
                      <div className="flex items-start gap-2">
                        {row.label !== '' && <span className="w-10 shrink-0 pt-1.5 text-xs text-muted-foreground">{row.label}</span>}
                        <div className="flex flex-wrap gap-1.5">
                          {row.tiles.map((t) => (
                            <span key={t} className="rounded-chip bg-secondary px-2.5 py-1 text-xs font-semibold text-primary">{t}</span>
                          ))}
                          {kind !== 'block' && previewMore && <span className="px-1 py-1 text-xs text-muted-foreground">... to {units[units.length - 1]?.unit_label}</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={create}
            disabled={saving}
            className="focus-ring min-h-12 w-full rounded-button bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save this place'}
          </button>
          {msg && !msg.ok && (
            <p role="alert" className="rounded-card border border-danger bg-danger-soft p-3 text-sm text-danger">{msg.text}</p>
          )}
          <p className="text-xs text-muted-foreground">You do not have to list every {one} today. Nothing goes public until you list one and EboHomes reviews it.</p>
        </section>
      )}

      <section className="space-y-3" aria-label="Your places">
        <h2 className="text-lg font-bold text-foreground">Your places</h2>
        {loading && <p className="text-sm text-muted-foreground">Loading...</p>}
        {loadError && <p className="text-sm text-danger">Could not load your places. Refresh the page.</p>}
        {!loading && !loadError && ownEstates.length === 0 && (
          <p className="rounded-card border border-border bg-card p-4 text-sm text-muted-foreground">Nothing here yet. Choose what you are adding above.</p>
        )}

        {pickUnit && (
          <div role="dialog" aria-label={`Attach a listing to ${pickUnit.label}`} className="space-y-3 rounded-card border-2 border-primary bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-foreground">{pickUnit.label}, {pickUnit.estateName}</p>
                <p className="text-xs text-muted-foreground">Choose the listing for this one.</p>
              </div>
              <button type="button" onClick={() => setPickUnit(null)} className="focus-ring min-h-11 shrink-0 rounded-button px-3 text-sm font-semibold text-primary">Close</button>
            </div>

            {attachable.length === 0 ? (
              <p className="rounded-card border border-border bg-background p-3 text-sm text-muted-foreground">
                You have no listing waiting. Create a new listing, then come back here to attach it.
              </p>
            ) : (
              <div className="space-y-2">
                {attachable.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => setPickListingId(l.id)}
                    aria-pressed={pickListingId === l.id}
                    className={`focus-ring w-full rounded-button border px-3 py-2 text-left ${pickListingId === l.id ? 'border-primary bg-secondary' : 'border-border bg-card'}`}
                  >
                    <span className="block text-sm font-semibold text-foreground">{listingName(l)}</span>
                    <span className="block text-xs text-muted-foreground">
                      {l.location_text ? `${l.location_text} · ` : ''}{l.status ?? 'status unknown'}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {attachMsg && (
              <p role="alert" className={`rounded-card border p-3 text-sm ${attachMsg.ok ? 'border-success bg-success-soft text-success' : 'border-danger bg-danger-soft text-danger'}`}>
                {attachMsg.text}
              </p>
            )}

            <button
              type="button"
              onClick={attach}
              disabled={attaching || !pickListingId}
              className="focus-ring min-h-12 w-full rounded-button bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-50"
            >
              {attaching ? 'Attaching...' : 'Use this listing here'}
            </button>
            <p className="text-xs text-muted-foreground">
              A listing sits on one flat or house.{' '}
              <Link href="/list-property" className="font-semibold text-primary underline">Create a new listing</Link>{' '}
              first if you do not have one yet.
            </p>
          </div>
        )}

        {ownEstates.map((e) => {
          const [oneE, manyE] = noun(e.kind)
          const us = [...(e.units ?? [])].sort((a, b) => (b.floor_no ?? 0) - (a.floor_no ?? 0) || a.unit_label.localeCompare(b.unit_label, undefined, { numeric: true }))
          const shown = us.slice(0, 48)
          return (
            <div key={e.id} className="rounded-card border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-foreground">{e.name}</p>
                  <p className="text-xs text-muted-foreground">{KIND_LABEL[e.kind] ?? e.kind}{e.address_text ? `, ${e.address_text}` : ''}</p>
                </div>
                <p className="shrink-0 text-xs text-muted-foreground">{plural(us.length, oneE, manyE)}</p>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {shown.map((u) => (
                  u.listing_id ? (
                    <span key={u.id} title={tileNote(u)} className={`rounded-button px-2.5 py-1 text-xs font-semibold ${tileClass(u)}`}>{u.unit_label}</span>
                  ) : (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => openPicker(u, e.name)}
                      title="Use a listing for this one"
                      aria-label={`${u.unit_label}, not listed yet. Choose a listing for it`}
                      className={`focus-ring inline-flex min-h-11 items-center rounded-button px-3 text-xs font-semibold ${tileClass(u)}`}
                    >
                      {u.unit_label}
                    </button>
                  )
                ))}
                {us.length > shown.length && <span className="px-1 py-1 text-xs text-muted-foreground">+{us.length - shown.length} more</span>}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">Dashed means not listed yet. Tap one to choose a listing for it.</p>
            </div>
          )
        })}
        {singleCount > 0 && (
          <p className="text-xs text-muted-foreground">
            {singleCount} single {singleCount === 1 ? 'property is' : 'properties are'} in <Link href="/dashboard/listings" className="font-semibold text-primary underline">My Properties</Link>.
          </p>
        )}
      </section>
    </div>
  )
}
