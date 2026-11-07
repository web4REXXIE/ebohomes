'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import 'leaflet/dist/leaflet.css'
import { Loader2, AlertTriangle, MapPin } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import {
  answerLabel, answersFor, categoryLabel, factProvenance, formatStraightLine, isFacilityCategory, looksLikeSafetyClaim,
} from '@/lib/surroundings'

const LocationPickerModal = dynamic(
  () => import('@/components/location-picker-modal').then((mod) => ({ default: mod.LocationPickerModal })),
  { ssr: false }
)

const field = 'w-full px-3 py-2 rounded-lg border border-border bg-background text-sm'
const when = (s?: string | null) => (s ? new Date(s).toLocaleString('en-NG') : '—')
const five = (v: any) => Number(v).toFixed(5)

function metres(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = (d: number) => (d * Math.PI) / 180
  const x = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(x)))
}

type Pt = { lat: number; lng: number; color: string; size: number; label: string }
function pointsOf(o: any): Pt[] {
  const pts: Pt[] = []
  const l = o?.listing
  if (l?.lat != null && l?.lng != null) pts.push({ lat: Number(l.lat), lng: Number(l.lng), color: '#2D6A4F', size: 22, label: 'Listing pin' })
  const i = o?.inspection
  if (i?.gps_lat != null && i?.gps_lng != null) pts.push({ lat: Number(i.gps_lat), lng: Number(i.gps_lng), color: '#2563eb', size: 18, label: 'Position the inspector reported' })
  ;(o?.facts ?? []).forEach((f: any) => {
    if (f.facility_lat != null && f.facility_lng != null && f.review_status !== 'withdrawn') {
      pts.push({ lat: Number(f.facility_lat), lng: Number(f.facility_lng), color: '#d97706', size: 14, label: `${categoryLabel(f.category)}${f.name ? ': ' + f.name : ''}` })
    }
  })
  return pts.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))
}

type Call = () => PromiseLike<{ error: any }>

function FactRow({ f, me, ownListing, busy, act }: {
  f: any; me: string | null; ownListing: boolean; busy: boolean; act: (call: Call, ok: string, after?: () => void) => Promise<boolean>
}) {
  const [mode, setMode] = useState<'flag' | 'withdraw' | 'correct' | null>(null)
  const [note, setNote] = useState('')
  const [answer, setAnswer] = useState<string>(f.answer)
  const [name, setName] = useState<string>(f.name ?? '')
  const [cNote, setCNote] = useState<string>(f.note ?? '')
  const [reason, setReason] = useState('')

  const mine = !!me && f.recorded_by === me
  const closed = f.review_status === 'withdrawn' || f.review_status === 'superseded'
  const blocked = ownListing || mine
  const dist = f.distance_method === 'straight_line' ? formatStraightLine(f.distance_m) : null
  const safety = looksLikeSafetyClaim(f.note) || looksLikeSafetyClaim(f.context)
  const done = () => { setMode(null); setNote(''); setReason('') }

  return (
    <li className="rounded-lg border border-border p-3 text-xs space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <b className="text-sm">{categoryLabel(f.category)}</b>
        <span className="text-sm">{isFacilityCategory(f.category) ? (f.name ?? '') : answerLabel(f.category, f.answer)}</span>
        <span className={`px-2 py-0.5 rounded-full font-semibold ${
          f.review_status === 'published' ? 'bg-emerald-100 text-emerald-800' : f.review_status === 'flagged' ? 'bg-red-100 text-red-800'
          : f.review_status === 'withdrawn' ? 'bg-slate-100 text-slate-700' : 'bg-amber-100 text-amber-800'}`}>{f.review_status}</span>
        {f.is_stale && <span className="px-2 py-0.5 rounded-full bg-orange-100 text-orange-800 font-semibold">Old information</span>}
      </div>
      <p className="text-muted-foreground">{factProvenance(f.source, f.review_status, null)} · observed {when(f.observed_at)}</p>
      {dist && <p>{dist}{f.facility_lat != null ? ' · facility position recorded' : ''}</p>}
      {f.context && <p className="text-muted-foreground">When: {f.context}</p>}
      {f.note && <p>Note: {f.note}</p>}
      {safety && (
        <p className="flex items-start gap-1 text-amber-800 font-semibold">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" /> This note may make a safety or crime claim. Notes must describe only what was seen. Flag or correct it.
        </p>
      )}
      {f.supersedes_id && <p className="text-muted-foreground">A proposed correction of an earlier fact. Publishing it replaces that fact.</p>}
      {f.review_note && <p className="text-muted-foreground">Review note: {f.review_note}</p>}

      {!closed && blocked && (
        <p className="text-muted-foreground">{ownListing ? 'This is your own listing, so another administrator must review it.' : 'You recorded this, so another administrator must review it.'}</p>
      )}
      {!closed && !blocked && !mode && (
        <div className="flex flex-wrap gap-2 pt-1">
          {(f.review_status === 'pending' || f.review_status === 'flagged') && (
            <Button size="sm" disabled={busy} onClick={() => act(() => supabase.rpc('admin_review_surroundings_fact', { p_fact: f.id, p_action: 'publish', p_note: null }), 'Published.')}>Publish</Button>
          )}
          {f.review_status !== 'flagged' && <Button size="sm" variant="outline" disabled={busy} onClick={() => setMode('flag')}>Flag</Button>}
          <Button size="sm" variant="outline" disabled={busy} onClick={() => setMode('withdraw')}>Withdraw</Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => setMode('correct')}>Propose correction</Button>
        </div>
      )}

      {mode && mode !== 'correct' && (
        <div className="space-y-2 pt-1">
          <input className={field} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)}
            placeholder={mode === 'flag' ? 'What looks wrong? (10+ characters)' : 'Why withdraw it? (5+ characters)'} />
          <div className="flex gap-2">
            <Button size="sm" disabled={busy || note.trim().length < (mode === 'flag' ? 10 : 5)}
              onClick={() => act(() => supabase.rpc('admin_review_surroundings_fact', { p_fact: f.id, p_action: mode, p_note: note.trim() }), mode === 'flag' ? 'Flagged. It is hidden from tenants.' : 'Withdrawn.', done)}>Confirm</Button>
            <Button size="sm" variant="outline" onClick={done}>Cancel</Button>
          </div>
        </div>
      )}

      {mode === 'correct' && (
        <div className="space-y-2 pt-1">
          <p className="text-muted-foreground">The correction is saved as a new pending fact. Another administrator publishes it. The original stays on record, and the observation date does not change.</p>
          <select className={field} value={answer} onChange={(e) => setAnswer(e.target.value)}>
            {answersFor(f.category).map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
          {isFacilityCategory(f.category) && <input className={field} maxLength={120} value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />}
          <input className={field} maxLength={300} value={cNote} onChange={(e) => setCNote(e.target.value)} placeholder="Note (what was seen, no safety or crime claims)" />
          <input className={field} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for the correction (10+ characters)" />
          <div className="flex gap-2">
            <Button size="sm" disabled={busy || reason.trim().length < 10 || (isFacilityCategory(f.category) && name.trim().length < 2)}
              onClick={() => act(() => supabase.rpc('admin_correct_surroundings_fact', { p_fact: f.id, p_answer: answer, p_name: name.trim() || null, p_note: cNote.trim() || null, p_reason: reason.trim() }), 'Correction saved. Another administrator must publish it.', done)}>Save correction</Button>
            <Button size="sm" variant="outline" onClick={done}>Cancel</Button>
          </div>
        </div>
      )}
    </li>
  )
}

export function AdminLocationPanel({ listingId }: { listingId: string }) {
  const [o, setO] = useState<any>(null)
  const [me, setMe] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [pinNote, setPinNote] = useState('')
  const [picker, setPicker] = useState(false)
  const [picked, setPicked] = useState<{ lat: number; lng: number } | null>(null)
  const [pinReason, setPinReason] = useState('')
  const [showClosed, setShowClosed] = useState(false)
  const mapEl = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('admin_listing_location_overview', { p_listing: listingId })
    if (error) { setErr(error.message); return }
    setO(data)
  }, [listingId])

  useEffect(() => { setO(null); setErr(''); setMsg(''); void load() }, [load])
  useEffect(() => { supabase.auth.getUser().then(({ data }) => setMe(data.user?.id ?? null)) }, [])

  const pts = o ? pointsOf(o) : []
  const hasPoints = pts.length > 0

  useEffect(() => {
    if (!o || !mapEl.current || pts.length === 0) return
    let cancelled = false
    import('leaflet').then((mod) => {
      const L = (mod as any).default ?? mod
      if (cancelled || !mapEl.current) return
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }
      const map = L.map(mapEl.current, { scrollWheelZoom: false })
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap contributors', maxZoom: 19 }).addTo(map)
      const bounds: [number, number][] = []
      pts.forEach((p) => {
        const icon = L.divIcon({
          className: '',
          html: `<div style="width:${p.size}px;height:${p.size}px;background:${p.color};border:2px solid white;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>`,
          iconSize: [p.size, p.size], iconAnchor: [p.size / 2, p.size / 2],
        })
        L.marker([p.lat, p.lng], { icon }).addTo(map).bindTooltip(p.label)
        bounds.push([p.lat, p.lng])
      })
      if (bounds.length === 1) map.setView(bounds[0], 17)
      else map.fitBounds(bounds, { padding: [30, 30], maxZoom: 17 })
      mapRef.current = map
      setTimeout(() => map.invalidateSize(), 100)
    })
    return () => { cancelled = true; if (mapRef.current) { mapRef.current.remove(); mapRef.current = null } }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [o])

  const act = useCallback(async (call: Call, ok: string, after?: () => void) => {
    setBusy(true); setMsg(''); setErr('')
    const { error } = await call()
    setBusy(false)
    if (error) { setErr(error.message); return false }
    setMsg(ok)
    after?.()
    await load()
    return true
  }, [load])

  if (!o) {
    return (
      <div className="bg-card border border-border rounded-lg p-5 text-sm">
        {err ? <p role="alert" className="text-destructive">{err}</p> : <p className="flex items-center gap-2 text-muted-foreground"><Loader2 size={14} className="animate-spin" /> Loading location…</p>}
      </div>
    )
  }

  const l = o.listing
  const i = o.inspection
  const ownListing = !!me && l.landlord_id === me
  const hasPin = l.lat != null && l.lng != null
  const facts: any[] = o.facts ?? []
  const openFacts = facts.filter((f) => f.review_status !== 'withdrawn')
  const closedFacts = facts.filter((f) => f.review_status === 'withdrawn')
  const nowDist = i?.distance_now_m != null ? formatStraightLine(Number(i.distance_now_m)) : null
  const thenDist = i?.distance_when_submitted_m != null ? formatStraightLine(Number(i.distance_when_submitted_m)) : null

  return (
    <div className="bg-card border border-border rounded-lg p-5 space-y-4">
      <div>
        <h3 className="font-semibold text-foreground flex items-center gap-2"><MapPin size={16} /> Location and surroundings</h3>
        <p className="text-xs text-muted-foreground">
          A pin and every fact below are claims until an administrator reviews them. GPS and distances are warning signs, never proof of presence. Distances are straight-line only.
        </p>
      </div>

      {err && <p role="alert" className="rounded border border-red-300 bg-red-50 p-2 text-xs text-red-900">{err}</p>}
      {msg && <p role="status" className="rounded border border-emerald-300 bg-emerald-50 p-2 text-xs text-emerald-900">{msg}</p>}

      {/* Pin status */}
      <div className="rounded-lg bg-secondary p-3 text-xs space-y-1">
        <p className="font-semibold text-sm">
          {!hasPin ? 'No pin on this listing' : l.reviewed_at ? `Pin: admin-reviewed on ${when(l.reviewed_at)}` : 'Pin: landlord-provided, not reviewed'}
        </p>
        {hasPin && <p>Listing pin {five(l.lat)}, {five(l.lng)} · address: {l.location_text ?? '—'}</p>}
        {l.review_note && <p className="text-muted-foreground">Review note: {l.review_note}</p>}
        {o.pin_moved_since_inspection && (
          <p className="flex items-start gap-1 font-semibold text-amber-800"><AlertTriangle size={13} className="mt-0.5 shrink-0" /> The pin or address changed after the latest inspection. The inspection may describe a different spot.</p>
        )}
        {ownListing && <p className="text-muted-foreground">This is your own listing, so another administrator must review its location.</p>}
      </div>

      {hasPoints && (
        <div>
          <div ref={mapEl} className="relative z-0 h-64 w-full overflow-hidden rounded-lg border border-border" />
          <p className="mt-1 text-[11px] text-muted-foreground">
            <span className="text-emerald-800 font-semibold">Green</span>: listing pin · <span className="text-blue-700 font-semibold">Blue</span>: position the inspector reported · <span className="text-amber-700 font-semibold">Amber</span>: nearby facilities recorded
          </p>
        </div>
      )}

      {/* Inspector comparison */}
      <div className="text-xs space-y-0.5">
        <p className="font-semibold text-sm">Latest inspection</p>
        {!i ? <p className="text-muted-foreground">No inspection on record.</p> : (
          <>
            <p>{when(i.inspected_at)} · {i.review_status}{i.integrity_level === 'hashed' ? '' : ' · legacy inspection, no file integrity hashes'}</p>
            {i.gps_lat != null
              ? <p>Position the inspector reported: {five(i.gps_lat)}, {five(i.gps_lng)}{i.gps_accuracy_m != null ? ` (accuracy about ${Math.round(Number(i.gps_accuracy_m))} m)` : ''}</p>
              : <p className="text-muted-foreground">No GPS recorded.</p>}
            {thenDist && <p>From the pin when it was submitted: {thenDist}{i.gps_flag === 'outside' ? ` — beyond the ${i.gps_threshold_m} m warning distance` : ''}</p>}
            {nowDist && <p>From the pin now: {nowDist}</p>}
            <p className="text-muted-foreground">This is a position reported by the inspector&apos;s phone. It is a warning sign for you, not proof that they were at the property.</p>
          </>
        )}
      </div>

      {/* Pin actions */}
      <div className="space-y-3 border-t border-border pt-3">
        <p className="font-semibold text-sm">Pin actions</p>
        {ownListing ? <p className="text-xs text-muted-foreground">Not available on your own listing.</p> : (
          <>
            {hasPin && (
              <div className="space-y-2">
                <input className={field} maxLength={1000} value={pinNote} onChange={(e) => setPinNote(e.target.value)} placeholder="Mark the pin as reviewed: what did you check? (10+ characters)" />
                <Button size="sm" variant="outline" disabled={busy || pinNote.trim().length < 10}
                  onClick={() => act(() => supabase.rpc('admin_review_listing_location', { p_listing: listingId, p_note: pinNote.trim() }), 'Pin marked as admin-reviewed.', () => setPinNote(''))}>Mark pin as reviewed</Button>
              </div>
            )}
            <div className="space-y-2">
              <Button size="sm" variant="outline" disabled={busy} onClick={() => setPicker(true)}>{picked ? 'Choose a different spot' : 'Correct the pin…'}</Button>
              {picked && (
                <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                  <p>New pin {five(picked.lat)}, {five(picked.lng)}{hasPin ? ` — moves it ${formatStraightLine(metres({ lat: Number(l.lat), lng: Number(l.lng) }, picked))?.replace('About ', 'about ')}` : ''}. This takes effect straight away, is recorded, and the landlord is told. A large move can reopen the authority check.</p>
                  <input className={field} maxLength={500} value={pinReason} onChange={(e) => setPinReason(e.target.value)} placeholder="Reason for the correction (10+ characters)" />
                  <div className="flex gap-2">
                    <Button size="sm" disabled={busy || pinReason.trim().length < 10}
                      onClick={() => act(() => supabase.rpc('admin_correct_listing_pin', { p_listing: listingId, p_lat: picked.lat, p_lng: picked.lng, p_reason: pinReason.trim() }), 'Pin corrected and recorded.', () => { setPicked(null); setPinReason('') })}>Apply correction</Button>
                    <Button size="sm" variant="outline" onClick={() => { setPicked(null); setPinReason('') }}>Cancel</Button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Surroundings facts */}
      <div className="space-y-2 border-t border-border pt-3">
        <p className="font-semibold text-sm">Surroundings facts ({openFacts.length})</p>
        {openFacts.length === 0 ? <p className="text-xs text-muted-foreground">No surroundings facts recorded yet.</p> : (
          <ul className="space-y-2">
            {openFacts.map((f) => <FactRow key={f.id} f={f} me={me} ownListing={ownListing} busy={busy} act={act} />)}
          </ul>
        )}
        {closedFacts.length > 0 && (
          <div>
            <button className="min-h-11 text-xs font-semibold underline" onClick={() => setShowClosed(!showClosed)}>{showClosed ? 'Hide' : 'Show'} withdrawn facts ({closedFacts.length})</button>
            {showClosed && <ul className="space-y-2">{closedFacts.map((f) => <FactRow key={f.id} f={f} me={me} ownListing={ownListing} busy={busy} act={act} />)}</ul>}
          </div>
        )}
      </div>

      {/* History */}
      <details className="border-t border-border pt-3 text-xs">
        <summary className="min-h-11 cursor-pointer py-2 font-semibold">Pin history ({(o.history ?? []).length})</summary>
        <ul className="space-y-1">
          {(o.history ?? []).map((h: any, idx: number) => (
            <li key={idx} className="rounded border border-border p-1.5">
              {when(h.at)} · {h.source} · {h.lat != null ? `${five(h.lat)}, ${five(h.lng)}` : 'no pin'}{h.moved_m != null ? ` · moved about ${Math.round(Number(h.moved_m))} m` : ''}{h.text ? ` · ${h.text}` : ''}
            </li>
          ))}
        </ul>
      </details>

      {picker && (
        <LocationPickerModal
          initial={hasPin ? { lat: Number(l.lat), lng: Number(l.lng) } : picked}
          onClose={() => setPicker(false)}
          onConfirm={(lat, lng) => { setPicked({ lat, lng }); setPicker(false) }}
        />
      )}
    </div>
  )
    }
