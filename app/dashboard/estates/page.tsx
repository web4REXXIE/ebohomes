'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Building2, Home, ImagePlus, Loader2, Minus, Plus, Trees } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import {
  buildUnits, floorWord, MAX_FLOORS, MAX_PER_FLOOR, MAX_UNITS,
  type EstateKind, type UnitDraft,
} from '@/lib/unit-numbering'

type UnitRow = { id: string; unit_label: string; floor_no: number | null; group_label: string | null; status: string; listing_id: string | null }
type EstateRow = { id: string; name: string; kind: string; address_text: string | null; cover_photo_url: string | null; legacy_listing_id: string | null; units: UnitRow[] | null }
type MyListing = { id: string; title: string | null; location_text: string | null; status: string | null }

// Stage A (Idea 1): one place to list a property, in plain words.
// Stage B1: tap a flat or house that is not listed yet, then "List this flat" opens the listing form for it.
// Stage B3a: every building or estate needs an overview photo of the whole place. Listing a flat waits for it.
// Stage D: a compound with several buildings. It is still one place. Each flat keeps its building name in group_label
// and is named A-1A, B-2C and so on, so two buildings never share a flat number.
// Landlords see "flat", "house" and "room". The database keeps its own names (estate, unit).
// Choice 1 (one house or flat) goes straight to the listing form.
type Choice = 'single' | 'building' | 'compound' | 'houses'

type Bldg = { name: string; floors: string; perFloor: string; ground: string }

const MAX_BUILDINGS = 26
const letterOf = (i: number) => String.fromCharCode(65 + i)
const newBuilding = (i: number, from?: Bldg): Bldg => ({
  name: `Building ${letterOf(i)}`,
  floors: from?.floors ?? '4',
  perFloor: from?.perFloor ?? '4',
  ground: from?.ground ?? '',
})

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

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
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

// Works out the flats of a compound: one block per building, named A-1A, A-1B, B-1A and so on.
function buildCompound(bs: Bldg[]): { units: UnitDraft[]; error: string | null } {
  const all: UnitDraft[] = []
  const seen = new Set<string>()
  for (let i = 0; i < bs.length; i++) {
    const b = bs[i]
    const name = b.name.trim()
    if (name === '') return { units: [], error: `Give building ${letterOf(i)} a name.` }
    const key = name.toLowerCase()
    if (seen.has(key)) return { units: [], error: `Two buildings are called "${name}". Give each one its own name.` }
    seen.add(key)
    const r = buildUnits({
      kind: 'block',
      floors: toNum(b.floors),
      perFloor: toNum(b.perFloor),
      groundCount: b.ground.trim() === '' ? undefined : (toNum(b.ground) ?? NaN),
    })
    if (r.error) return { units: [], error: `${name}: ${r.error}` }
    for (const u of r.units) {
      all.push({ unit_label: `${letterOf(i)}-${u.unit_label}`, floor_no: u.floor_no, group_label: name.slice(0, 60) })
    }
  }
  if (all.length > MAX_UNITS) return { units: [], error: `That is ${all.length} flats. You can add up to ${MAX_UNITS} at a time.` }
  return { units: all, error: null }
}

// Uploads one photo to Cloudinary, the same way the listing form does. Returns the photo link.
async function uploadCover(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Choose a photo (JPG or PNG).')
  if (file.size > 10 * 1024 * 1024) throw new Error('That photo is too large. Use one under 10MB.')
  const data = new FormData()
  data.append('file', file)
  data.append('upload_preset', process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET!)
  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/image/upload`,
    { method: 'POST', body: data },
  )
  const json = await res.json()
  if (!json.secure_url) throw new Error('The photo did not upload. Check your network and try again.')
  return json.secure_url as string
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

  // Stage D: the buildings of a compound.
  const [buildings, setBuildings] = useState<Bldg[]>([newBuilding(0)])
  const [moreCount, setMoreCount] = useState('1')

  // Stage B3a: the overview photo for a new place, and for places that already exist.
  const [coverUrl, setCoverUrl] = useState('')
  const [coverUploading, setCoverUploading] = useState(false)
  const [coverMsg, setCoverMsg] = useState<string | null>(null)
  const [cardBusy, setCardBusy] = useState<string | null>(null)
  const [cardMsg, setCardMsg] = useState<{ id: string; text: string } | null>(null)

  // The flat or house the landlord just tapped
  const [pickUnit, setPickUnit] = useState<{ id: string; label: string; estateName: string; noun: string; hasCover: boolean } | null>(null)
  const [showAttach, setShowAttach] = useState(false)
  const [pickListingId, setPickListingId] = useState<string | null>(null)
  const [attaching, setAttaching] = useState(false)
  const [attachMsg, setAttachMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

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
        .select('id, name, kind, address_text, cover_photo_url, legacy_listing_id, units(id, unit_label, floor_no, group_label, status, listing_id)')
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

  // When a flat is tapped, bring its card into view so nobody has to hunt for it.
  useEffect(() => {
    if (pickUnit) panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [pickUnit, showAttach])

  // The database kind behind each plain choice. A compound is stored as a block with building names.
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

  const compoundBuilt = useMemo(() => buildCompound(buildings), [buildings])

  const isCompoundChoice = choice === 'compound'
  const units: UnitDraft[] = isCompoundChoice ? compoundBuilt.units : built.units
  const buildError: string | null = isCompoundChoice ? compoundBuilt.error : built.error
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
    setBuildings([newBuilding(0)])
    setMoreCount('1')
    setCoverUrl('')
    setCoverMsg(null)
  }

  const updateBuilding = (i: number, patch: Partial<Bldg>) => {
    setBuildings((prev) => prev.map((b, idx) => (idx === i ? { ...b, ...patch } : b)))
  }

  const removeBuilding = (i: number) => {
    setBuildings((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev))
  }

  // New buildings copy the floors and flats of the last one. Names carry on: Building B, Building C...
  const addBuildings = (n: number) => {
    setBuildings((prev) => {
      const out = [...prev]
      const last = prev[prev.length - 1]
      for (let k = 0; k < n && out.length < MAX_BUILDINGS; k++) out.push(newBuilding(out.length, last))
      return out
    })
  }

  // Photo for the place being created.
  const onPickCover = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const el = e.target
    const file = el.files?.[0]
    if (!file) return
    setCoverMsg(null)
    setCoverUploading(true)
    try {
      setCoverUrl(await uploadCover(file))
    } catch (err) {
      setCoverMsg(err instanceof Error ? err.message : 'The photo did not upload. Try again.')
    }
    setCoverUploading(false)
    el.value = ''
  }

  // Photo for a place that already exists (add one, or change it).
  const onCardCover = async (estateId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const el = e.target
    const file = el.files?.[0]
    if (!file) return
    setCardMsg(null)
    setCardBusy(estateId)
    try {
      const url = await uploadCover(file)
      const { error } = await supabase.rpc('set_estate_cover_photo', { p_estate: estateId, p_url: url })
      if (error) throw new Error(error.message || 'Could not save the photo. Try again.')
      await loadEstates()
    } catch (err) {
      setCardMsg({ id: estateId, text: err instanceof Error ? err.message : 'The photo did not save. Try again.' })
    }
    setCardBusy(null)
    el.value = ''
  }

  const wholeWord = choice === 'houses' ? 'estate' : choice === 'compound' ? 'compound' : 'building'

  const create = async () => {
    setMsg(null)
    if (name.trim().length < 1) {
      setMsg({ ok: false, text: 'Enter a name for this place.' })
      return
    }
    if (!coverUrl) {
      setMsg({ ok: false, text: `Add an overview photo of the whole ${wholeWord}.` })
      return
    }
    if (buildError) {
      setMsg({ ok: false, text: buildError })
      return
    }
    const placeName = name.trim()
    setSaving(true)
    const { error } = await supabase.rpc('create_estate_with_units', {
      p_name: placeName,
      p_kind: kind,
      p_address: address.trim() || null,
      p_units: units,
    })
    if (error) {
      setSaving(false)
      setMsg({ ok: false, text: error.message || 'Could not save this place. Try again.' })
      return
    }

    // Attach the overview photo to the place we just made (the newest one with this name).
    let attached = false
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: row } = await supabase
          .from('estates')
          .select('id')
          .eq('owner_id', user.id)
          .eq('name', placeName)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (row) {
          const { error: coverError } = await supabase.rpc('set_estate_cover_photo', { p_estate: (row as { id: string }).id, p_url: coverUrl })
          attached = !coverError
        }
      }
    } catch (err) {
      console.error('Overview photo did not attach:', err)
    }
    setSaving(false)

    setMsg({
      ok: true,
      text: attached
        ? `Saved. ${plural(unitCount, one, many)} added to your places below. Nothing is public until you list one.`
        : `Saved. ${plural(unitCount, one, many)} added, but the overview photo did not attach. Add it on the place card below.`,
    })
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
  // Rented and rejected listings cannot go on a flat, so they are not offered.
  const attachable = myListings.filter((l) => !placedIds.has(l.id) && l.status !== 'rented' && l.status !== 'rejected')

  const openPicker = (u: UnitRow, estate: EstateRow) => {
    const [w] = noun(estate.kind)
    setPickUnit({ id: u.id, label: u.unit_label, estateName: estate.name, noun: w, hasCover: !!estate.cover_photo_url })
    setShowAttach(false)
    setPickListingId(null)
    setAttachMsg(null)
  }

  const closePicker = () => {
    setPickUnit(null)
    setShowAttach(false)
    setPickListingId(null)
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
    setMsg({ ok: true, text: `The listing is now on ${cap(pickUnit.noun)} ${pickUnit.label}, ${pickUnit.estateName}. Tenants see it once the listing is live.` })
    closePicker()
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

  // One flat or house tile on a place card.
  const tileFor = (u: UnitRow, e: EstateRow, oneE: string) =>
    u.listing_id ? (
      <span key={u.id} title={tileNote(u)} className={`rounded-button px-2.5 py-1 text-xs font-semibold ${tileClass(u)}`}>{u.unit_label}</span>
    ) : (
      <button
        key={u.id}
        type="button"
        onClick={() => openPicker(u, e)}
        title={`List ${oneE} ${u.unit_label}`}
        aria-label={`${cap(oneE)} ${u.unit_label}, not listed yet. Tap to list it`}
        className={`focus-ring inline-flex min-h-11 items-center rounded-button px-3 text-xs font-semibold ${tileClass(u)}`}
      >
        {u.unit_label}
      </button>
    )

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

          <button type="button" onClick={() => { setChoice('compound'); setMsg(null) }} className={cardBase}>
            <Building2 size={22} aria-hidden className="shrink-0 text-primary" />
            <span className="flex-1">
              <span className="block text-sm font-semibold text-foreground">A compound with several buildings</span>
              <span className="block text-xs text-muted-foreground">Building A, Building B and so on, in one place.</span>
            </span>
            <ArrowRight size={16} aria-hidden className="text-muted-foreground" />
          </button>

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

      {(choice === 'building' || choice === 'houses' || choice === 'compound') && (
        <section className="space-y-4 rounded-card border border-border bg-card p-4" aria-label="Add a place">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-foreground">
              {choice === 'building' ? 'Your building' : choice === 'compound' ? 'Your compound' : 'Your estate'}
            </h2>
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

          {/* Stage B3a: the photo tenants see first. */}
          <div>
            <p className="text-sm font-semibold text-foreground">Photo of the whole {wholeWord} *</p>
            <p className="mb-2 text-xs text-muted-foreground">
              Show the full {wholeWord} from outside, so tenants can see it before they pick a {one}.
            </p>
            {coverUrl ? (
              <div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={coverUrl} alt={`Overview of ${name || wholeWord}`} className="h-44 w-full rounded-lg object-cover" />
                <button type="button" onClick={() => setCoverUrl('')} className="focus-ring mt-1 min-h-11 text-sm font-semibold text-destructive">
                  Remove photo
                </button>
              </div>
            ) : (
              <label
                htmlFor="cover-new"
                className="block min-h-14 cursor-pointer rounded-lg border-2 border-dashed border-border p-5 text-center hover:bg-secondary focus-within:ring-2 focus-within:ring-primary"
              >
                <ImagePlus size={28} className="mx-auto mb-1 text-muted-foreground" aria-hidden />
                <p className="text-sm font-semibold text-foreground">Tap to add the overview photo</p>
                {coverUploading && (
                  <p role="status" className="mt-2 flex items-center justify-center gap-2 text-sm text-primary">
                    <Loader2 size={14} className="animate-spin" aria-hidden /> Uploading...
                  </p>
                )}
                <input id="cover-new" type="file" accept="image/*" onChange={onPickCover} disabled={coverUploading} className="sr-only" />
              </label>
            )}
            {coverMsg && <p role="alert" className="mt-2 text-sm font-medium text-danger">{coverMsg}</p>}
          </div>

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

          {choice === 'compound' && (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-foreground">Your buildings</p>

              {buildings.map((b, i) => (
                <div key={i} className="space-y-3 rounded-card border border-border bg-background p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-foreground">Building {letterOf(i)}</p>
                    {buildings.length > 1 && (
                      <button type="button" onClick={() => removeBuilding(i)} className="focus-ring min-h-11 rounded-button px-3 text-sm font-semibold text-destructive">
                        Remove
                      </button>
                    )}
                  </div>
                  <label className="block text-sm font-semibold text-foreground">
                    Name
                    <input
                      className={`${input} mt-1 font-normal`}
                      value={b.name}
                      maxLength={60}
                      onChange={(e) => updateBuilding(i, { name: e.target.value })}
                    />
                  </label>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Stepper label="Floors above the ground" value={b.floors} onChange={(v) => updateBuilding(i, { floors: v })} min={1} max={MAX_FLOORS} />
                    <Stepper label="Flats on each floor" value={b.perFloor} onChange={(v) => updateBuilding(i, { perFloor: v })} min={1} max={MAX_PER_FLOOR} />
                  </div>
                  <Stepper label="Flats on the ground floor (0 if none)" value={b.ground} onChange={(v) => updateBuilding(i, { ground: v })} min={0} max={MAX_PER_FLOOR} />
                </div>
              ))}

              <div className="space-y-2 rounded-card border border-dashed border-border p-3">
                <button
                  type="button"
                  onClick={() => addBuildings(1)}
                  disabled={buildings.length >= MAX_BUILDINGS}
                  className="focus-ring min-h-11 w-full rounded-button border border-primary bg-card px-4 text-sm font-semibold text-primary disabled:opacity-50"
                >
                  Add a building like {buildings[buildings.length - 1]?.name.trim() || `Building ${letterOf(buildings.length - 1)}`}
                </button>
                <Stepper label="Or add several at once" value={moreCount} onChange={setMoreCount} min={1} max={10} />
                <button
                  type="button"
                  onClick={() => addBuildings(Math.max(1, Number.parseInt(moreCount, 10) || 1))}
                  disabled={buildings.length >= MAX_BUILDINGS}
                  className="focus-ring min-h-11 w-full rounded-button border border-border bg-card px-4 text-sm font-semibold text-foreground disabled:opacity-50"
                >
                  Add {Math.max(1, Number.parseInt(moreCount, 10) || 1)} more like the last one
                </button>
              </div>
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
            {buildError ? (
              <p className="text-xs text-muted-foreground">{buildError}</p>
            ) : choice === 'compound' ? (
              <>
                <p className="text-sm font-semibold text-foreground">
                  That makes {plural(buildings.length, 'building', 'buildings')} and {plural(unitCount, 'flat', 'flats')}.{' '}
                  <span className="font-normal text-muted-foreground">Flats are named A-1A, A-1B, B-1A and so on.</span>
                </p>
                <ul className="mt-2 space-y-1">
                  {buildings.map((b, i) => {
                    const n = units.filter((u) => u.group_label === b.name.trim().slice(0, 60)).length
                    return (
                      <li key={i} className="text-xs text-muted-foreground">
                        <span className="font-semibold text-foreground">{b.name.trim()}</span>: {plural(n, 'flat', 'flats')}
                      </li>
                    )
                  })}
                </ul>
              </>
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
            disabled={saving || coverUploading}
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
          <div ref={panelRef} role="dialog" aria-label={`${cap(pickUnit.noun)} ${pickUnit.label}`} className="space-y-3 rounded-card border-2 border-primary bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-bold text-foreground">{cap(pickUnit.noun)} {pickUnit.label}</p>
                <p className="text-xs text-muted-foreground">{pickUnit.estateName}</p>
              </div>
              <button type="button" onClick={closePicker} className="focus-ring min-h-11 shrink-0 rounded-button px-3 text-sm font-semibold text-primary">Close</button>
            </div>

            {!showAttach && (
              <>
                {pickUnit.hasCover ? (
                  <Link
                    href={`/list-property?unit=${pickUnit.id}`}
                    className="focus-ring flex min-h-12 w-full items-center justify-center rounded-button bg-primary px-4 text-sm font-bold text-primary-foreground"
                  >
                    List this {pickUnit.noun}
                  </Link>
                ) : (
                  <p role="status" className="rounded-card border border-border bg-background p-3 text-sm text-foreground">
                    Add an overview photo of {pickUnit.estateName} first. Find it on the place card below, then tap this {pickUnit.noun} again.
                  </p>
                )}
                {pickUnit.hasCover && attachable.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowAttach(true)}
                    className="focus-ring min-h-11 w-full rounded-button border border-border bg-card px-4 text-sm font-semibold text-primary"
                  >
                    Use a listing I already made
                  </button>
                )}
              </>
            )}

            {showAttach && (
              <>
                <p className="text-xs text-muted-foreground">Choose the listing for this {pickUnit.noun}.</p>
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
                <button type="button" onClick={() => setShowAttach(false)} className="focus-ring min-h-11 w-full rounded-button px-4 text-sm font-semibold text-primary">Back</button>
              </>
            )}
          </div>
        )}

        {ownEstates.map((e) => {
          const [oneE, manyE] = noun(e.kind)
          const us = [...(e.units ?? [])].sort((a, b) => (b.floor_no ?? 0) - (a.floor_no ?? 0) || a.unit_label.localeCompare(b.unit_label, undefined, { numeric: true }))
          const shown = us.slice(0, 48)
          const busy = cardBusy === e.id

          // A compound: flats that have floors and a building name. Shown one fold-out section per building.
          const isCompound = us.some((u) => u.floor_no !== null && (u.group_label ?? '').trim() !== '')
          const buildingNames = isCompound
            ? [...new Set(us.map((u) => (u.group_label ?? '').trim() || 'Other'))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
            : []

          return (
            <div key={e.id} className="rounded-card border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-foreground">{e.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {isCompound ? `Compound with ${plural(buildingNames.length, 'building', 'buildings')}` : (KIND_LABEL[e.kind] ?? e.kind)}
                    {e.address_text ? `, ${e.address_text}` : ''}
                  </p>
                </div>
                <p className="shrink-0 text-xs text-muted-foreground">{plural(us.length, oneE, manyE)}</p>
              </div>

              {/* Stage B3a: the overview photo, or the way to add it. */}
              {e.cover_photo_url ? (
                <div className="mt-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={e.cover_photo_url} alt={`Overview of ${e.name}`} className="h-36 w-full rounded-lg object-cover" />
                  <label htmlFor={`cover-${e.id}`} className="focus-ring mt-1 inline-flex min-h-11 cursor-pointer items-center text-sm font-semibold text-primary">
                    {busy ? 'Uploading...' : 'Change overview photo'}
                    <input id={`cover-${e.id}`} type="file" accept="image/*" onChange={(ev) => onCardCover(e.id, ev)} disabled={busy} className="sr-only" />
                  </label>
                </div>
              ) : (
                <label
                  htmlFor={`cover-${e.id}`}
                  className="mt-3 block min-h-14 cursor-pointer rounded-lg border-2 border-dashed border-primary p-4 text-center hover:bg-secondary focus-within:ring-2 focus-within:ring-primary"
                >
                  <ImagePlus size={24} className="mx-auto mb-1 text-primary" aria-hidden />
                  <p className="text-sm font-semibold text-foreground">{busy ? 'Uploading...' : 'Add an overview photo of the whole place'}</p>
                  <p className="text-xs text-muted-foreground">Needed before you can list a {oneE} here.</p>
                  <input id={`cover-${e.id}`} type="file" accept="image/*" onChange={(ev) => onCardCover(e.id, ev)} disabled={busy} className="sr-only" />
                </label>
              )}
              {cardMsg && cardMsg.id === e.id && <p role="alert" className="mt-2 text-sm font-medium text-danger">{cardMsg.text}</p>}

              {isCompound ? (
                <div className="mt-3 space-y-2">
                  {buildingNames.map((bn, bi) => {
                    const inB = us.filter((u) => ((u.group_label ?? '').trim() || 'Other') === bn)
                    const listed = inB.filter((u) => u.listing_id).length
                    return (
                      <details key={bn} open={buildingNames.length <= 2 || bi === 0} className="rounded-lg border border-border bg-background p-3">
                        <summary className="focus-ring cursor-pointer text-sm font-semibold text-foreground">
                          {bn} <span className="font-normal text-muted-foreground">· {plural(inB.length, oneE, manyE)}, {listed} listed</span>
                        </summary>
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {inB.slice(0, 80).map((u) => tileFor(u, e, oneE))}
                          {inB.length > 80 && <span className="px-1 py-1 text-xs text-muted-foreground">+{inB.length - 80} more</span>}
                        </div>
                      </details>
                    )
                  })}
                </div>
              ) : (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {shown.map((u) => tileFor(u, e, oneE))}
                  {us.length > shown.length && <span className="px-1 py-1 text-xs text-muted-foreground">+{us.length - shown.length} more</span>}
                </div>
              )}
              <p className="mt-2 text-xs text-muted-foreground">Dashed means not listed yet. Tap one to list it.</p>
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
