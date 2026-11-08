'use client'

import { useEffect, useRef, useState } from 'react'
import 'leaflet/dist/leaflet.css'
import { Map as MapIcon, MapPin, Info, Navigation, AlertTriangle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { SURROUNDINGS_CATEGORIES, answerLabel, categoryLabel, factProvenance, formatStraightLine, isFacilityCategory } from '@/lib/surroundings'

type Pin = { has_pin: boolean; area_lat: number | string | null; area_lng: number | string | null; pin_label: string; pin_reviewed_at: string | null }
type Exact = { lat: number; lng: number; reason: string }
type Fact = {
  id: string; category: string; answer: string; name: string | null; note: string | null; context: string | null; source: string
  observed_at: string; reviewed_at: string | null; distance_m_rounded: number | string | null; distance_method: string | null; is_stale: boolean
}

const day = (s?: string | null) => (s ? new Date(s).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' }) : '')
const REASON_TEXT: Record<string, string> = {
  owner: 'You can see the exact pin because this is your listing.',
  admin: 'You can see the exact pin as an administrator.',
  inspector: 'You can see the exact pin because you are assigned to inspect this property.',
  viewing: 'You can see the exact pin because you have a viewing booked.',
  application: 'You can see the exact pin because your application was approved.',
}

export function ListingLocationPublic({ listingId, title, address }: { listingId: string; title: string; address?: string | null }) {
  const [pin, setPin] = useState<Pin | null>(null)
  const [exact, setExact] = useState<Exact | null>(null)
  const [facts, setFacts] = useState<Fact[]>([])
  const [loaded, setLoaded] = useState(false)
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<any>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const [p, e, f] = await Promise.all([
        supabase.from('public_listing_pins').select('has_pin, area_lat, area_lng, pin_label, pin_reviewed_at').eq('listing_id', listingId).maybeSingle(),
        supabase.rpc('listing_exact_location', { p_listing: listingId }),
        supabase.from('public_listing_surroundings')
          .select('id, category, answer, name, note, context, source, observed_at, reviewed_at, distance_m_rounded, distance_method, is_stale')
          .eq('listing_id', listingId),
      ])
      if (!alive) return
      setPin((p.data as Pin) ?? null)
      setExact(e.data && typeof e.data === 'object' ? (e.data as Exact) : null)
      setFacts((f.data as Fact[]) ?? [])
      setLoaded(true)
    })()
    return () => { alive = false }
  }, [listingId])

  const hasPin = !!pin?.has_pin && pin.area_lat != null && pin.area_lng != null
  const areaLat = hasPin ? Number(pin!.area_lat) : null
  const areaLng = hasPin ? Number(pin!.area_lng) : null
  const exLat = exact ? Number(exact.lat) : null
  const exLng = exact ? Number(exact.lng) : null

  useEffect(() => {
    if (!hasPin || !mapRef.current) return
    let cancelled = false
    import('leaflet').then((mod) => {
      const L = (mod as any).default ?? mod
      if (cancelled || !mapRef.current || mapInstance.current) return
      const map = L.map(mapRef.current, { scrollWheelZoom: false, dragging: !L.Browser.mobile })
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap contributors', maxZoom: 19 }).addTo(map)
      if (exLat != null && exLng != null) {
        map.setView([exLat, exLng], 16)
        L.circle([exLat, exLng], { radius: 60, color: '#0A7A3B', weight: 1, fillColor: '#0A7A3B', fillOpacity: 0.12 }).addTo(map)
        const icon = L.divIcon({
          className: '',
          html: '<div style="width:36px;height:36px;background:#0A7A3B;border:3px solid white;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 3px 10px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;"><div style="width:10px;height:10px;background:white;border-radius:50%;"></div></div>',
          iconSize: [36, 36], iconAnchor: [18, 36],
        })
        L.marker([exLat, exLng], { icon, title }).addTo(map)
      } else {
        // Approximate area only: a circle that covers the whole 1 km grid square. No marker, because the centre is not the property.
        const circle = L.circle([areaLat, areaLng], { radius: 800, color: '#0A7A3B', weight: 2, dashArray: '6 6', fillColor: '#0A7A3B', fillOpacity: 0.1 }).addTo(map)
        map.fitBounds(circle.getBounds(), { padding: [20, 20] })
      }
      mapInstance.current = map
      setTimeout(() => map.invalidateSize(), 100)
    })
    return () => { cancelled = true; if (mapInstance.current) { mapInstance.current.remove(); mapInstance.current = null } }
  }, [hasPin, areaLat, areaLng, exLat, exLng, title])

  const directionsUrl = exLat != null ? `https://www.google.com/maps/dir/?api=1&destination=${exLat},${exLng}` : null
  const openUrl = exLat != null
    ? `https://www.google.com/maps/search/?api=1&query=${exLat},${exLng}`
    : hasPin ? `https://www.google.com/maps/search/?api=1&query=${areaLat},${areaLng}` : null

  const order = (k: string) => SURROUNDINGS_CATEGORIES.findIndex((c) => c.key === k)
  const sorted = [...facts].sort((a, b) => order(a.category) - order(b.category))
  const groups = [
    { title: 'Road and street', items: sorted.filter((f) => SURROUNDINGS_CATEGORIES.find((c) => c.key === f.category)?.group === 'road') },
    { title: 'Neighbourhood', items: sorted.filter((f) => SURROUNDINGS_CATEGORIES.find((c) => c.key === f.category)?.group === 'neighbourhood') },
    { title: 'Nearby places', items: sorted.filter((f) => isFacilityCategory(f.category)) },
  ].filter((g) => g.items.length > 0)

  return (
    <section aria-labelledby="location-heading" className="mb-6 rounded-card border border-border bg-card p-card shadow-rest">
      <h2 id="location-heading" className="mb-1 text-h3 font-semibold text-foreground">Location</h2>
      {address && (
        <p className="mb-3 flex items-start gap-1.5 text-body text-muted-foreground">
          <MapPin size={16} className="mt-0.5 shrink-0 text-primary" /> {address}
        </p>
      )}

      {!loaded ? (
        <p role="status" className="text-body text-muted-foreground">Loading location…</p>
      ) : !hasPin ? (
        <p className="flex items-start gap-1.5 text-caption text-muted-foreground">
          <Info size={14} className="mt-0.5 shrink-0" aria-hidden /> A map pin has not been added for this property yet.
        </p>
      ) : (
        <>
          <div
            ref={mapRef}
            role="region"
            aria-label={exact ? 'Map showing the property pin' : 'Map showing the approximate area of the property'}
            className="relative z-0 h-72 w-full overflow-hidden rounded-control border border-border sm:h-[26rem]"
          />
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {directionsUrl && (
              <a href={directionsUrl} target="_blank" rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-body font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                <Navigation size={16} aria-hidden /> Get directions
              </a>
            )}
            {openUrl && (
              <a href={openUrl} target="_blank" rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 text-body font-semibold text-foreground hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                <MapIcon size={16} aria-hidden /> {exact ? 'Open in Google Maps' : 'Open this area in Google Maps'}
              </a>
            )}
          </div>
          <p className="mt-3 flex items-start gap-1.5 text-caption text-muted-foreground">
            <Info size={14} className="mt-0.5 shrink-0" aria-hidden />
            {exact
              ? `${REASON_TEXT[exact.reason] ?? ''} The pin is a guide and may not mark the exact spot.`
              : 'This shows the approximate area only. The property is somewhere inside the circle. The exact pin is shared with people who have a booked viewing or an approved application.'}
          </p>
          <p className="mt-1 text-caption text-muted-foreground">
            {pin?.pin_label === 'admin_reviewed'
              ? `Pin reviewed by an EboHomes administrator${pin.pin_reviewed_at ? ' on ' + day(pin.pin_reviewed_at) : ''}.`
              : 'Pin provided by the landlord. It has not been reviewed by EboHomes yet.'}
          </p>
        </>
      )}

      {loaded && groups.length > 0 && (
        <div className="mt-5 space-y-4 border-t border-border pt-4">
          <div>
            <h3 className="text-body-lg font-semibold text-foreground">Surroundings</h3>
            <p className="text-caption text-muted-foreground">
              What was seen on the date shown, checked by an EboHomes administrator before it was published. These are observations, not guarantees. Distances are straight lines, not road distances.
            </p>
          </div>
          {groups.map((g) => (
            <div key={g.title}>
              <h4 className="mb-1 text-caption font-semibold uppercase tracking-wide text-muted-foreground">{g.title}</h4>
              <ul className="space-y-2">
                {g.items.map((f) => {
                  const fac = isFacilityCategory(f.category)
                  const dist = f.distance_method === 'straight_line' ? formatStraightLine(Number(f.distance_m_rounded)) : null
                  return (
                    <li key={f.id} className="rounded-control border border-border p-3 text-body">
                      <p className="font-semibold text-foreground">
                        {categoryLabel(f.category)}: <span className="font-normal">{fac ? f.name : answerLabel(f.category, f.answer)}</span>
                      </p>
                      {dist && <p className="text-caption text-foreground">{dist}</p>}
                      {f.note && <p className="text-caption text-muted-foreground">{f.note}</p>}
                      <p className="mt-1 text-caption text-muted-foreground">
                        {factProvenance(f.source, 'published', f.reviewed_at)} · seen {day(f.observed_at)}{f.context ? ` · ${f.context}` : ''}
                      </p>
                      {f.is_stale && (
                        <p className="mt-1 flex items-start gap-1 text-caption font-semibold text-warning">
                          <AlertTriangle size={12} className="mt-0.5 shrink-0" aria-hidden /> Old information. It may have changed since.
                        </p>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
