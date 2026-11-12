'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import 'leaflet/dist/leaflet.css'
import { Building2, MapPin, BedDouble, Bath, X, Loader2, Info } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { sizedPhoto } from '@/lib/image-url'
import { SmartImage } from '@/components/ui/smart-image'

/* Map view for the search page.
   Pins come from the public_listing_pins view (rounded to about 1 km). The exact pin is no longer
   readable from the listings table, so this component asks the view itself and the search page
   needs no change. Price tags that sit close together are grouped into one numbered circle.
   "Search this area" only filters what is already loaded. It does not change how results load. */

type MapListing = {
  id: string | number
  title?: string
  photos?: string[] | null
  price_monthly?: number | string | null
  location_text?: string
  property_type?: string
  bedrooms?: number | null
  bathrooms?: number | null
  featured?: boolean
}

type Pinned = MapListing & { _lat: number; _lng: number }
type Bounds = { south: number; west: number; north: number; east: number }

const DEFAULT_CENTER: [number, number] = [6.3249, 8.1137] // Abakaliki
const CLUSTER_PX = 56
const MAX_ZOOM = 17

function shortPrice(value: unknown) {
  const n = Number(value) || 0
  if (n >= 1_000_000) return `₦${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`
  if (n >= 1_000) return `₦${Math.round(n / 1_000)}k`
  return `₦${n}`
}

const naira = (value: unknown) => `₦${(Number(value) || 0).toLocaleString('en-NG')}`

export function SearchMap({
  listings,
  onOpen,
}: {
  listings: MapListing[]
  onOpen: (id: string) => void
}) {
  const mapEl = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const leafletRef = useRef<any>(null)
  const layerRef = useRef<any>(null)
  const programmatic = useRef(false)

  const [ready, setReady] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [clusterItems, setClusterItems] = useState<Pinned[] | null>(null)
  const [view, setView] = useState(0)
  const [moved, setMoved] = useState(false)
  const [area, setArea] = useState<Bounds | null>(null)

  const [pins, setPins] = useState<Record<string, { lat: number; lng: number }>>({})
  const [pinsState, setPinsState] = useState<'loading' | 'done' | 'error'>('loading')

  // Approximate pins for the listings being shown
  const idsKey = useMemo(() => listings.map((l) => String(l.id)).join(','), [listings])
  useEffect(() => {
    let alive = true
    const ids = idsKey ? idsKey.split(',') : []
    if (ids.length === 0) {
      setPins({})
      setPinsState('done')
      return
    }
    setPinsState('loading')
    ;(async () => {
      const found: Record<string, { lat: number; lng: number }> = {}
      let failed = false
      for (let i = 0; i < ids.length; i += 60) {
        const { data, error } = await supabase
          .from('public_listing_pins')
          .select('listing_id, has_pin, area_lat, area_lng')
          .in('listing_id', ids.slice(i, i + 60))
        if (error) {
          failed = true
          break
        }
        for (const row of (data as any[]) || []) {
          if (!row.has_pin || row.area_lat == null || row.area_lng == null) continue
          const lat = Number(row.area_lat)
          const lng = Number(row.area_lng)
          if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) continue
          found[String(row.listing_id)] = { lat, lng }
        }
      }
      if (!alive) return
      setPins(found)
      setPinsState(failed ? 'error' : 'done')
    })()
    return () => {
      alive = false
    }
  }, [idsKey])

  const pinned = useMemo(() => {
    const out: Pinned[] = []
    for (const l of listings) {
      const p = pins[String(l.id)]
      if (p) out.push({ ...l, _lat: p.lat, _lng: p.lng })
    }
    return out
  }, [listings, pins])

  const visible = useMemo(() => {
    if (!area) return pinned
    return pinned.filter(
      (p) => p._lat >= area.south && p._lat <= area.north && p._lng >= area.west && p._lng <= area.east
    )
  }, [pinned, area])

  const pinKey = useMemo(() => pinned.map((p) => String(p.id)).join(','), [pinned])
  const missing = listings.length - pinned.length
  const selected = visible.find((p) => String(p.id) === selectedId) ?? null

  // Create the map once
  useEffect(() => {
    let cancelled = false

    import('leaflet').then((mod) => {
      const L = (mod as any).default ?? mod
      if (cancelled || !mapEl.current || mapRef.current) return
      leafletRef.current = L

      const map = L.map(mapEl.current).setView(DEFAULT_CENTER, 12)

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map)

      layerRef.current = L.layerGroup().addTo(map)
      map.on('click', () => {
        setSelectedId(null)
        setClusterItems(null)
      })
      map.on('moveend', () => {
        if (programmatic.current) programmatic.current = false
        else setMoved(true)
        setView((v) => v + 1)
      })

      mapRef.current = map
      setReady(true)
      setTimeout(() => map.invalidateSize(), 100)
    })

    return () => {
      cancelled = true
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
      layerRef.current = null
      setReady(false)
    }
  }, [])

  // Draw price tags and numbered groups
  useEffect(() => {
    const L = leafletRef.current
    const layer = layerRef.current
    const map = mapRef.current
    if (!ready || !L || !layer || !map) return

    layer.clearLayers()

    // Group tags that would overlap at this zoom
    const cells = new Map<string, Pinned[]>()
    for (const l of visible) {
      const pt = map.latLngToContainerPoint([l._lat, l._lng])
      const key = `${Math.floor(pt.x / CLUSTER_PX)}:${Math.floor(pt.y / CLUSTER_PX)}`
      const list = cells.get(key)
      if (list) list.push(l)
      else cells.set(key, [l])
    }

    cells.forEach((group) => {
      if (group.length === 1) {
        const l = group[0]
        const id = String(l.id)
        const isSelected = id === selectedId
        const bg = isSelected ? '#111827' : '#2D6A4F'
        const border = l.featured ? '#fbbf24' : '#ffffff'
        const icon = L.divIcon({
          className: '',
          html: `<div style="position:absolute;transform:translate(-50%,-50%) ${
            isSelected ? 'scale(1.12)' : ''
          };background:${bg};color:#fff;border:2px solid ${border};border-radius:999px;padding:3px 10px;font-size:12px;font-weight:700;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.35);">${shortPrice(
            l.price_monthly
          )}</div>`,
          iconSize: [0, 0],
          iconAnchor: [0, 0],
        })
        const marker = L.marker([l._lat, l._lng], {
          icon,
          zIndexOffset: isSelected ? 1000 : l.featured ? 500 : 0,
          title: l.title || l.property_type || 'Property',
        })
        marker.on('click', () => {
          setClusterItems(null)
          setSelectedId(id)
        })
        marker.addTo(layer)
        return
      }

      const lat = group.reduce((s, p) => s + p._lat, 0) / group.length
      const lng = group.reduce((s, p) => s + p._lng, 0) / group.length
      const icon = L.divIcon({
        className: '',
        html: `<div style="position:absolute;transform:translate(-50%,-50%);display:flex;align-items:center;justify-content:center;width:42px;height:42px;background:#14532d;color:#fff;border:3px solid #fff;border-radius:999px;font-size:14px;font-weight:800;box-shadow:0 2px 10px rgba(0,0,0,0.4);">${group.length}</div>`,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      })
      const marker = L.marker([lat, lng], {
        icon,
        zIndexOffset: 800,
        title: `${group.length} properties`,
      })
      marker.on('click', () => {
        const lats = group.map((p) => p._lat)
        const lngs = group.map((p) => p._lng)
        const samePlace =
          Math.max(...lats) - Math.min(...lats) < 1e-6 && Math.max(...lngs) - Math.min(...lngs) < 1e-6
        if (samePlace || map.getZoom() >= MAX_ZOOM) {
          setSelectedId(null)
          setClusterItems(group)
        } else {
          programmatic.current = true
          map.fitBounds(L.latLngBounds(group.map((p) => [p._lat, p._lng])), {
            padding: [60, 60],
            maxZoom: MAX_ZOOM,
            animate: false,
          })
        }
      })
      marker.addTo(layer)
    })
  }, [visible, selectedId, ready, view])

  // Zoom to fit all pins when the set of properties changes (not while a chosen area is active)
  useEffect(() => {
    const L = leafletRef.current
    const map = mapRef.current
    if (!ready || !L || !map || pinned.length === 0 || area) return

    programmatic.current = true
    if (pinned.length === 1) {
      map.setView([pinned[0]._lat, pinned[0]._lng], 15, { animate: false })
    } else {
      map.fitBounds(L.latLngBounds(pinned.map((p) => [p._lat, p._lng])), {
        padding: [50, 50],
        maxZoom: 15,
        animate: false,
      })
    }
    setMoved(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, pinKey, area === null])

  function searchThisArea() {
    const map = mapRef.current
    if (!map) return
    const b = map.getBounds()
    setArea({ south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() })
    setMoved(false)
    setSelectedId(null)
    setClusterItems(null)
  }

  function clearArea() {
    setArea(null)
    setSelectedId(null)
    setClusterItems(null)
  }

  const photo = selected && Array.isArray(selected.photos) ? selected.photos[0] : undefined

  return (
    <div>
      {pinsState === 'error' && (
        <p role="alert" className="mb-2 text-xs font-medium text-destructive">
          The map pins could not be loaded. Check your connection, or use List view.
        </p>
      )}

      {pinsState === 'done' && missing > 0 && (
        <p className="mb-2 text-xs text-muted-foreground">
          {missing} of {listings.length} properties have no map pin yet. You can still see them in List view.
        </p>
      )}

      <p className="mb-2 flex items-start gap-1.5 text-xs text-muted-foreground">
        <Info size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
        <span>
          Price tags show the approximate area (about 1 km), not the exact address. The exact location is shown on the
          property page once you have a viewing booked or an approved application.
        </span>
      </p>

      <div className="relative isolate h-[70vh] min-h-[420px] w-full overflow-hidden rounded-xl border border-border">
        <div ref={mapEl} className="absolute inset-0" />

        {(!ready || pinsState === 'loading') && (
          <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-secondary/40">
            <Loader2 className="animate-spin text-primary" aria-label="Loading map" />
          </div>
        )}

        {/* Search this area / Clear area */}
        {ready && pinsState === 'done' && pinned.length > 0 && (moved || area) && (
          <div className="absolute inset-x-0 top-3 z-[1000] flex flex-col items-center gap-2 px-3">
            {moved && (
              <button
                type="button"
                onClick={searchThisArea}
                className="min-h-11 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-lg hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                Search this area
              </button>
            )}
            {area && !moved && (
              <div className="flex items-center gap-2 rounded-full border border-border bg-card py-1 pl-4 pr-1 text-sm shadow-lg">
                <span className="font-semibold text-foreground">
                  {visible.length} {visible.length === 1 ? 'property' : 'properties'} in this area
                </span>
                <button
                  type="button"
                  onClick={clearArea}
                  className="min-h-11 rounded-full px-3 text-sm font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  Clear area
                </button>
              </div>
            )}
          </div>
        )}

        {ready && pinsState === 'done' && pinned.length === 0 && (
          <div className="absolute inset-x-4 top-4 z-[1000] rounded-lg border border-border bg-card p-4 text-center text-sm text-muted-foreground shadow">
            None of these properties have a map pin yet. Switch to List view to see them.
          </div>
        )}

        {ready && area && visible.length === 0 && !moved && pinned.length > 0 && (
          <div className="absolute inset-x-4 top-20 z-[1000] rounded-lg border border-border bg-card p-4 text-center text-sm text-muted-foreground shadow">
            No pinned properties in this area. Move the map or tap Clear area.
          </div>
        )}

        {/* Several properties at the same spot */}
        {clusterItems && (
          <div className="absolute inset-x-3 bottom-3 z-[1000] mx-auto max-w-md overflow-hidden rounded-xl border border-border bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-3 py-1">
              <p className="text-sm font-semibold text-foreground">{clusterItems.length} properties in this spot</p>
              <button
                type="button"
                onClick={() => setClusterItems(null)}
                aria-label="Close list"
                className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-secondary"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
            <ul className="max-h-52 divide-y divide-border overflow-y-auto">
              {clusterItems.map((p) => (
                <li key={String(p.id)}>
                  <button
                    type="button"
                    onClick={() => onOpen(String(p.id))}
                    className="flex min-h-14 w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-secondary"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-foreground">
                        {p.title || p.property_type}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">{p.location_text}</span>
                    </span>
                    <span className="shrink-0 text-sm font-bold text-primary">{naira(p.price_monthly)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* One property */}
        {selected && !clusterItems && (
          <div className="absolute inset-x-3 bottom-3 z-[1000] mx-auto flex max-w-md overflow-hidden rounded-xl border border-border bg-card shadow-xl">
            <button
              type="button"
              onClick={() => onOpen(String(selected.id))}
              className="block w-28 shrink-0 sm:w-32"
              aria-label="View property"
            >
              {photo ? (
                <span className="relative block h-full min-h-[96px] w-full bg-secondary/40">
                  <SmartImage
                    src={sizedPhoto(photo, 300)}
                    alt={selected.title || selected.property_type || 'Property photo'}
                    compact
                  />
                </span>
              ) : (
                <div className="flex h-full min-h-[96px] w-full items-center justify-center bg-secondary text-muted-foreground">
                  <Building2 size={24} />
                </div>
              )}
            </button>

            <div className="min-w-0 flex-1 p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="whitespace-nowrap text-base font-extrabold text-primary">
                  {naira(selected.price_monthly)}
                  <span className="text-[11px] font-medium text-muted-foreground"> /month</span>
                </p>
                <button
                  type="button"
                  onClick={() => setSelectedId(null)}
                  aria-label="Close preview"
                  className="-mr-1 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full hover:bg-secondary"
                >
                  <X size={14} />
                </button>
              </div>

              <p className="mt-1 line-clamp-1 text-sm font-semibold text-foreground">
                {selected.title || selected.property_type}
              </p>

              <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin size={12} className="shrink-0" />
                <span className="line-clamp-1">{selected.location_text}</span>
              </p>

              <div className="mt-1.5 flex items-center gap-3 text-xs text-muted-foreground">
                {selected.bedrooms != null && (
                  <span className="flex items-center gap-1">
                    <BedDouble size={13} className="text-primary" />
                    {selected.bedrooms}
                  </span>
                )}
                {selected.bathrooms != null && (
                  <span className="flex items-center gap-1">
                    <Bath size={13} className="text-primary" />
                    {selected.bathrooms}
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={() => onOpen(String(selected.id))}
                className="mt-2 min-h-11 w-full rounded-lg bg-primary text-xs font-semibold text-primary-foreground hover:bg-primary/90"
              >
                View details
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
