'use client'

import { useEffect, useRef, useState } from 'react'
import 'leaflet/dist/leaflet.css'
import { Map as MapIcon, PersonStanding, MapPin, ExternalLink, Info } from 'lucide-react'

export function ListingLocation({
  lat,
  lng,
  title,
  address,
}: {
  lat: number
  lng: number
  title: string
  address?: string
}) {
  const [tab, setTab] = useState<'map' | 'street'>('map')
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<any>(null)

  useEffect(() => {
    if (tab !== 'map') return
    if (!mapRef.current) return

    let cancelled = false

    import('leaflet').then((L) => {
      if (cancelled || !mapRef.current || mapInstanceRef.current) return

      const map = L.map(mapRef.current, { scrollWheelZoom: false }).setView(
        [lat, lng],
        16
      )

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map)

      const icon = L.divIcon({
        className: '',
        html: `<div style="width:30px;height:30px;background:#2D6A4F;border:3px solid white;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 2px 8px rgba(0,0,0,0.35);"></div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 30],
      })

      L.marker([lat, lng], { icon }).addTo(map).bindTooltip(title)

      mapInstanceRef.current = map
      setTimeout(() => map.invalidateSize(), 100)
    })

    return () => {
      cancelled = true
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }
    }
  }, [tab, lat, lng, title])

  const streetViewUrl = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`
  const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`

  return (
    <div className="mb-6 rounded-xl border border-border bg-card p-4 sm:p-5">
      <h3 className="mb-1 text-lg font-bold text-foreground">Location</h3>

      {address && (
        <p className="mb-4 flex items-start gap-1.5 text-sm text-muted-foreground">
          <MapPin size={16} className="mt-0.5 shrink-0 text-primary" />
          {address}
        </p>
      )}

      <div className="mb-3 inline-flex rounded-xl bg-secondary p-1">
        <button
          type="button"
          onClick={() => setTab('map')}
          aria-pressed={tab === 'map'}
          className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition ${
            tab === 'map'
              ? 'bg-background text-primary shadow-sm'
              : 'text-muted-foreground'
          }`}
        >
          <MapIcon size={16} />
          Map
        </button>

        <button
          type="button"
          onClick={() => setTab('street')}
          aria-pressed={tab === 'street'}
          className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition ${
            tab === 'street'
              ? 'bg-background text-primary shadow-sm'
              : 'text-muted-foreground'
          }`}
        >
          <PersonStanding size={16} />
          Street View
        </button>
      </div>

      {tab === 'map' ? (
        <>
          <div
            ref={mapRef}
            className="h-64 w-full overflow-hidden rounded-lg border border-border sm:h-80"
          />

          <p className="mt-3 flex items-start gap-1.5 text-xs text-muted-foreground">
            <Info size={14} className="mt-0.5 shrink-0" />
            The pin is a guide and may not mark the exact location.
          </p>
        </>
      ) : (
        <div className="rounded-lg border border-border bg-secondary/50 p-5 text-center">
          <PersonStanding size={32} className="mx-auto mb-2 text-primary" />

          <p className="mb-1 text-sm font-semibold text-foreground">
            See the street around this property
          </p>

          <p className="mb-4 text-xs text-muted-foreground">
            Opens Google Street View in a new tab. Street imagery may be
            dated, or unavailable on some streets.
          </p>

          <div className="flex flex-col justify-center gap-2 sm:flex-row">
            <a
              href={streetViewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            >
              <ExternalLink size={15} />
              Open Street View
            </a>

            <a
              href={googleMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-secondary"
            >
              <MapIcon size={15} />
              Open in Google Maps
            </a>
          </div>

          <p className="mt-3 flex items-start justify-center gap-1.5 text-xs text-muted-foreground">
            <Info size={14} className="mt-0.5 shrink-0" />
            The view stands at the listing&apos;s coordinates, which may not be
            its exact spot.
          </p>
        </div>
      )}
    </div>
  )
}