'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { BedDouble, Bath, MapPin, ShieldCheck, Clock, ImageOff, Hourglass } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { PropertyGallery } from '@/components/property-gallery'
import { plainUrl } from '@/lib/watermark'
import { naira } from '@/lib/case-status'
import { displayTitle, listingIsLive } from '@/lib/property-display'

export type PropertyLite = {
  id: string
  title: string | null
  description: string | null
  location_text: string | null
  price_monthly: number | null
  service_charge: number | null
  caution_deposit: number | null
  property_type: string | null
  bedrooms: number | null
  bathrooms: number | null
  amenities: string[] | null
  photos: string[] | null
  video_url: string | null
  availability_date: string | null
  status: string | null
  properties?: { public_id?: string | null } | { public_id?: string | null }[] | null
}

const COLS =
  'id, title, description, location_text, price_monthly, service_charge, caution_deposit, property_type, bedrooms, bathrooms, amenities, photos, video_url, availability_date, status, properties(public_id)'

// One query for every listing a page needs, plus the real inspection records.
// A listing counts as inspected only when EboHomes has a row in public_listing_inspections.
export function usePropertyData(listingIds: string[]) {
  const key = Array.from(new Set(listingIds.filter(Boolean))).sort().join(',')
  const [listings, setListings] = useState<Record<string, PropertyLite>>({})
  const [inspected, setInspected] = useState<Set<string>>(new Set())
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    const ids = key ? key.split(',') : []
    if (!ids.length) {
      setListings({})
      setInspected(new Set())
      setReady(true)
      return
    }
    ;(async () => {
      const [{ data: l, error: le }, { data: i }] = await Promise.all([
        supabase.from('listings').select(COLS).in('id', ids),
        supabase.from('public_listing_inspections').select('listing_id').in('listing_id', ids),
      ])
      if (cancelled) return
      if (le) console.error('Could not load property details for viewing page:', le.message)
      const map = Object.fromEntries(((l ?? []) as unknown as PropertyLite[]).map((x) => [x.id, x]))
      ids.filter((id) => !map[id]).forEach((id) => console.error('Property not found for listing', id))
      setListings(map)
      setInspected(new Set((i ?? []).map((x: any) => x.listing_id)))
      setReady(true)
    })()
    return () => {
      cancelled = true
    }
  }, [key])

  return { listings, inspected, ready }
}

function publicId(p: PropertyLite): string | null {
  const x = p.properties
  if (!x) return null
  return (Array.isArray(x) ? x[0]?.public_id : x.public_id) ?? null
}

export function InspectionBadge({ inspected }: { inspected: boolean }) {
  return inspected ? (
    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-900">
      <ShieldCheck size={13} aria-hidden /> Inspected by EboHomes
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900">
      <Hourglass size={13} aria-hidden /> Not yet inspected
    </span>
  )
}

function Thumb({ src, alt, className }: { src?: string; alt: string; className: string }) {
  return (
    <div className={`shrink-0 overflow-hidden rounded-lg bg-secondary ${className}`}>
      {src ? (
        <img src={src} alt={alt} className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <div
          className="flex h-full w-full flex-col items-center justify-center gap-0.5 text-muted-foreground"
          role="img"
          aria-label="No photo available"
        >
          <ImageOff size={18} aria-hidden />
          <span className="text-[10px]">No photo</span>
        </div>
      )}
    </div>
  )
}

export function PropertySummary({
  listing,
  inspected,
  full = false,
  compact = false,
  href,
}: {
  listing: PropertyLite | undefined
  inspected: boolean
  full?: boolean
  // compact: a small row (photo, name, place, rent, status) for lists and dashboards.
  compact?: boolean
  // href: makes the compact row tappable, e.g. the public listing or the page that explains this property.
  href?: string
}) {
  if (!listing) {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-dashed border-border bg-secondary p-3 text-sm text-muted-foreground">
        <ImageOff size={18} className="mt-0.5 shrink-0" aria-hidden />
        <p>
          Property details are not available right now. The property may no longer be publicly listed.
        </p>
      </div>
    )
  }
  const photos = Array.isArray(listing.photos) ? listing.photos.filter(Boolean) : []
  const ref = publicId(listing)
  const listed = listingIsLive(listing.status)
  const title = displayTitle(listing)

  const facts = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      {listing.property_type && <span className="capitalize">{listing.property_type.replace(/_/g, ' ')}</span>}
      {listing.bedrooms != null && <span className="inline-flex items-center gap-1"><BedDouble size={13} aria-hidden />{listing.bedrooms} bed</span>}
      {listing.bathrooms != null && <span className="inline-flex items-center gap-1"><Bath size={13} aria-hidden />{listing.bathrooms} bath</span>}
      {ref && <span>Ref {ref}</span>}
    </div>
  )

  const statusRow = (
    <div className="flex flex-wrap items-center gap-2">
      <InspectionBadge inspected={inspected} />
      <span
        className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${
          listed ? 'border-blue-300 bg-blue-50 text-blue-900' : 'border-slate-300 bg-slate-100 text-slate-800'
        }`}
      >
        <Clock size={13} aria-hidden /> {listed ? 'Currently listed' : 'Not currently listed'}
      </span>
      {listing.availability_date && (
        <span className="text-xs text-muted-foreground">Available from {new Date(listing.availability_date).toLocaleDateString('en-NG')}</span>
      )}
    </div>
  )

  if (compact) {
    const row = (
      <div className="flex gap-3">
        <Thumb src={photos[0] ? plainUrl(photos[0], 300) : undefined} alt={title} className="h-16 w-20" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-foreground">{title}</p>
          {listing.location_text && (
            <p className="flex items-center gap-1 truncate text-xs text-muted-foreground"><MapPin size={11} aria-hidden />{listing.location_text}</p>
          )}
          <p className="text-sm font-bold text-foreground">{naira(listing.price_monthly)} <span className="text-xs font-normal text-muted-foreground">per month</span></p>
          <p className="truncate text-xs text-muted-foreground">
            {[
              listing.bedrooms != null ? `${listing.bedrooms} bed` : null,
              listing.bathrooms != null ? `${listing.bathrooms} bath` : null,
              ref ? `Ref ${ref}` : null,
            ].filter(Boolean).join(' · ')}
          </p>
          {inspected && (
            <p className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold text-emerald-800">
              <ShieldCheck size={12} aria-hidden /> Inspected by EboHomes
            </p>
          )}
        </div>
      </div>
    )
    return href ? (
      <Link href={href} className="block rounded-lg transition hover:bg-secondary/60 focus-visible:outline-2 focus-visible:outline-primary">{row}</Link>
    ) : (
      row
    )
  }

  if (!full) {
    return (
      <div className="flex gap-3">
        <Thumb src={photos[0] ? plainUrl(photos[0], 400) : undefined} alt={title} className="h-24 w-28" />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="truncate text-sm font-bold text-foreground">{title}</p>
          {listing.location_text && (
            <p className="flex items-center gap-1 truncate text-xs text-muted-foreground"><MapPin size={12} aria-hidden />{listing.location_text}</p>
          )}
          <p className="text-sm font-bold text-foreground">{naira(listing.price_monthly)} <span className="text-xs font-normal text-muted-foreground">per month</span></p>
          {facts}
          {statusRow}
        </div>
      </div>
    )
  }

  const extras: [string, number | null][] = [
    ['Service charge', listing.service_charge],
    ['Caution deposit', listing.caution_deposit],
  ]

  return (
    <div className="space-y-4">
      <PropertyGallery images={photos} title={title} />
      <div className="space-y-2">
        <h3 className="text-lg font-bold text-foreground">{title}</h3>
        {listing.location_text && (
          <p className="flex items-center gap-1 text-sm text-muted-foreground"><MapPin size={14} aria-hidden />{listing.location_text}</p>
        )}
        <p className="text-xl font-bold text-foreground">{naira(listing.price_monthly)} <span className="text-sm font-normal text-muted-foreground">per month</span></p>
        {facts}
        {statusRow}
      </div>
      {extras.some(([, n]) => Number(n) > 0) && (
        <div className="rounded-lg border border-border bg-secondary p-3 text-sm">
          <p className="mb-1 font-semibold text-foreground">Known additional charges</p>
          {extras.filter(([, n]) => Number(n) > 0).map(([k, n]) => (
            <p key={k} className="flex justify-between"><span className="text-muted-foreground">{k}</span><span className="font-semibold">{naira(n)}</span></p>
          ))}
        </div>
      )}
      {listing.description && <p className="whitespace-pre-line text-sm text-foreground">{listing.description}</p>}
      {listing.amenities && listing.amenities.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-semibold text-foreground">Amenities</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {listing.amenities.map((a) => (
              <span key={a} className="flex items-center gap-2 text-sm text-foreground"><ShieldCheck size={14} className="text-primary" aria-hidden />{a}</span>
            ))}
          </div>
        </div>
      )}
      {listing.video_url && (
        <video src={listing.video_url} controls preload="metadata" className="w-full rounded-lg bg-black" />
      )}
      {listed ? (
        <Link href={`/listing/${listing.id}`} className="inline-block text-sm font-semibold text-primary hover:underline">Open the public listing</Link>
      ) : (
        <p className="text-xs text-muted-foreground">This property is not live to the public right now.</p>
      )}
    </div>
  )
}