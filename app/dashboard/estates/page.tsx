'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import {
  buildUnits, floorWord, MAX_FLOORS, MAX_PER_FLOOR,
  type EstateKind, type UnitDraft,
} from '@/lib/unit-numbering'

type UnitRow = { id: string; unit_label: string; floor_no: number | null; group_label: string | null; status: string; listing_id: string | null }
type EstateRow = { id: string; name: string; kind: string; address_text: string | null; legacy_listing_id: string | null; units: UnitRow[] | null }
type MyListing = { id: string; title: string | null; location_text: string | null; status: string | null }

const KINDS: { value: EstateKind; label: string }[] = [
  { value: 'single_house', label: 'Single house' },
  { value: 'block', label: 'Block of flats' },
  { value: 'estate', label: 'Estate of houses or duplexes' },
  { value: 'hostel', label: 'Hostel' },
]
const KIND_LABEL: Record<string, string> = Object.fromEntries(KINDS.map((k) => [k.value, k.label]))

const input = 'focus-ring min-h-11 w-full rounded-button border border-border bg-card px-3 text-sm'
const chipBase = 'focus-ring min-h-11 rounded-button border px-3 text-sm font-semibold'

function toNum(s: string): number | undefined {
  return s.trim() === '' ? undefined : Number(s)
}

function tileClass(u: UnitRow): string {
  if (!u.listing_id) return 'border border-dashed border-border bg-card text-muted-foreground'
  if (u.status === 'available') return 'border border-success bg-card text-success'
  return 'border border-transparent bg-muted text-muted-foreground'
}

function tileNote(u: UnitRow): string {
  if (!u.listing_id) return 'No listing yet'
  if (u.status === 'available') return 'To let'
  if (u.status === 'reserved') return 'Reserved'
  if (u.status === 'rented') return 'Taken'
  return 'Off market'
}

function listingName(l: MyListing): string {
  const t = (l.title ?? '').trim()
  return t !== '' ? t : 'Untitled home'
}

export default function EstatesPage() {
  const [estates, setEstates] = useState<EstateRow[]>([])
  const [myListings, setMyListings] = useState<MyListing[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  const [kind, setKind] = useState<EstateKind>('block')
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [floors, setFloors] = useState('')
  const [perFloor, setPerFloor] = useState('')
  const [differ, setDiffer] = useState(false)
  const [hasGround, setHasGround] = useState(false)
  const [groundStr, setGroundStr] = useState('')
  const [floorCountsStr, setFloorCountsStr] = useState<string[]>([])
  const [count, setCount] = useState('')
  const [groupLabel, setGroupLabel] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  // Attach a listing to an empty unit
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
      setMsg({ ok: false, text: error.message || 'Could not create the units. Try again.' })
      return
    }
    setMsg({ ok: true, text: `Created ${unitCount} ${unitCount === 1 ? 'unit' : 'units'}. They stay private until you list them.` })
    setName('')
    setAddress('')
    setFloors('')
    setPerFloor('')
    setDiffer(false)
    setHasGround(false)
    setGroundStr('')
    setFloorCountsStr([])
    setCount('')
    setGroupLabel('')
    loadEstates()
  }

  const ownEstates = estates.filter((e) => !e.legacy_listing_id)
  const singleCount = estates.length - ownEstates.length

  // Listings that are not yet on one of the owner's own estates. A listing that only sits on its automatic
  // single-house unit can be moved. The database does the move.
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
    setMsg({ ok: true, text: `The listing is now on unit ${pickUnit.label}, ${pickUnit.estateName}. Tenants see the unit once the listing is live.` })
    setPickUnit(null)
    setPickListingId(null)
    loadEstates()
  }

  // Preview: top floors first, then "...", then the bottom floor. Estates and hostels show the first few numbers.
  const previewRows: { label: string; tiles: string[] }[] = []
  let previewMore = false
  if (!built.error) {
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

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Add your place</h1>
        <p className="mt-1 text-sm text-muted-foreground">Number every unit once. You add photos and rent later.</p>
      </div>

      <section className="space-y-4 rounded-card border border-border bg-card p-4" aria-label="Add an estate">
        <div>
          <p className="mb-2 text-sm font-semibold text-foreground">What is it?</p>
          <div className="grid grid-cols-2 gap-2">
            {KINDS.map((k) => (
              <button
                key={k.value}
                type="button"
                onClick={() => { setKind(k.value); setMsg(null) }}
                aria-pressed={kind === k.value}
                className={`${chipBase} ${kind === k.value ? 'border-primary bg-secondary text-primary' : 'border-border bg-card text-foreground'}`}
              >
                {k.label}
              </button>
            ))}
          </div>
        </div>

        <label className="block text-sm font-semibold text-foreground">
          Name
          <input className={`${input} mt-1 font-normal`} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="For example: Maker Man's Lodge" />
        </label>

        <label className="block text-sm font-semibold text-foreground">
          Street or landmark <span className="font-normal text-muted-foreground">(optional)</span>
          <input className={`${input} mt-1 font-normal`} value={address} maxLength={200} onChange={(e) => setAddress(e.target.value)} />
        </label>

        {kind === 'block' && (
          <div className="space-y-3">
            <p className="text-sm font-semibold text-foreground">How many floors, and flats on each?</p>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs text-muted-foreground">
                Floors
                <input className={`${input} mt-1 text-foreground`} inputMode="numeric" value={floors} onChange={(e) => setFloors(e.target.value.replace(/\D/g, ''))} placeholder="10" />
              </label>
              <label className="block text-xs text-muted-foreground">
                Flats per floor
                <input className={`${input} mt-1 text-foreground`} inputMode="numeric" value={perFloor} onChange={(e) => setPerFloor(e.target.value.replace(/\D/g, ''))} placeholder="4" />
              </label>
            </div>
            <label className="flex min-h-11 items-center gap-3 text-sm text-foreground">
              <input type="checkbox" className="h-5 w-5" checked={hasGround} onChange={(e) => setHasGround(e.target.checked)} />
              The ground floor has flats too
            </label>
            {hasGround && (
              <label className="block text-xs text-muted-foreground">
                Flats on the ground floor
                <input className={`${input} mt-1 text-foreground`} inputMode="numeric" value={groundStr} onChange={(e) => setGroundStr(e.target.value.replace(/\D/g, ''))} placeholder="2" />
              </label>
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
            <p className="text-xs text-muted-foreground">Up to {MAX_FLOORS} floors and {MAX_PER_FLOOR} flats on a floor. Flats are numbered 1A, 1B, 2A and so on. Ground floor flats are GA, GB and so on. "Floors" means the floors above the ground.</p>
          </div>
        )}

        {(kind === 'estate' || kind === 'hostel') && (
          <div className="space-y-3">
            <label className="block text-sm font-semibold text-foreground">
              {kind === 'hostel' ? 'How many rooms?' : 'How many houses?'}
              <input className={`${input} mt-1 font-normal`} inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value.replace(/\D/g, ''))} placeholder="40" />
            </label>
            {kind === 'estate' && (
              <label className="block text-sm font-semibold text-foreground">
                Street or phase <span className="font-normal text-muted-foreground">(optional)</span>
                <input className={`${input} mt-1 font-normal`} value={groupLabel} maxLength={60} onChange={(e) => setGroupLabel(e.target.value)} placeholder="Phase 1" />
              </label>
            )}
            <p className="text-xs text-muted-foreground">They are numbered 1 to {count || 'N'}.</p>
          </div>
        )}

        <div className="rounded-card border border-border bg-background p-3" aria-live="polite">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">Preview</p>
            <p className="text-xs text-muted-foreground">{built.error ? '' : `${unitCount} ${unitCount === 1 ? 'unit' : 'units'}`}</p>
          </div>
          {built.error ? (
            <p className="mt-2 text-xs text-muted-foreground">{kind === 'single_house' ? '' : built.error}</p>
          ) : (
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
          )}
        </div>

        <button
          type="button"
          onClick={create}
          disabled={saving}
          className="focus-ring min-h-12 w-full rounded-button bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-50"
        >
          {saving ? 'Creating...' : unitCount > 0 && !built.error ? `Create ${unitCount} ${unitCount === 1 ? 'unit' : 'units'}` : 'Create units'}
        </button>
        {msg && (
          <p role="status" className={`rounded-card border p-3 text-sm ${msg.ok ? 'border-success bg-success-soft text-success' : 'border-danger bg-danger-soft text-danger'}`}>
            {msg.text}
          </p>
        )}
        <p className="text-xs text-muted-foreground">Nothing goes public until you list a unit and EboHomes reviews it.</p>
      </section>

      <section className="space-y-3" aria-label="Your estates">
        <h2 className="text-lg font-bold text-foreground">Your estates</h2>
        {loading && <p className="text-sm text-muted-foreground">Loading...</p>}
        {loadError && <p className="text-sm text-danger">Could not load your estates. Refresh the page.</p>}
        {!loading && !loadError && ownEstates.length === 0 && (
          <p className="rounded-card border border-border bg-card p-4 text-sm text-muted-foreground">No estates yet. Add your first place above.</p>
        )}

        {pickUnit && (
          <div role="dialog" aria-label={`Attach a listing to unit ${pickUnit.label}`} className="space-y-3 rounded-card border-2 border-primary bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-foreground">Unit {pickUnit.label}, {pickUnit.estateName}</p>
                <p className="text-xs text-muted-foreground">Choose the listing for this unit.</p>
              </div>
              <button type="button" onClick={() => setPickUnit(null)} className="focus-ring min-h-11 shrink-0 rounded-button px-3 text-sm font-semibold text-primary">Close</button>
            </div>

            {attachable.length === 0 ? (
              <p className="rounded-card border border-border bg-background p-3 text-sm text-muted-foreground">
                You have no listing waiting for a unit. Create a new listing, then come back here to attach it.
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
              {attaching ? 'Attaching...' : 'Attach to this unit'}
            </button>
            <p className="text-xs text-muted-foreground">
              A listing sits on one unit. If it was on an automatic single-house unit, it moves here.{' '}
              <Link href="/list-property" className="font-semibold text-primary underline">Create a new listing</Link>{' '}
              instead. A new listing is not linked to a unit until you attach it here.
            </p>
          </div>
        )}

        {ownEstates.map((e) => {
          const us = [...(e.units ?? [])].sort((a, b) => (b.floor_no ?? 0) - (a.floor_no ?? 0) || a.unit_label.localeCompare(b.unit_label, undefined, { numeric: true }))
          const shown = us.slice(0, 48)
          return (
            <div key={e.id} className="rounded-card border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-foreground">{e.name}</p>
                  <p className="text-xs text-muted-foreground">{KIND_LABEL[e.kind] ?? e.kind}{e.address_text ? `, ${e.address_text}` : ''}</p>
                </div>
                <p className="shrink-0 text-xs text-muted-foreground">{us.length} {us.length === 1 ? 'unit' : 'units'}</p>
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
                      title="Attach a listing to this unit"
                      aria-label={`Unit ${u.unit_label}, no listing yet. Attach a listing`}
                      className={`focus-ring inline-flex min-h-11 items-center rounded-button px-3 text-xs font-semibold ${tileClass(u)}`}
                    >
                      {u.unit_label}
                    </button>
                  )
                ))}
                {us.length > shown.length && <span className="px-1 py-1 text-xs text-muted-foreground">+{us.length - shown.length} more</span>}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">Dashed means no listing yet. Tap one to attach a listing.</p>
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
