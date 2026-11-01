'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import 'leaflet/dist/leaflet.css'
import { Building2, MapPin, BedDouble, Bath, X, Loader2 } from 'lucide-react'

type MapListing = {
  id: string | number
  title?: string
  photos?: string[] | null
  price_monthly?: number | string | null
  location_text?: string
  property_type?: string
  bedrooms?: number | null
  bathrooms?: number | null
  lat?: number | string | null
  lng?: number | string | null
  featured?: boolean
}

const DEFAULT_CENTER: [number, number] = [6.3249, 8.1137] // Abakaliki

function shortPrice(value: unknown) {
  const n = Number(value) || 0
  if (n >= 1_000_000) return `₦${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`
  if (n >= 1_000) return `₦${Math.round(n / 1_000)}k`
  return `₦${n}`
}

const naira = (value: unknown) => `₦${(Number(value) || 0).toLocaleString('en-NG')}`

function cardImage(url: string, width: number) {
  if (!url || !url.includes('/upload/')) return url
  return url.replace('/upload/', `/upload/f_auto,q_auto,w_${width}/`)
}

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

  const [ready, setReady] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Only properties with a real pin can be drawn
  const pinned = useMemo(() => {
    const out: (MapListing & { _lat: number; _lng: number })[] = []
    for (const l of listings) {
      if (l.lat == null || l.lng == null) continue
      const lat = Number(l.lat)
      const lng = Number(l.lng)
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
      if (lat === 0 && lng === 0) continue
      out.push({ ...l, _lat: lat, _lng: lng })
    }
    return out
  }, [listings])

  const pinKey = useMemo(() => pinned.map((p) => String(p.id)).join(','), [pinned])
  const missing = listings.length - pinned.length
  const selected = pinned.find((p) => String(p.id) === selectedId) ?? null

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
      map.on('click', () => setSelectedId(null))

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

  // Draw the price tags
  useEffect(() => {
    const L = leafletRef.current
    const layer = layerRef.current
    if (!ready || !L || !layer) return

    layer.clearLayers()

    for (const l of pinned) {
      const id = String(l.id)
      const isSelected = id === selectedId
      const bg = isSelected ? '#111827' : '#2D6A4F'
      const border = l.featured ? '#fbbf24' : '#ffffff'

      const icon = L.divIcon({
        className: '',
        html: `<div style="position:absolute;transform:translate(-50%,-100%) ${
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
      marker.on('click', () => setSelectedId(id))
      marker.addTo(layer)
    }
  }, [pinned, selectedId, ready])

  // Zoom to fit all pins when the set of properties changes
  useEffect(() => {
    const L = leafletRef.current
    const map = mapRef.current
    if (!ready || !L || !map || pinned.length === 0) return

    if (pinned.length === 1) {
      map.setView([pinned[0]._lat, pinned[0]._lng], 16)
    } else {
      const bounds = L.latLngBounds(pinned.map((p) => [p._lat, p._lng]))
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, pinKey])

  const photo = selected && Array.isArray(selected.photos) ? selected.photos[0] : undefined

  return (
    <div>
      {missing > 0 && (
        <p className="mb-2 text-xs text-muted-foreground">
          {missing} of {listings.length} properties have no map pin yet. You can still see them in List view.
        </p>
      )}

      <div className="relative isolate h-[70vh] min-h-[420px] w-full overflow-hidden rounded-xl border border-border">
        <div ref={mapEl} className="absolute inset-0" />

        {!ready && (
          <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-secondary/40">
            <Loader2 className="animate-spin text-primary" />
          </div>
        )}

        {ready && pinned.length === 0 && (
          <div className="absolute inset-x-4 top-4 z-[1000] rounded-lg border border-border bg-card p-4 text-center text-sm text-muted-foreground shadow">
            None of these properties have a map pin yet. Switch to List view to see them.
          </div>
        )}

        {selected && (
          <div className="absolute inset-x-3 bottom-3 z-[1000] mx-auto flex max-w-md overflow-hidden rounded-xl border border-border bg-card shadow-xl">
            <button
              type="button"
              onClick={() => onOpen(String(selected.id))}
              className="block w-28 shrink-0 sm:w-32"
              aria-label="View property"
            >
              {photo ? (
                <img
                  src={cardImage(photo, 300)}
                  alt={selected.title || selected.property_type || 'Property photo'}
                  className="h-full w-full object-cover"
                />
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
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full hover:bg-secondary"
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
                className="mt-2 h-8 w-full rounded-lg bg-primary text-xs font-semibold text-primary-foreground hover:bg-primary/90"
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