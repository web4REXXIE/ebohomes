'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Search,
  SlidersHorizontal,
  Grid,
  List as ListIcon,
  X,
  Heart,
  Share2,
  MapPin,
  BedDouble,
  Bath,
  Star,
  ShieldCheck,
  Calendar,
  Copy,
  Send,
  MessageCircle,
  Building2,
  Camera,
  ChevronLeft,
  ChevronRight,
  Info,
} from 'lucide-react'
import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { RecentSearches, saveRecentSearch } from '@/components/recent-searches'
import { SearchAlertBar } from '@/components/search-alert-bar'
import { useInspectedIds } from '@/lib/use-inspected-ids'
import { rankListings } from '@/lib/listing-rank'
import { useUnitInfo } from '@/lib/use-unit-info'
import { sizedPhoto, photoSrcSet } from '@/lib/image-url'
import { upfrontTotal } from '@/lib/property-display' // CHANGED: used for the upfront line on each card
import { SmartImage } from '@/components/ui/smart-image'
import dynamic from 'next/dynamic'

// The map loads only when needed. It uses Leaflet, which needs the browser.
const SearchMap = dynamic(() => import('@/components/search-map').then((m) => ({ default: m.SearchMap })), {
  ssr: false,
  loading: () => (
    <div className="h-[60vh] animate-pulse rounded-card border border-border bg-secondary" aria-busy="true" />
  ),
})

/* Stage 7: search page redesign.
   Data loading, filtering, sorting, paging, saving and sharing logic is the same as before.
   New in this file: design tokens, accessible dialogs, and filters kept in sync with the URL.
   The Map view uses components/search-map.tsx.
   New: the phone filter sheet is built from chips and Min / Max boxes (renderMobileFilters).
   The desktop sidebar still uses renderFilters. Both change the same filter state. */

// Values must match what is stored in listings.property_type (same list as /list-property)
const PROPERTY_TYPES = [
  { value: 'Flat / Apartment', label: 'Flat / Apartment' },
  { value: 'Bungalow', label: 'Bungalow' },
  { value: 'Duplex', label: 'Duplex' },
  { value: 'Self Contain', label: 'Self Contain' },
  { value: 'Penthouse', label: 'Penthouse' },
  { value: 'Hostel', label: 'Hostel' },
  { value: 'Office', label: 'Office' },
  { value: 'Shop / Mall', label: 'Shop / Mall' },
  { value: 'Warehouse', label: 'Warehouse' },
  { value: 'Land / Plot', label: 'Land / Plot' },
  { value: 'Event Center', label: 'Event Center' },
]

const AMENITIES = ['Parking Space', '24/7 Security', 'Water Supply', 'Generator', 'Furnished']

// Monthly rent slider. When it sits at the cap, there is no upper limit.
const PRICE_CAP = 2000000
const PAGE_SIZE = 12

const COUNT_OPTIONS = ['1', '2', '3', '4+']
const SORT_OPTIONS = [
  { value: 'recommended', label: 'Recommended' },
  { value: 'newest', label: 'Newest first' },
  { value: 'price-low', label: 'Price: Low to High' },
  { value: 'price-high', label: 'Price: High to Low' },
]

// '4+' means 4 or more; any other value is an exact match
const matchCount = (actual: number | null | undefined, wanted: string) =>
  wanted.endsWith('+') ? Number(actual) >= parseInt(wanted) : String(actual) === wanted

const naira = (value: unknown) => `₦${(Number(value) || 0).toLocaleString('en-NG')}`

function addedLabel(createdAt?: string) {
  if (!createdAt) return ''
  const days = Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000)
  if (days <= 0) return 'Added today'
  if (days === 1) return 'Added yesterday'
  if (days < 7) return `Added ${days} days ago`
  if (days < 30) return `Added ${Math.floor(days / 7)}w ago`
  return ''
}

// Page numbers with ellipsis, e.g. 1 … 4 5 6 … 20
function getPageNumbers(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const pages: (number | '…')[] = [1]
  const start = Math.max(2, current - 1)
  const end = Math.min(total - 1, current + 1)
  if (start > 2) pages.push('…')
  for (let i = start; i <= end; i++) pages.push(i)
  if (end < total - 1) pages.push('…')
  pages.push(total)
  return pages
}

/* ---------- Seeded shuffle: new order on every visit/reload, stable while filtering ---------- */

function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function seededShuffle<T>(items: T[], seed: number) {
  const arr = [...items]
  const random = mulberry32(seed)
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

/* ---------- URL <-> filters ----------
   Parameters (same names the Home page already uses, plus the ones this page was missing):
   location, type, q, minPrice, maxPrice, bedrooms, bathrooms, amenity (repeatable), featured=1, sort */

type UrlFilters = {
  location: string
  type: string
  q: string
  minPrice: number
  maxPrice: number
  bedrooms: string
  bathrooms: string
  amenities: string[]
  featured: boolean
  sort: string
}

function readNumber(value: string | null): number | null {
  if (value === null || value.trim() === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

// A raw "4+" typed into an address bar arrives as "4 " (a plus sign decodes to a space)
function readCount(value: string | null): string {
  if (!value) return ''
  const v = value.trim().replace(/\s/g, '+')
  const normal = value.endsWith(' ') && value.trim() === '4' ? '4+' : v
  return COUNT_OPTIONS.includes(normal) ? normal : ''
}

function parseFilters(sp: URLSearchParams): UrlFilters {
  const min = readNumber(sp.get('minPrice'))
  const max = readNumber(sp.get('maxPrice'))
  const sort = sp.get('sort') || ''
  return {
    location: sp.get('location') || '',
    type: sp.get('type') || '',
    q: sp.get('q') || '',
    minPrice: min === null ? 0 : Math.min(Math.max(0, min), PRICE_CAP),
    maxPrice: max === null ? PRICE_CAP : Math.min(Math.max(0, max), PRICE_CAP),
    bedrooms: readCount(sp.get('bedrooms')),
    bathrooms: readCount(sp.get('bathrooms')),
    amenities: AMENITIES.filter((a) => sp.getAll('amenity').includes(a)),
    featured: sp.get('featured') === '1',
    sort: SORT_OPTIONS.some((o) => o.value === sort) ? sort : 'recommended',
  }
}

function buildQuery(f: UrlFilters): string {
  const p = new URLSearchParams()
  if (f.location) p.set('location', f.location)
  if (f.type) p.set('type', f.type)
  if (f.q) p.set('q', f.q)
  if (f.minPrice > 0) p.set('minPrice', String(f.minPrice))
  if (f.maxPrice < PRICE_CAP) p.set('maxPrice', String(f.maxPrice))
  if (f.bedrooms) p.set('bedrooms', f.bedrooms)
  if (f.bathrooms) p.set('bathrooms', f.bathrooms)
  for (const a of f.amenities) p.append('amenity', a)
  if (f.featured) p.set('featured', '1')
  if (f.sort !== 'recommended') p.set('sort', f.sort)
  return p.toString()
}

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i])

/* ---------- Dialog behaviour: focus in, Tab kept inside, Escape closes, page scroll locked ---------- */

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function useDialog(open: boolean, onClose: () => void, panelRef: RefObject<HTMLDivElement | null>) {
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  })

  useEffect(() => {
    if (!open) return
    const panel = panelRef.current
    const previous = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const items = () => Array.from(panel?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])
    ;(items()[0] ?? panel)?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        closeRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const list = items()
      if (list.length === 0) {
        event.preventDefault()
        panel?.focus()
        return
      }
      const first = list[0]
      const last = list[list.length - 1]
      const active = document.activeElement
      const outside = !panel?.contains(active)
      if (event.shiftKey && (active === first || outside)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (active === last || outside)) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      previous?.focus?.()
    }
  }, [open, panelRef])
}

/* ---------------- Budget boxes (phone filter sheet) ----------------
   Two number boxes, Min and Max rent per month. An empty box means no limit on that side.
   The boxes keep what the person types in their own state, so typing is never interrupted.
   Anything above the cap counts as "no upper limit", the same rule the old slider used. */

const digitsOnly = (v: string) => v.replace(/\D/g, '')
const parseMinText = (t: string) => (t === '' ? 0 : Math.min(Number(t), PRICE_CAP))
const parseMaxText = (t: string) => (t === '' ? PRICE_CAP : Math.min(Number(t), PRICE_CAP))

function BudgetInputs({
  id,
  minPrice,
  maxPrice,
  onMin,
  onMax,
  inputClass,
}: {
  id: string
  minPrice: number
  maxPrice: number
  onMin: (n: number) => void
  onMax: (n: number) => void
  inputClass: string
}) {
  const [minText, setMinText] = useState(minPrice > 0 ? String(minPrice) : '')
  const [maxText, setMaxText] = useState(maxPrice < PRICE_CAP ? String(maxPrice) : '')

  // When something else changes the budget (Reset, a recent search, the Back button), follow it.
  useEffect(() => {
    if (parseMinText(minText) !== minPrice) setMinText(minPrice > 0 ? String(minPrice) : '')
  }, [minPrice, minText])
  useEffect(() => {
    if (parseMaxText(maxText) !== maxPrice) setMaxText(maxPrice < PRICE_CAP ? String(maxPrice) : '')
  }, [maxPrice, maxText])

  const minTooHigh = minPrice > 0 && maxPrice < PRICE_CAP && minPrice > maxPrice

  return (
    <div>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <label htmlFor={`${id}-min`} className="sr-only">
            Minimum rent per month
          </label>
          <input
            id={`${id}-min`}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder="Min"
            value={minText}
            onChange={(e) => {
              const t = digitsOnly(e.target.value)
              setMinText(t)
              onMin(parseMinText(t))
            }}
            className={inputClass}
          />
        </div>
        <span className="text-muted-foreground" aria-hidden="true">
          —
        </span>
        <div className="min-w-0 flex-1">
          <label htmlFor={`${id}-max`} className="sr-only">
            Maximum rent per month
          </label>
          <input
            id={`${id}-max`}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder="Max"
            value={maxText}
            onChange={(e) => {
              const t = digitsOnly(e.target.value)
              setMaxText(t)
              onMax(parseMaxText(t))
            }}
            className={inputClass}
          />
        </div>
      </div>

      <p className="mt-1.5 text-xs text-muted-foreground">
        {minPrice > 0 || maxPrice < PRICE_CAP
          ? `${minPrice > 0 ? naira(minPrice) : 'No minimum'} to ${maxPrice < PRICE_CAP ? naira(maxPrice) : 'no limit'}`
          : `Leave empty for no limit. Above ${naira(PRICE_CAP)} counts as no limit.`}
      </p>
      {minTooHigh && (
        <p role="alert" className="mt-1 text-xs font-medium text-destructive">
          The minimum is higher than the maximum, so nothing will match.
        </p>
      )}
    </div>
  )
}

/* ---------------- Share sheet ---------------- */

function ShareSheet({ listing, onClose }: { listing: any; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [copied, setCopied] = useState(false)
  const [canNativeShare, setCanNativeShare] = useState(false)

  useDialog(true, onClose, panelRef)

  useEffect(() => {
    setCanNativeShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function')
  }, [])

  const url = `${window.location.origin}/listing/${listing.id}`
  const text = `Check out this property on EboHomes: ${listing.title || listing.location_text || ''}`
  const encodedUrl = encodeURIComponent(url)
  const encodedText = encodeURIComponent(text)

  const links = {
    whatsapp: `https://wa.me/?text=${encodedText}%20${encodedUrl}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
    x: `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`,
    telegram: `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`,
  }

  function open(platform: keyof typeof links) {
    window.open(links[platform], '_blank', 'noopener,noreferrer')
    onClose()
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(onClose, 900)
    } catch {
      window.prompt('Copy this link:', url)
    }
  }

  async function nativeShare() {
    try {
      await navigator.share({ title: listing.title || 'Property on EboHomes', text, url })
      onClose()
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return
      console.error('Native share failed:', error)
    }
  }

  const buttonClass =
    'flex min-h-11 items-center gap-2 rounded-control border border-border px-3 py-2.5 text-sm font-medium text-foreground transition hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50'

  const mark = 'flex h-[18px] w-[18px] items-center justify-center rounded-full bg-foreground text-[10px] font-bold leading-none text-background'

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-heading"
        tabIndex={-1}
        className="w-full max-w-md rounded-t-panel bg-card p-5 shadow-overlay outline-none sm:rounded-panel"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between">
          <h2 id="share-heading" className="text-base font-bold text-foreground">
            Share this property
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close share menu"
            className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <p className="mb-4 truncate text-xs text-muted-foreground">
          {listing.title || listing.location_text}
        </p>

        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => open('whatsapp')} className={buttonClass}>
            <MessageCircle size={18} className="text-primary" aria-hidden="true" />
            WhatsApp
          </button>

          <button type="button" onClick={() => open('facebook')} className={buttonClass}>
            <span className={mark} aria-hidden="true">f</span>
            Facebook
          </button>

          <button type="button" onClick={() => open('x')} className={buttonClass}>
            <span className={mark} aria-hidden="true">X</span>
            X (Twitter)
          </button>

          <button type="button" onClick={() => open('telegram')} className={buttonClass}>
            <Send size={18} className="text-primary" aria-hidden="true" />
            Telegram
          </button>

          <button type="button" onClick={copyLink} className={buttonClass}>
            <Copy size={18} aria-hidden="true" />
            {copied ? 'Link copied!' : 'Copy link'}
          </button>

          {canNativeShare && (
            <button type="button" onClick={nativeShare} className={buttonClass}>
              <Share2 size={18} aria-hidden="true" />
              More apps
            </button>
          )}
        </div>

        <p className="mt-4 text-xs leading-snug text-muted-foreground">
          For TikTok or Instagram, tap &quot;More apps&quot; on your phone, or copy the link and
          paste it into your post or story.
        </p>
      </div>
    </div>
  )
}

/* ---------------- Property card ---------------- */

function PropertyCard({
  listing,
  layout,
  saved,
  onToggleSave,
  onShare,
}: {
  listing: any
  layout: 'grid' | 'list'
  saved: boolean
  onToggleSave: () => void
  onShare: () => void
}) {
  const isList = layout === 'list'
  const photo: string | undefined = Array.isArray(listing.photos) ? listing.photos[0] : undefined
  const photoCount: number = Array.isArray(listing.photos) ? listing.photos.length : 0
  const featured = !!listing.featured
  const added = addedLabel(listing.created_at)
  const name = String(listing.title || listing.property_type || 'property')
  const href = `/listing/${listing.id}`

  // Physical inspection comes from the public_listing_inspections view, never from listings.verified
  const inspected = useInspectedIds([String(listing.id)]).has(String(listing.id))
  const unitInfo = useUnitInfo(String(listing.id))

  // CHANGED: rent + service charge + caution deposit. null unless all three amounts are listed.
  const upfront = upfrontTotal(listing)

  function requestViewing() {
    const params = new URLSearchParams({
      new: '1',
      category: 'viewing',
      listing: String(listing.id),
      subject: `Viewing: ${String(listing.title || listing.property_type || 'Property').slice(0, 90)}`,
    })

    window.location.assign(`/messages?${params.toString()}`)
  }

  const badge =
    'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold shadow-rest'

  return (
    <article
      className={cn(
        'group flex flex-col overflow-hidden rounded-card bg-card shadow-rest transition-shadow hover:shadow-raised',
        featured ? 'border border-featured ring-1 ring-featured/40' : 'border border-border',
        isList && 'md:flex-row'
      )}
    >
      {/* Photo */}
      <div className={cn('relative', isList && 'md:w-72 md:shrink-0')}>
        <Link
          href={href}
          aria-label={`View ${name}`}
          className={cn(
            'block w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50',
            isList && 'md:h-full'
          )}
        >
          {photo ? (
            <div
              className={cn(
                'relative w-full overflow-hidden bg-secondary/40',
                isList ? 'aspect-[4/3] md:aspect-auto md:h-full md:min-h-52' : 'aspect-[4/3]'
              )}
            >
              <SmartImage
                src={sizedPhoto(photo, 600)}
                srcSet={photoSrcSet(photo, [320, 480, 640])}
                sizes={isList ? '(min-width: 768px) 288px, 100vw' : '(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw'}
                alt=""
                className="transition-transform duration-500 motion-reduce:transition-none group-hover:scale-[1.03]"
              />
            </div>
          ) : (
            <div className="flex aspect-[4/3] w-full items-center justify-center bg-secondary text-muted-foreground md:aspect-auto md:h-full md:min-h-40">
              <Building2 size={28} aria-hidden="true" />
            </div>
          )}
        </Link>

        <div className="pointer-events-none absolute left-2 top-2 flex flex-col items-start gap-1">
          {featured && (
            <span className={cn(badge, 'bg-featured text-featured-foreground')}>
              <Star size={12} className="fill-current" aria-hidden="true" />
              Featured
            </span>
          )}

          {inspected && (
            <span className={cn(badge, 'bg-forest text-forest-foreground ring-1 ring-white/25')}>
              <ShieldCheck size={12} aria-hidden="true" />
              Inspected by EboHomes
            </span>
          )}

        </div>

        <button
          type="button"
          onClick={onToggleSave}
          aria-label={saved ? 'Remove from saved properties' : 'Save property'}
          aria-pressed={saved}
          className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-full bg-card/95 text-foreground shadow-rest transition hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <Heart
            size={18}
            aria-hidden="true"
            className={saved ? 'fill-destructive text-destructive' : 'text-foreground'}
          />
        </button>

        {photoCount > 0 && (
          <div className="pointer-events-none absolute bottom-2 left-2 flex items-center gap-1 rounded-md bg-black/60 px-2 py-1 text-xs font-medium text-white backdrop-blur-sm">
            <Camera size={12} aria-hidden="true" />
            <span className="sr-only">Photos: </span>
            {photoCount}
          </div>
        )}
      </div>

      {/* Details */}
      <div className="flex min-w-0 flex-1 flex-col p-3 sm:p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="whitespace-nowrap text-lg font-bold leading-tight text-primary">
              {naira(listing.price_monthly)}
              <span className="text-xs font-medium text-muted-foreground"> /month</span>
            </p>
            {Number(listing.price_yearly) > 0 && (
              <p className="text-xs text-muted-foreground">{naira(listing.price_yearly)}/year</p>
            )}
            {/* CHANGED: upfront total, only when rent, service charge and caution deposit are all listed */}
            {upfront !== null && (
              <p className="text-xs text-muted-foreground">{naira(upfront)} upfront</p>
            )}
          </div>

          <button
            type="button"
            onClick={onShare}
            aria-label={`Share ${name}`}
            className="-mr-1 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <Share2 size={18} aria-hidden="true" />
          </button>
        </div>

        <h3 className="mt-1 text-base font-semibold text-foreground">
          <Link
            href={href}
            className="line-clamp-1 rounded-sm hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            {listing.title || listing.property_type}
          </Link>
        </h3>

        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
          <MapPin size={12} className="shrink-0" aria-hidden="true" />
          <span className="line-clamp-1">{listing.location_text}</span>
        </p>
        {unitInfo && (
          <p className="mt-0.5 line-clamp-1 text-xs font-semibold text-primary">
            Unit {unitInfo.unit}, {unitInfo.estateName}
          </p>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {listing.property_type && (
            <span className="rounded-full bg-secondary px-2 py-0.5 font-medium text-foreground">
              {listing.property_type}
            </span>
          )}
          {listing.bedrooms != null && (
            <span className="flex items-center gap-1">
              <BedDouble size={14} className="text-primary" aria-hidden="true" />
              {listing.bedrooms} {Number(listing.bedrooms) === 1 ? 'bed' : 'beds'}
            </span>
          )}
          {listing.bathrooms != null && (
            <span className="flex items-center gap-1">
              <Bath size={14} className="text-primary" aria-hidden="true" />
              {listing.bathrooms} {Number(listing.bathrooms) === 1 ? 'bath' : 'baths'}
            </span>
          )}
        </div>

        {added && <p className="mt-2 text-xs font-medium text-primary">{added}</p>}

        <div className="mt-auto grid grid-cols-2 gap-2 pt-3">
          <Link
            href={href}
            aria-label={`Details: ${name}`}
            className={cn(buttonVariants({ variant: 'outline' }), 'px-2')}
          >
            Details
          </Link>
          <Button type="button" onClick={requestViewing} className="gap-1 px-2">
            <Calendar size={14} aria-hidden="true" />
            Viewing
          </Button>
        </div>
      </div>
    </article>
  )
}

function CardSkeleton() {
  return (
    <div className="overflow-hidden rounded-card border border-border bg-card" aria-hidden="true">
      <div className="aspect-[4/3] animate-pulse bg-secondary" />
      <div className="space-y-3 p-4">
        <div className="h-5 w-1/2 animate-pulse rounded bg-secondary" />
        <div className="h-4 w-3/4 animate-pulse rounded bg-secondary" />
        <div className="h-4 w-1/3 animate-pulse rounded bg-secondary" />
        <div className="grid grid-cols-2 gap-2 pt-1">
          <div className="h-11 animate-pulse rounded-xl bg-secondary" />
          <div className="h-11 animate-pulse rounded-xl bg-secondary" />
        </div>
      </div>
    </div>
  )
}

/* ---------------- Pagination ---------------- */

function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number
  totalPages: number
  onChange: (p: number) => void
}) {
  if (totalPages <= 1) return null

  const base =
    'flex h-11 min-w-11 items-center justify-center rounded-control border px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50'

  return (
    <nav className="mt-8 flex flex-col items-center gap-3" aria-label="Pagination">
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        <button
          type="button"
          onClick={() => onChange(page - 1)}
          disabled={page === 1}
          aria-label="Previous page"
          className={`${base} border-border bg-card text-foreground hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40`}
        >
          <ChevronLeft size={18} aria-hidden="true" />
        </button>

        {getPageNumbers(page, totalPages).map((p, i) =>
          p === '…' ? (
            <span key={`gap-${i}`} className="px-1 text-muted-foreground" aria-hidden="true">
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => onChange(p)}
              aria-label={`Page ${p}`}
              aria-current={p === page ? 'page' : undefined}
              className={`${base} ${
                p === page
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-card text-foreground hover:bg-secondary'
              }`}
            >
              {p}
            </button>
          )
        )}

        <button
          type="button"
          onClick={() => onChange(page + 1)}
          disabled={page === totalPages}
          aria-label="Next page"
          className={`${base} border-border bg-card text-foreground hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40`}
        >
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      </div>

      <p className="text-xs text-muted-foreground">
        Page {page} of {totalPages}
      </p>
    </nav>
  )
}

/* ---------------- Page ---------------- */

// useSearchParams needs a Suspense boundary. Header and Footer stay outside it.
export default function SearchPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <Suspense fallback={<SearchFallback />}>
        <SearchContent />
      </Suspense>
      <Footer />
    </div>
  )
}

function SearchFallback() {
  return (
    <main className="flex-1" aria-busy="true">
      <div className="border-b border-border bg-cream">
        <div className="container-wide py-6 md:py-8">
          <h1 className="text-h2 font-bold text-foreground md:text-h1">Find rentals in Ebonyi State</h1>
        </div>
      </div>
      <div className="container-wide pt-5">
        <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 sm:gap-4 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      </div>
    </main>
  )
}

function SearchContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const urlString = searchParams.toString()

  const resultsTopRef = useRef<HTMLDivElement>(null)
  const sheetRef = useRef<HTMLDivElement>(null)

  const [listings, setListings] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [viewMode, setViewMode] = useState<'grid' | 'list' | 'map'>('grid')
  const [showMobileFilters, setShowMobileFilters] = useState(false)
  const [sortBy, setSortBy] = useState('recommended')
  const [page, setPage] = useState(1)

  // New random seed on every visit/reload so featured listings rotate
  const [seed, setSeed] = useState<number | null>(null)

  const [locationText, setLocationText] = useState('')
  const [search, setSearch] = useState('')
  const [propertyType, setPropertyType] = useState('')
  const [minPrice, setMinPrice] = useState(0)
  const [maxPrice, setMaxPrice] = useState(PRICE_CAP)
  const [bedrooms, setBedrooms] = useState<string>('')
  const [bathrooms, setBathrooms] = useState<string>('')
  const [amenities, setAmenities] = useState<string[]>([])
  const [featuredOnly, setFeaturedOnly] = useState(false)

  const [userId, setUserId] = useState<string | null>(null)
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set())
  const [shareTarget, setShareTarget] = useState<any>(null)

  // URL sync: `hydrated` turns true once the first URL has been read into the controls.
  // `lastUrl` is the query string this page last read or wrote, so its own writes are not re-read.
  const [hydrated, setHydrated] = useState(false)
  const lastUrl = useRef<string | null>(null)

  useEffect(() => {
    setSeed(Math.floor(Math.random() * 2147483647))
  }, [])

  // URL -> controls. Runs on first load, and again when something else changes the address
  // (a recent-search link, the browser's back button, a shared link opened in this tab).
  useEffect(() => {
    if (lastUrl.current === urlString) return
    lastUrl.current = urlString

    const f = parseFilters(new URLSearchParams(urlString))
    setLocationText(f.location)
    setPropertyType(f.type)
    setSearch(f.q)
    setMinPrice(f.minPrice)
    setMaxPrice(f.maxPrice)
    setBedrooms(f.bedrooms)
    setBathrooms(f.bathrooms)
    setAmenities((prev) => (sameList(prev, f.amenities) ? prev : f.amenities))
    setFeaturedOnly(f.featured)
    setSortBy(f.sort)
    setHydrated(true)
  }, [urlString])

  useEffect(() => {
    const fetchListings = async () => {
      setLoading(true)
      setLoadError(false)

      const { data, error } = await supabase
        .from('listings')
        .select(
          // CHANGED: service_charge and caution_deposit added for the upfront line on each card
          'id, landlord_id, title, photos, price_monthly, price_yearly, service_charge, caution_deposit, location_text, property_type, bedrooms, bathrooms, amenities, created_at, verified, featured, availability_confirmed_at, video_url, description'
        )
        .eq('status', 'approved')
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Failed to load listings:', error.message)
        setLoadError(true)
      }

      // Listings on a property under an administrator hold are not shown in search.
      // If the hold list cannot be loaded, search still works (the hold still blocks new applications in the database).
      let rows = data || []
      const { data: held, error: heldError } = await supabase.rpc('held_listing_ids')
      if (!heldError && Array.isArray(held) && held.length > 0) {
        const heldSet = new Set<string>(held as string[])
        rows = rows.filter((l: any) => !heldSet.has(l.id))
      }

      // Listings another tenant is completing a reservation for are not shown either.
      // If this call fails (for example the SQL was not applied yet), search works as before.
      // The database still refuses applications and payments on a reserved property.
      const { data: reserved, error: reservedError } = await supabase.rpc('reserved_listing_ids')
      if (!reservedError && Array.isArray(reserved) && reserved.length > 0) {
        const reservedSet = new Set<string>(reserved as string[])
        rows = rows.filter((l: any) => !reservedSet.has(l.id))
      }

      setListings(rows)
      setLoading(false)
    }
    fetchListings()
  }, [reloadKey])

  // Saved properties for the logged-in user
  useEffect(() => {
    async function loadSaved() {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      setUserId(user.id)

      const { data, error } = await supabase
        .from('saved_properties')
        .select('listing_id')
        .eq('tenant_id', user.id)

      if (error) {
        console.error('Failed to load saved properties:', error.message)
        return
      }

      setSavedIds(new Set((data || []).map((row: any) => row.listing_id)))
    }
    loadSaved()
  }, [])

  async function toggleSave(listingId: string) {
    if (!userId) {
      router.push(`/login?redirect=${encodeURIComponent(searchHref)}`)
      return
    }

    const wasSaved = savedIds.has(listingId)

    // Optimistic update
    setSavedIds((prev) => {
      const next = new Set(prev)
      if (wasSaved) next.delete(listingId)
      else next.add(listingId)
      return next
    })

    const { error } = wasSaved
      ? await supabase
          .from('saved_properties')
          .delete()
          .eq('tenant_id', userId)
          .eq('listing_id', listingId)
      : await supabase.from('saved_properties').insert({ tenant_id: userId, listing_id: listingId })

    if (error) {
      console.error('Failed to update saved property:', error.message)
      // Roll back
      setSavedIds((prev) => {
        const next = new Set(prev)
        if (wasSaved) next.add(listingId)
        else next.delete(listingId)
        return next
      })
    }
  }

  /* ---- Counts for the top strip (across all approved listings) ---- */

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const l of listings) {
      if (l.property_type) counts[l.property_type] = (counts[l.property_type] || 0) + 1
    }
    return counts
  }, [listings])

  const featuredTotal = useMemo(() => listings.filter((l) => l.featured).length, [listings])

  /* ---- Filter + rank: featured always first ---- */

  // Which listings have a valid EboHomes inspection. Used only to rank the Recommended order.
  const allIds = useMemo(() => listings.map((l: any) => String(l.id)), [listings])
  const inspectedForRank = useInspectedIds(allIds)
  const inspectedKey = Array.from(inspectedForRank).sort().join(',')

  const results = useMemo(() => {
    let r = [...listings]

    if (featuredOnly) r = r.filter((l) => l.featured)

    if (locationText) {
      const q = locationText.toLowerCase()
      r = r.filter((l) => l.location_text?.toLowerCase().includes(q))
    }

    if (search) {
      const q = search.toLowerCase()
      r = r.filter(
        (l) =>
          l.title?.toLowerCase().includes(q) ||
          l.location_text?.toLowerCase().includes(q) ||
          l.property_type?.toLowerCase().includes(q)
      )
    }

    if (propertyType) r = r.filter((l) => l.property_type === propertyType)

    r = r.filter((l) => {
      const price = Number(l.price_monthly) || 0
      return price >= minPrice && (maxPrice >= PRICE_CAP || price <= maxPrice)
    })

    if (bedrooms) r = r.filter((l) => matchCount(l.bedrooms, bedrooms))
    if (bathrooms) r = r.filter((l) => matchCount(l.bathrooms, bathrooms))

    if (amenities.length > 0) {
      r = r.filter((l) => amenities.some((a) => l.amenities?.includes(a)))
    }

    let featured = r.filter((l) => l.featured)
    const regular = r.filter((l) => !l.featured)

    const priceLow = (a: any, b: any) => Number(a.price_monthly) - Number(b.price_monthly)
    const priceHigh = (a: any, b: any) => Number(b.price_monthly) - Number(a.price_monthly)
    const newest = (a: any, b: any) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()

    if (sortBy === 'price-low') {
      featured.sort(priceLow)
      regular.sort(priceLow)
    } else if (sortBy === 'price-high') {
      featured.sort(priceHigh)
      regular.sort(priceHigh)
    } else if (sortBy === 'newest') {
      featured.sort(newest)
      regular.sort(newest)
    } else {
      // Recommended: featured rotate randomly each visit, the rest newest first
      featured = seed === null ? featured : seededShuffle(featured, seed)
      // Regular listings: inspected, recently confirmed and complete listings first, then newest.
      const inspectedSet = new Set(inspectedKey ? inspectedKey.split(',') : [])
      const ranked = rankListings(regular, (l: any) => ({
        inspected: inspectedSet.has(String(l.id)),
        confirmedAt: l.availability_confirmed_at,
        photoCount: Array.isArray(l.photos) ? l.photos.length : 0,
        hasVideo: !!l.video_url,
        hasDescription: typeof l.description === 'string' && l.description.trim().length > 0,
        createdAt: l.created_at,
      }))
      regular.splice(0, regular.length, ...ranked)
    }

    return [...featured, ...regular]
  }, [
    listings,
    featuredOnly,
    locationText,
    search,
    propertyType,
    minPrice,
    maxPrice,
    bedrooms,
    bathrooms,
    amenities,
    sortBy,
    seed,
    inspectedKey,
  ])

  // Back to page 1 whenever the filters or sort change
  useEffect(() => {
    setPage(1)
  }, [
    featuredOnly,
    locationText,
    search,
    propertyType,
    minPrice,
    maxPrice,
    bedrooms,
    bathrooms,
    amenities,
    sortBy,
  ])

  const totalPages = Math.max(1, Math.ceil(results.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const firstShown = results.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1
  const lastShown = Math.min(currentPage * PAGE_SIZE, results.length)
  const pageResults = results.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  const changePage = (p: number) => {
    setPage(Math.min(Math.max(1, p), totalPages))
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    resultsTopRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
  }

  const priceActive = minPrice > 0 || maxPrice < PRICE_CAP

  const activeFilterCount =
    (featuredOnly ? 1 : 0) +
    (locationText ? 1 : 0) +
    (propertyType ? 1 : 0) +
    (priceActive ? 1 : 0) +
    (bedrooms ? 1 : 0) +
    (bathrooms ? 1 : 0) +
    amenities.length

  // Label for recent searches and alerts
  const searchLabel = [
    bedrooms ? `${bedrooms} bed` : '',
    propertyType || (activeFilterCount > 0 || search ? 'Properties' : ''),
    locationText ? `in ${locationText}` : '',
    search ? `"${search}"` : '',
    maxPrice < PRICE_CAP ? `under ${naira(maxPrice)}` : '',
  ]
    .filter(Boolean)
    .join(' ')

  // The address for the current search. This is what goes in the URL and in recent searches.
  const query = buildQuery({
    location: locationText,
    type: propertyType,
    q: search,
    minPrice,
    maxPrice,
    bedrooms,
    bathrooms,
    amenities,
    featured: featuredOnly,
    sort: sortBy,
  })
  const searchHref = query ? `/search?${query}` : '/search'

  // Controls -> URL. Waits briefly while someone types or drags the slider, and never adds
  // history entries, so the Back button still leaves the page.
  useEffect(() => {
    if (!hydrated) return
    const timer = setTimeout(() => {
      const current = window.location.search.replace(/^\?/, '')
      if (current === query) return
      lastUrl.current = query
      try {
        window.history.replaceState(
          window.history.state,
          '',
          `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`
        )
      } catch {
        // Some browsers limit how often the address can change. The filters still work.
      }
    }, 250)
    return () => clearTimeout(timer)
  }, [hydrated, query])

  // Save to recent searches once the person stops changing filters
  useEffect(() => {
    if (!searchLabel || loading) return
    const timer = setTimeout(() => saveRecentSearch(searchLabel, searchHref), 2000)
    return () => clearTimeout(timer)
  }, [searchLabel, searchHref, loading])

  const clearFilters = () => {
    setFeaturedOnly(false)
    setLocationText('')
    setSearch('')
    setPropertyType('')
    setMinPrice(0)
    setMaxPrice(PRICE_CAP)
    setBedrooms('')
    setBathrooms('')
    setAmenities([])
  }

  const toggleAmenity = (a: string) => {
    setAmenities((prev) => (prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]))
  }

  // Removable chips shown above the results
  const activeChips: { key: string; label: string; onRemove: () => void }[] = []
  if (featuredOnly) activeChips.push({ key: 'featured', label: 'Featured only', onRemove: () => setFeaturedOnly(false) })
  if (locationText) activeChips.push({ key: 'loc', label: locationText, onRemove: () => setLocationText('') })
  if (search) activeChips.push({ key: 'q', label: `"${search}"`, onRemove: () => setSearch('') })
  if (propertyType) activeChips.push({ key: 'type', label: propertyType, onRemove: () => setPropertyType('') })
  if (priceActive) {
    activeChips.push({
      key: 'price',
      label:
        maxPrice >= PRICE_CAP
          ? `From ${naira(minPrice)}`
          : minPrice > 0
            ? `${naira(minPrice)} to ${naira(maxPrice)}`
            : `Up to ${naira(maxPrice)}`,
      onRemove: () => {
        setMinPrice(0)
        setMaxPrice(PRICE_CAP)
      },
    })
  }
  if (bedrooms) activeChips.push({ key: 'beds', label: `${bedrooms} bed`, onRemove: () => setBedrooms('') })
  if (bathrooms) activeChips.push({ key: 'baths', label: `${bathrooms} bath`, onRemove: () => setBathrooms('') })
  for (const a of amenities) {
    activeChips.push({ key: `am-${a}`, label: a, onRemove: () => toggleAmenity(a) })
  }

  const closeFilters = useCallback(() => setShowMobileFilters(false), [])
  useDialog(showMobileFilters, closeFilters, sheetRef)

  // If the window grows to desktop width while the sheet is open, close it so scrolling is not locked
  useEffect(() => {
    if (!showMobileFilters) return
    const mq = window.matchMedia('(min-width: 1024px)')
    const onChange = () => {
      if (mq.matches) setShowMobileFilters(false)
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [showMobileFilters])

  const segBase =
    'min-h-11 flex-1 rounded-control border px-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50'
  const segOn = 'border-primary bg-accent text-accent-foreground'
  const segOff = 'border-border bg-card text-muted-foreground hover:bg-secondary'
  const inputBase =
    'min-h-11 w-full rounded-control border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground/70 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25'

  // Rendered as a function (not a component) so inputs keep focus while typing.
  // `id` keeps element ids unique when the sidebar and the mobile sheet are both in the page.
  // This is the DESKTOP sidebar. The phone sheet uses renderMobileFilters below.
  const renderFilters = (id: string) => (
    <div className="space-y-6">
      {/* Location */}
      <div>
        <label htmlFor={`${id}-location`} className="mb-2 block text-sm font-medium text-foreground">
          Location
        </label>
        <input
          id={`${id}-location`}
          type="text"
          value={locationText}
          onChange={(e) => setLocationText(e.target.value)}
          placeholder="e.g. Abakaliki"
          autoComplete="off"
          className={inputBase}
        />
      </div>

      {/* Property Type */}
      <fieldset>
        <legend className="mb-2 block text-sm font-medium text-foreground">Property type</legend>
        <div className="grid grid-cols-2 gap-2">
          {[{ value: '', label: 'All Types' }, ...PROPERTY_TYPES].map((t) => (
            <button
              type="button"
              key={t.value || 'all'}
              onClick={() => setPropertyType(t.value)}
              aria-pressed={propertyType === t.value}
              className={cn(segBase, 'flex-none px-3 text-left text-xs', propertyType === t.value ? segOn : segOff)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </fieldset>

      {/* Price */}
      <div>
        <label htmlFor={`${id}-price`} className="mb-2 block text-sm font-medium text-foreground">
          Max rent (₦ / month)
        </label>
        <input
          id={`${id}-price`}
          type="range"
          min={0}
          max={PRICE_CAP}
          step={10000}
          value={Math.min(maxPrice, PRICE_CAP)}
          onChange={(e) => setMaxPrice(Number(e.target.value))}
          aria-valuetext={maxPrice >= PRICE_CAP ? 'No limit' : naira(maxPrice)}
          className="h-11 w-full accent-primary"
        />
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{naira(minPrice)}</span>
          <span className="font-semibold text-foreground">
            {maxPrice >= PRICE_CAP ? 'No limit' : naira(maxPrice)}
          </span>
        </div>
      </div>

      {/* Bedrooms */}
      <fieldset>
        <legend className="mb-2 block text-sm font-medium text-foreground">Bedrooms</legend>
        <div className="flex gap-2">
          {['', ...COUNT_OPTIONS].map((b) => (
            <button
              type="button"
              key={b || 'any'}
              onClick={() => setBedrooms(b)}
              aria-pressed={bedrooms === b}
              className={cn(segBase, bedrooms === b ? segOn : segOff)}
            >
              {b === '' ? 'Any' : b}
            </button>
          ))}
        </div>
      </fieldset>

      {/* Bathrooms */}
      <fieldset>
        <legend className="mb-2 block text-sm font-medium text-foreground">Bathrooms</legend>
        <div className="flex gap-2">
          {['', ...COUNT_OPTIONS].map((b) => (
            <button
              type="button"
              key={b || 'any'}
              onClick={() => setBathrooms(b)}
              aria-pressed={bathrooms === b}
              className={cn(segBase, bathrooms === b ? segOn : segOff)}
            >
              {b === '' ? 'Any' : b}
            </button>
          ))}
        </div>
      </fieldset>

      {/* Amenities */}
      <fieldset>
        <legend className="mb-1 block text-sm font-medium text-foreground">Amenities</legend>
        <p className="mb-2 text-xs text-muted-foreground">Shows properties with any of the ones you tick.</p>
        <div>
          {AMENITIES.map((a) => (
            <label
              key={a}
              htmlFor={`${id}-am-${a}`}
              className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-foreground"
            >
              <input
                id={`${id}-am-${a}`}
                type="checkbox"
                checked={amenities.includes(a)}
                onChange={() => toggleAmenity(a)}
                className="h-5 w-5 accent-primary"
              />
              {a}
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  )

  const gridClass =
    viewMode === 'grid'
      ? 'grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 sm:gap-4 md:grid-cols-3'
      : 'grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 sm:gap-4 md:grid-cols-1'

  const chipBase =
    'inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-full border px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50'
  const chipOn = 'border-primary bg-primary text-primary-foreground'
  const chipOff = 'border-border bg-card text-foreground hover:bg-secondary'

  // PHONE filter sheet. Chips and Min / Max boxes instead of a long form.
  // Only property types that really have listings are offered (with their real counts), plus the one
  // already selected, so a tap never leads to an empty page by design.
  const renderMobileFilters = (id: string) => {
    const typeChips = PROPERTY_TYPES.filter((t) => typeCounts[t.value] > 0 || propertyType === t.value)
    const heading = 'mb-2 text-sm font-semibold text-foreground'

    return (
      <div className="space-y-6">
        {/* Location */}
        <div>
          <label htmlFor={`${id}-location`} className={`${heading} block`}>
            Location
          </label>
          <input
            id={`${id}-location`}
            type="text"
            value={locationText}
            onChange={(e) => setLocationText(e.target.value)}
            placeholder="e.g. Abakaliki"
            autoComplete="off"
            className={inputBase}
          />
        </div>

        {/* Property type */}
        <fieldset>
          <legend className={heading}>Property type</legend>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setPropertyType('')}
              aria-pressed={propertyType === ''}
              className={`${chipBase} ${propertyType === '' ? chipOn : chipOff}`}
            >
              All
            </button>
            {typeChips.map((t) => (
              <button
                type="button"
                key={t.value}
                onClick={() => setPropertyType(propertyType === t.value ? '' : t.value)}
                aria-pressed={propertyType === t.value}
                className={`${chipBase} ${propertyType === t.value ? chipOn : chipOff}`}
              >
                {t.label}
                {typeCounts[t.value] > 0 && <span className="ml-1 opacity-70">({typeCounts[t.value]})</span>}
              </button>
            ))}
          </div>
        </fieldset>

        {/* Rent budget */}
        <fieldset>
          <legend className={heading}>Rent budget (₦ per month)</legend>
          <BudgetInputs
            id={id}
            minPrice={minPrice}
            maxPrice={maxPrice}
            onMin={setMinPrice}
            onMax={setMaxPrice}
            inputClass={inputBase}
          />
        </fieldset>

        {/* Bedrooms */}
        <fieldset>
          <legend className={heading}>Bedrooms</legend>
          <div className="flex flex-wrap gap-2">
            {['', ...COUNT_OPTIONS].map((b) => (
              <button
                type="button"
                key={b || 'any'}
                onClick={() => setBedrooms(b)}
                aria-pressed={bedrooms === b}
                className={`${chipBase} min-w-14 justify-center ${bedrooms === b ? chipOn : chipOff}`}
              >
                {b === '' ? 'Any' : b}
              </button>
            ))}
          </div>
        </fieldset>

        {/* Bathrooms */}
        <fieldset>
          <legend className={heading}>Bathrooms</legend>
          <div className="flex flex-wrap gap-2">
            {['', ...COUNT_OPTIONS].map((b) => (
              <button
                type="button"
                key={b || 'any'}
                onClick={() => setBathrooms(b)}
                aria-pressed={bathrooms === b}
                className={`${chipBase} min-w-14 justify-center ${bathrooms === b ? chipOn : chipOff}`}
              >
                {b === '' ? 'Any' : b}
              </button>
            ))}
          </div>
        </fieldset>

        {/* Amenities */}
        <fieldset>
          <legend className={heading}>Amenities</legend>
          <p className="mb-2 text-xs text-muted-foreground">Shows properties with any of the ones you pick.</p>
          <div className="flex flex-wrap gap-2">
            {AMENITIES.map((a) => (
              <button
                type="button"
                key={a}
                onClick={() => toggleAmenity(a)}
                aria-pressed={amenities.includes(a)}
                className={`${chipBase} ${amenities.includes(a) ? chipOn : chipOff}`}
              >
                {a}
              </button>
            ))}
          </div>
        </fieldset>
      </div>
    )
  }

  return (
    <>
      {/* Page heading */}
      <div className="border-b border-border bg-cream">
        <div className="container-wide py-6 md:py-8">
          <h1 className="text-h2 font-bold text-foreground md:text-h1">Find rentals in Ebonyi State</h1>
          <p className="mt-2 max-w-2xl text-body text-muted-foreground">
            Browse approved listings. Filter by area, type, bedrooms and budget, then request a viewing.
          </p>

          {!loading && listings.length > 0 && (
            <p className="mt-3 text-sm text-muted-foreground">
              <span className="font-bold text-foreground">{listings.length}</span>{' '}
              {listings.length === 1 ? 'property' : 'properties'} available
              {featuredTotal > 0 && (
                <>
                  {' · '}
                  <span className="font-bold text-foreground">{featuredTotal}</span> featured
                </>
              )}
            </p>
          )}

          <details className="group mt-1">
            <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-sm text-sm font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
              <Info size={16} aria-hidden="true" />
              What the badges mean
            </summary>
            <ul className="mt-1 max-w-2xl space-y-1.5 text-sm text-muted-foreground">
              <li>
                <span className="font-semibold text-foreground">Featured:</span> the landlord chose to promote this listing.
              </li>
              <li>
                <span className="font-semibold text-foreground">Inspected by EboHomes:</span> shown only when EboHomes holds a current inspection record for the property.
              </li>
              <li>A listing with no badge has been approved to appear here but has no current inspection on record.</li>
              <li>Landlord identity checks and document reviews are shown on each property page, not on the cards.</li>
            </ul>
          </details>
        </div>
      </div>

      {/* Search bar */}
      <div className="z-30 border-b border-border bg-card md:sticky md:top-16 lg:top-[72px]">
        <div className="container-wide flex flex-wrap items-center gap-2 py-3 sm:gap-3">
          <form
            role="search"
            aria-label="Search properties"
            onSubmit={(e) => {
              e.preventDefault()
              ;(document.activeElement as HTMLElement | null)?.blur?.()
            }}
            className="relative w-full min-w-0 sm:w-auto sm:min-w-[160px] sm:flex-1"
          >
            <label htmlFor="search-box" className="sr-only">
              Search location or property
            </label>
            <Search
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              size={18}
              aria-hidden="true"
            />
            <input
              id="search-box"
              type="text"
              enterKeyHint="search"
              autoComplete="off"
              placeholder="Search location or property"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={cn(inputBase, 'pl-10', search && 'pr-11')}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Clear search"
                className="absolute right-0 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <X size={16} aria-hidden="true" />
              </button>
            )}
          </form>

          <button
            type="button"
            onClick={() => setShowMobileFilters(true)}
            aria-haspopup="dialog"
            className="flex min-h-11 shrink-0 items-center gap-2 rounded-control border border-border bg-card px-4 text-sm font-medium text-foreground hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 lg:hidden"
          >
            <SlidersHorizontal size={16} aria-hidden="true" />
            Filters
            {activeFilterCount > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-xs text-primary-foreground">
                {activeFilterCount}
                <span className="sr-only"> active</span>
              </span>
            )}
          </button>

          <div className="min-w-0 flex-1 sm:flex-none">
            <label htmlFor="sort-select" className="sr-only">
              Sort properties
            </label>
            <select
              id="sort-select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="min-h-11 w-full rounded-control border border-border bg-card px-3 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div
            role="group"
            aria-label="Layout"
            className="hidden items-center overflow-hidden rounded-control border border-border md:flex"
          >
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              aria-label="Grid view"
              aria-pressed={viewMode === 'grid'}
              className={`flex h-11 w-11 items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50 ${viewMode === 'grid' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground'}`}
            >
              <Grid size={16} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              aria-label="List view"
              aria-pressed={viewMode === 'list'}
              className={`flex h-11 w-11 items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50 ${viewMode === 'list' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground'}`}
            >
              <ListIcon size={16} aria-hidden="true" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => setViewMode(viewMode === 'map' ? 'grid' : 'map')}
            aria-pressed={viewMode === 'map'}
            className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-control border px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 ${
              viewMode === 'map'
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-card text-foreground'
            }`}
          >
            <MapPin size={16} aria-hidden="true" />
            {viewMode === 'map' ? 'List' : 'Map'}
          </button>
        </div>
      </div>

      <main className="container-wide w-full flex-1 pb-24 pt-5 md:pb-10">
        <RecentSearches />

        {/* Quick filter chips */}
        {!loading && listings.length > 0 && (
          <section className="mb-5" aria-label="Quick filters">
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6 lg:mx-0 lg:flex-wrap lg:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <button
                type="button"
                onClick={() => setPropertyType('')}
                aria-pressed={propertyType === ''}
                className={`${chipBase} ${propertyType === '' ? chipOn : chipOff}`}
              >
                All ({listings.length})
              </button>

              {featuredTotal > 0 && (
                <button
                  type="button"
                  onClick={() => setFeaturedOnly(!featuredOnly)}
                  aria-pressed={featuredOnly}
                  className={`${chipBase} gap-1 ${
                    featuredOnly
                      ? 'border-featured bg-featured text-featured-foreground'
                      : 'border-featured/60 bg-card text-foreground hover:bg-featured/10'
                  }`}
                >
                  <Star size={12} className="fill-current" aria-hidden="true" />
                  Featured ({featuredTotal})
                </button>
              )}

              {PROPERTY_TYPES.filter((t) => typeCounts[t.value] > 0).map((t) => (
                <button
                  type="button"
                  key={t.value}
                  onClick={() => setPropertyType(propertyType === t.value ? '' : t.value)}
                  aria-pressed={propertyType === t.value}
                  className={`${chipBase} ${propertyType === t.value ? chipOn : chipOff}`}
                >
                  {t.label} ({typeCounts[t.value]})
                </button>
              ))}
            </div>

            <div className="-mx-4 mt-2 flex items-center gap-2 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <span className="shrink-0 text-sm font-medium text-muted-foreground">Bedrooms:</span>
              {['', ...COUNT_OPTIONS].map((b) => (
                <button
                  type="button"
                  key={b || 'any'}
                  onClick={() => setBedrooms(bedrooms === b ? '' : b)}
                  aria-pressed={bedrooms === b}
                  className={`${chipBase} ${bedrooms === b ? chipOn : chipOff}`}
                >
                  {b === '' ? 'Any' : b}
                </button>
              ))}
            </div>
          </section>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
          {/* Desktop sidebar */}
          <aside className="hidden lg:block" aria-label="Filters">
            <div className="sticky top-40 max-h-[calc(100vh-11rem)] overflow-y-auto rounded-card border border-border bg-card p-5 shadow-rest">
              <div className="mb-5 flex items-center justify-between">
                <h2 className="font-semibold text-foreground">Filter results</h2>
                <button
                  type="button"
                  onClick={clearFilters}
                  className="flex min-h-11 items-center rounded-sm px-1 text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  Reset
                </button>
              </div>
              {renderFilters('d')}
            </div>
          </aside>

          {/* Results */}
          <div ref={resultsTopRef} className="min-w-0 scroll-mt-40">
            <h2 className="sr-only">Search results</h2>

            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
                {loading ? (
                  'Loading properties…'
                ) : loadError ? (
                  'Properties could not be loaded'
                ) : results.length === 0 ? (
                  '0 properties found'
                ) : viewMode === 'map' ? (
                  <>
                    <span className="font-semibold text-foreground">{results.length}</span>{' '}
                    {results.length === 1 ? 'property matches' : 'properties match'}. The map shows the ones
                    with a map pin.
                  </>
                ) : (
                  <>
                    Showing{' '}
                    <span className="font-semibold text-foreground">
                      {firstShown}–{lastShown}
                    </span>{' '}
                    of <span className="font-semibold text-foreground">{results.length}</span>{' '}
                    {results.length === 1 ? 'property' : 'properties'}
                  </>
                )}
              </p>

              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="flex min-h-11 items-center rounded-sm px-1 text-sm font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  Clear all ({activeFilterCount})
                </button>
              )}
            </div>

            {/* Active filter chips */}
            {activeChips.length > 0 && (
              <div className="mb-4 flex flex-wrap gap-2">
                {activeChips.map((chip) => (
                  <button
                    type="button"
                    key={chip.key}
                    onClick={chip.onRemove}
                    aria-label={`Remove filter ${chip.label}`}
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-primary/30 bg-accent px-3.5 text-sm font-medium text-accent-foreground transition hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                  >
                    {chip.label}
                    <X size={14} aria-hidden="true" />
                  </button>
                ))}
              </div>
            )}

            {!loading && !loadError && searchLabel && (
              <SearchAlertBar
                key={searchHref}
                label={searchLabel}
                filters={{
                  location: locationText,
                  propertyType,
                  minPrice: minPrice > 0 ? minPrice : null,
                  maxPrice: maxPrice < PRICE_CAP ? maxPrice : null,
                  bedrooms: bedrooms ? parseInt(bedrooms) : null,
                }}
              />
            )}

            {loading ? (
              <div className={gridClass} aria-busy="true">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <CardSkeleton key={i} />
                ))}
              </div>
            ) : loadError ? (
              <div role="alert" className="rounded-card border border-border bg-card px-6 py-12 text-center shadow-rest">
                <h3 className="mb-2 text-lg font-semibold text-foreground">Could not load properties</h3>
                <p className="mx-auto mb-5 max-w-sm text-sm text-muted-foreground">
                  The list did not load. Please check your connection and try again.
                </p>
                <Button type="button" onClick={() => setReloadKey((k) => k + 1)}>
                  Try again
                </Button>
              </div>
            ) : results.length === 0 ? (
              <div className="rounded-card border border-border bg-card px-6 py-12 text-center shadow-rest sm:px-10">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-secondary text-muted-foreground">
                  <Search size={26} aria-hidden="true" />
                </div>
                <h3 className="mb-2 text-lg font-semibold text-foreground">No properties match your search</h3>

                {activeChips.length > 0 ? (
                  <>
                    <p className="mx-auto mb-4 max-w-sm text-sm text-muted-foreground">
                      Remove a filter to widen your search, or start again.
                    </p>
                    <div className="mb-5 flex flex-wrap justify-center gap-2">
                      {activeChips.map((chip) => (
                        <button
                          type="button"
                          key={chip.key}
                          onClick={chip.onRemove}
                          aria-label={`Remove filter ${chip.label}`}
                          className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                        >
                          {chip.label}
                          <X size={14} aria-hidden="true" />
                        </button>
                      ))}
                    </div>
                    <Button type="button" onClick={clearFilters}>
                      Clear all filters
                    </Button>
                  </>
                ) : (
                  <p className="mx-auto max-w-sm text-sm text-muted-foreground">
                    There are no approved properties yet. Please check back soon.
                  </p>
                )}
              </div>
            ) : (
              viewMode === 'map' ? (
                <SearchMap listings={results} onOpen={(id) => router.push(`/listing/${id}`)} />
              ) : (
                <>
                  <div className={gridClass}>
                    {pageResults.map((listing) => (
                      <PropertyCard
                        key={listing.id}
                        listing={listing}
                        layout={viewMode}
                        saved={savedIds.has(listing.id)}
                        onToggleSave={() => toggleSave(listing.id)}
                        onShare={() => setShareTarget(listing)}
                      />
                    ))}
                  </div>

                  <Pagination page={currentPage} totalPages={totalPages} onChange={changePage} />
                </>
              )
            )}
          </div>
        </div>
      </main>

      {/* Mobile filter sheet */}
      {showMobileFilters && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={closeFilters} aria-hidden="true" />
          <div
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="filters-heading"
            tabIndex={-1}
            className="absolute inset-x-0 bottom-0 flex max-h-[90vh] flex-col rounded-t-panel bg-card shadow-overlay outline-none"
          >
            <div className="flex items-center justify-between border-b border-border px-5 py-2">
              <h2 id="filters-heading" className="font-semibold text-foreground">
                Filters
              </h2>
              <div className="flex items-center">
                <button
                  type="button"
                  onClick={clearFilters}
                  className="flex min-h-11 items-center rounded-sm px-3 text-sm font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  Reset
                </button>
                <button
                  type="button"
                  onClick={closeFilters}
                  aria-label="Close filters"
                  className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  <X size={20} className="text-foreground" aria-hidden="true" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-5">{renderMobileFilters('m')}</div>

            <div className="border-t border-border bg-card px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
              <Button type="button" size="lg" onClick={closeFilters} className="w-full">
                Show {results.length} {results.length === 1 ? 'property' : 'properties'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {shareTarget && <ShareSheet listing={shareTarget} onClose={() => setShareTarget(null)} />}
    </>
  )
}
