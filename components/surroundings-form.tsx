'use client'

import { useState } from 'react'
import { MapPin, Trash2 } from 'lucide-react'
import { SURROUNDINGS_CATEGORIES, answersFor, categoryLabel, isFacilityCategory, looksLikeSafetyClaim } from '@/lib/surroundings'

export type DraftFact = { category: string; answer: string; name?: string; note?: string; lat?: number; lng?: number }

const input = 'w-full px-3 py-2 rounded-lg border border-border bg-background text-sm'

// Turns the typed draft into what inspector_record_surroundings expects. The server checks everything again.
export function buildSurroundingsFacts(list: unknown, context: unknown) {
  const ctx = String(context ?? '').trim().slice(0, 150) || null
  return (Array.isArray(list) ? (list as DraftFact[]) : [])
    .filter((f) => f && f.category && f.answer)
    .map((f) => {
      const fac = isFacilityCategory(f.category)
      return {
        category: f.category,
        answer: f.answer,
        name: fac ? (f.name ?? '').trim() || null : null,
        note: (f.note ?? '').trim().slice(0, 300) || null,
        context: ctx,
        facility_lat: fac && typeof f.lat === 'number' ? f.lat : null,
        facility_lng: fac && typeof f.lng === 'number' ? f.lng : null,
      }
    })
}

export function SurroundingsForm({ value, context, onChange, disabled }: {
  value: DraftFact[]; context: string; onChange: (value: DraftFact[], context: string) => void; disabled?: boolean
}) {
  const [fc, setFc] = useState('facility_school')
  const [fname, setFname] = useState('')
  const [fnote, setFnote] = useState('')
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null)
  const [posBusy, setPosBusy] = useState(false)
  const [err, setErr] = useState('')

  const groups = [
    { title: 'Road and street', keys: SURROUNDINGS_CATEGORIES.filter((c) => c.group === 'road') },
    { title: 'Neighbourhood', keys: SURROUNDINGS_CATEGORIES.filter((c) => c.group === 'neighbourhood') },
  ]
  const facilityCats = SURROUNDINGS_CATEGORIES.filter((c) => isFacilityCategory(c.key))
  const facilities = value.filter((f) => isFacilityCategory(f.category))
  const get = (k: string) => value.find((f) => f.category === k)

  const setAnswer = (k: string, a: string) =>
    onChange(a ? [...value.filter((f) => f.category !== k), { category: k, answer: a, note: get(k)?.note }] : value.filter((f) => f.category !== k), context)
  const setNote = (k: string, n: string) => onChange(value.map((f) => (f.category === k ? { ...f, note: n } : f)), context)

  const getPos = () => {
    setErr('')
    if (!navigator.geolocation) return setErr('This device cannot share its location.')
    setPosBusy(true)
    navigator.geolocation.getCurrentPosition(
      (p) => { setPosBusy(false); setPos({ lat: p.coords.latitude, lng: p.coords.longitude }) },
      () => { setPosBusy(false); setErr('Could not get your location. Allow location access and try again.') },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    )
  }

  const addFacility = () => {
    setErr('')
    if (fname.trim().length < 2) return setErr('Enter the name of the place.')
    if (looksLikeSafetyClaim(fname) || looksLikeSafetyClaim(fnote)) return setErr('Describe only what you saw. Remove words about crime or safety.')
    onChange([...value, { category: fc, answer: 'recorded', name: fname.trim(), note: fnote.trim() || undefined, lat: pos?.lat, lng: pos?.lng }], context)
    setFname(''); setFnote(''); setPos(null)
  }

  const unsafe = value.some((f) => looksLikeSafetyClaim(f.note) || looksLikeSafetyClaim(f.name)) || looksLikeSafetyClaim(context)

  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-4">
      <div>
        <p className="text-sm font-semibold">6. Surroundings (optional)</p>
        <p className="text-xs text-muted-foreground">
          Record only what you saw today. A reviewer checks it before tenants see anything. Do not write about crime or safety. Choose &quot;Not recorded&quot; for anything you did not check.
        </p>
      </div>

      <input className={input} maxLength={150} disabled={disabled} value={context} onChange={(e) => onChange(value, e.target.value)}
        placeholder="When you visited, e.g. weekday 4pm, dry weather" />

      {groups.map((g) => (
        <div key={g.title} className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.title}</p>
          {g.keys.map((c) => {
            const f = get(c.key)
            return (
              <div key={c.key} className="space-y-1">
                <label className="text-sm font-medium" htmlFor={`s-${c.key}`}>{c.label}</label>
                <select id={`s-${c.key}`} className={input} disabled={disabled} value={f?.answer ?? ''} onChange={(e) => setAnswer(c.key, e.target.value)}>
                  <option value="">Not recorded</option>
                  {answersFor(c.key).map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                </select>
                {f && (
                  <input className={input} maxLength={300} disabled={disabled} value={f.note ?? ''} onChange={(e) => setNote(c.key, e.target.value)}
                    placeholder="Short note of what you saw (optional)" />
                )}
              </div>
            )
          })}
        </div>
      ))}

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Nearby places</p>
        {facilities.length > 0 && (
          <ul className="space-y-1.5">
            {facilities.map((f, idx) => (
              <li key={idx} className="flex items-center justify-between gap-2 rounded-lg border border-border p-2 text-xs">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{categoryLabel(f.category)}: {f.name}</span>
                  <span className="text-muted-foreground">{f.lat != null ? 'Position recorded' : 'No position'}{f.note ? ` · ${f.note}` : ''}</span>
                </span>
                <button type="button" disabled={disabled} aria-label="Remove place" onClick={() => onChange(value.filter((x) => x !== f), context)}
                  className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full border border-border"><Trash2 size={15} /></button>
              </li>
            ))}
          </ul>
        )}
        <select className={input} disabled={disabled} value={fc} onChange={(e) => setFc(e.target.value)} aria-label="Kind of place">
          {facilityCats.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
        <input className={input} maxLength={120} disabled={disabled} value={fname} onChange={(e) => setFname(e.target.value)} placeholder="Name of the place" />
        <input className={input} maxLength={300} disabled={disabled} value={fnote} onChange={(e) => setFnote(e.target.value)} placeholder="Short note (optional)" />
        <div className="grid grid-cols-2 gap-2">
          <button type="button" disabled={disabled || posBusy} onClick={getPos}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 text-xs font-semibold disabled:opacity-50">
            <MapPin size={15} /> {pos ? 'Position saved' : 'Use my position here'}
          </button>
          <button type="button" disabled={disabled} onClick={addFacility}
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-50">Add place</button>
        </div>
        <p className="text-xs text-muted-foreground">
          Tap &quot;Use my position here&quot; only while standing at that place. The distance tenants see is a straight line from the property, never a road distance.
        </p>
      </div>

      {unsafe && <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">A note looks like a safety or crime claim. Describe only what you saw, or the surroundings will be refused.</p>}
      {err && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-2 text-xs text-red-900">{err}</p>}
    </div>
  )
}
