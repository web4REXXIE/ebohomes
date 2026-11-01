'use client'

import { useEffect, useRef, useState } from 'react'
import 'leaflet/dist/leaflet.css'
import { X, Search, LocateFixed, Loader2, MapPin, Check } from 'lucide-react'

type LatLng = { lat: number; lng: number }
type SearchResult = { place_id: number; display_name: string; lat: string; lon: string }

const DEFAULT_CENTER: [number, number] = [6.3249, 8.1137] // Abakaliki

function pinIcon(L: any) {
  return L.divIcon({
    className: '',
    html: `<div style="width:30px;height:30px;background:#2D6A4F;border:3px solid white;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 2px 8px rgba(0,0,0,0.35);"></div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 30],
  })
}

export function LocationPickerModal({
  initial,
  onClose,
  onConfirm,
}: {
  initial?: LatLng | null
  onClose: () => void
  onConfirm: (lat: number, lng: number) => void
}) {
  const mapEl = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const markerRef = useRef<any>(null)
  const leafletRef = useRef<any>(null)

  const [pin, setPin] = useState<LatLng | null>(initial ?? null)
  const [ready, setReady] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [locating, setLocating] = useState(false)
  const [message, setMessage] = useState('')

  function placePin(lat: number, lng: number, zoom?: number) {
    const L = leafletRef.current
    const map = mapRef.current
    if (!L || !map) return

    if (markerRef.current) {
      markerRef.current.setLatLng([lat, lng])
    } else {
      const marker = L.marker([lat, lng], { icon: pinIcon(L), draggable: true }).addTo(map)
      marker.on('dragend', () => {
        const p = marker.getLatLng()
        setPin({ lat: p.lat, lng: p.lng })
      })
      markerRef.current = marker
    }

    setPin({ lat, lng })
    if (zoom) map.setView([lat, lng], zoom)
    else map.panTo([lat, lng])
  }

  useEffect(() => {
    let cancelled = false

    import('leaflet').then((mod) => {
      const L = (mod as any).default ?? mod
      if (cancelled || !mapEl.current || mapRef.current) return
      leafletRef.current = L

      const start = initial ?? null
      const map = L.map(mapEl.current).setView(
        start ? [start.lat, start.lng] : DEFAULT_CENTER,
        start ? 17 : 13
      )

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map)

      map.on('click', (e: any) => placePin(e.latlng.lat, e.latlng.lng))
      mapRef.current = map

      if (start) placePin(start.lat, start.lng)
      setReady(true)
      setTimeout(() => map.invalidateSize(), 100)
    })

    return () => {
      cancelled = true
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
      markerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Lock page scroll and let Esc close the picker
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  async function runSearch(e: React.FormEvent) {
    e.preventDefault()
    const q = query.trim()
    if (q.length < 3) {
      setMessage('Type at least 3 letters to search.')
      return
    }
    setSearching(true)
    setMessage('')
    setResults([])
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&countrycodes=ng&q=${encodeURIComponent(q)}`,
        { headers: { Accept: 'application/json' } }
      )
      if (!res.ok) throw new Error('Search failed')
      const data: SearchResult[] = await res.json()
      if (data.length === 0) {
        setMessage('No match found. Try a nearby landmark or town, or tap the map to place the pin.')
      }
      setResults(data)
    } catch {
      setMessage('Search is not available right now. You can tap the map to place the pin.')
    } finally {
      setSearching(false)
    }
  }

  function chooseResult(r: SearchResult) {
    placePin(Number(r.lat), Number(r.lon), 17)
    setResults([])
    setMessage('')
  }

  function useMyLocation() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setMessage('Your browser cannot share your location. Search for the address instead.')
      return
    }
    setLocating(true)
    setMessage('')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        placePin(pos.coords.latitude, pos.coords.longitude, 18)
        setLocating(false)
      },
      () => {
        setLocating(false)
        setMessage('Could not get your location. Allow location access, or search for the address instead.')
      },
      { enableHighAccuracy: true, timeout: 12000 }
    )
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex h-[100dvh] flex-col bg-background"
      role="dialog"
      aria-modal="true"
      aria-label="Choose the property location"
    >
      {/* Top bar */}
      <div className="border-b border-border px-4 pb-3 pt-3">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold text-foreground">Set property location</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close map"
            className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-secondary"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={runSearch} className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search street, area or landmark"
              className="h-11 w-full rounded-lg border border-border bg-input pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <button
            type="submit"
            disabled={searching}
            className="flex h-11 shrink-0 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {searching ? <Loader2 size={16} className="animate-spin" /> : 'Search'}
          </button>
        </form>

        <button
          type="button"
          onClick={useMyLocation}
          disabled={locating}
          className="mt-2 flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-border text-sm font-medium text-primary hover:bg-secondary disabled:opacity-60"
        >
          {locating ? <Loader2 size={16} className="animate-spin" /> : <LocateFixed size={16} />}
          Use my current location
        </button>

        {message && <p className="mt-2 text-xs text-muted-foreground">{message}</p>}
      </div>

      {/* Map */}
      <div className="relative isolate min-h-0 flex-1">
        <div ref={mapEl} className="absolute inset-0" />

        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center bg-secondary/40">
            <Loader2 className="animate-spin text-primary" />
          </div>
        )}

        {results.length > 0 && (
          <ul className="absolute left-3 right-3 top-3 z-[1100] max-h-56 overflow-y-auto rounded-lg border border-border bg-card shadow-lg">
            {results.map((r) => (
              <li key={r.place_id}>
                <button
                  type="button"
                  onClick={() => chooseResult(r)}
                  className="flex w-full items-start gap-2 border-b border-border px-3 py-2.5 text-left text-sm text-foreground last:border-b-0 hover:bg-secondary"
                >
                  <MapPin size={14} className="mt-0.5 shrink-0 text-primary" />
                  <span className="line-clamp-2">{r.display_name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Bottom bar */}
      <div
        className="border-t border-border px-4 pt-3"
        style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
      >
        <p className="mb-2 text-xs text-muted-foreground">
          {pin
            ? 'Drag the pin or tap the map to fine-tune it. Put it on the exact building.'
            : 'Search for the address, use your location, or tap the map to drop a pin.'}
        </p>
        <button
          type="button"
          disabled={!pin}
          onClick={() => pin && onConfirm(pin.lat, pin.lng)}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
        >
          <Check size={18} />
          Confirm location
        </button>
      </div>
    </div>
  )
}