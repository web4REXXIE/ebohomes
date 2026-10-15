'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
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
} from 'lucide-react'
import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'
import { EBOHOMES_WHATSAPP } from '@/lib/contact'
import { RecentSearches, saveRecentSearch } from '@/components/recent-searches'
import { SearchAlertBar } from '@/components/search-alert-bar'

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

// '4+' means 4 or more; any other value is an exact match
const matchCount = (actual: number | null | undefined, wanted: string) =>
  wanted.endsWith('+') ? Number(actual) >= parseInt(wanted) : String(actual) === wanted

const naira = (value: unknown) => `₦${(Number(value) || 0).toLocaleString('en-NG')}`

// Cloudinary: auto format, auto quality, width-sized. Other URLs are left alone.
function cardImage(url: string, width: number) {
  if (!url || !url.includes('/upload/')) return url
  return url.replace('/upload/', `/upload/f_auto,q_auto,w_${width}/`)
}

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

/* ---------------- Share sheet ---------------- */

function ShareSheet({ listing, onClose }: { listing: any; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  const [canNativeShare, setCanNativeShare] = useState(false)

  useEffect(() => {
    setCanNativeShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function')
  }, [])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

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
    'flex items-center gap-2 rounded-lg border border-border px-3 py-3 text-sm font-medium text-foreground transition hover:bg-secondary'

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Share this property"
    >
      <div
        className="w-full max-w-md rounded-t-2xl bg-background p-5 shadow-xl sm:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-base font-bold text-foreground">Share this property</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close share menu"
            className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-secondary"
          >
            <X size={18} />
          </button>
        </div>

        <p className="mb-4 truncate text-xs text-muted-foreground">
          {listing.title || listing.location_text}
        </p>

        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => open('whatsapp')} className={buttonClass}>
            <MessageCircle size={18} className="text-emerald-600" />
            WhatsApp
          </button>

          <button type="button" onClick={() => open('facebook')} className={buttonClass}>
            <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-blue-600 text-[11px] font-bold leading-none text-white">
              f
            </span>
            Facebook
          </button>

          <button type="button" onClick={() => open('x')} className={buttonClass}>
            <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-black text-[10px] font-bold leading-none text-white">
              X
            </span>
            X (Twitter)
          </button>

          <button type="button" onClick={() => open('telegram')} className={buttonClass}>
            <Send size={18} className="text-sky-500" />
            Telegram
          </button>

          <button type="button" onClick={copyLink} className={buttonClass}>
            <Copy size={18} />
            {copied ? 'Link copied!' : 'Copy link'}
          </button>

          {canNativeShare && (
            <button type="button" onClick={nativeShare} className={buttonClass}>
              <Share2 size={18} />
              More apps
            </button>
          )}
        </div>

        <p className="mt-4 text-[11px] leading-snug text-muted-foreground">
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
  onOpen,
}: {
  listing: any
  layout: 'grid' | 'list'
  saved: boolean
  onToggleSave: () => void
  onShare: () => void
  onOpen: () => void
}) {
  const isList = layout === 'list'
  const photo: string | undefined = Array.isArray(listing.photos) ? listing.photos[0] : undefined
  const photoCount: number = Array.isArray(listing.photos) ? listing.photos.length : 0
  const featured = !!listing.featured
  const added = addedLabel(listing.created_at)

  function requestViewing() {
    const message =
      `Hello EboHomes, I'd like to request a viewing for: ${listing.title || listing.property_type}, ` +
      `${listing.location_text}.`
    window.open(
      `https://wa.me/${EBOHOMES_WHATSAPP}?text=${encodeURIComponent(message)}`,
      '_blank',
      'noopener,noreferrer'
    )
  }

  return (
    <article
      className={`flex flex-col overflow-hidden rounded-xl bg-card transition-shadow hover:shadow-md ${
        featured ? 'border border-amber-400 ring-1 ring-amber-300/70' : 'border border-border'
      } ${isList ? 'md:flex-row' : ''}`}
    >
      {/* Photo */}
      <div className={`relative ${isList ? 'md:w-72 md:shrink-0' : ''}`}>
        <button type="button" onClick={onOpen} className="block w-full" aria-label="View property">
          {photo ? (
            <img
              src={cardImage(photo, 600)}
              alt={listing.title || listing.property_type || 'Property photo'}
              loading="lazy"
              decoding="async"
              className={`w-full bg-secondary/40 object-cover ${
                isList ? 'aspect-[4/3] md:h-full md:aspect-auto' : 'aspect-[4/3]'
              }`}
            />
          ) : (
            <div className="flex aspect-[4/3] w-full items-center justify-center bg-secondary text-muted-foreground">
              <Building2 size={28} />
            </div>
          )}
        </button>

        <div className="absolute left-2 top-2 flex flex-col items-start gap-1">
          {featured && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-bold text-amber-950 shadow sm:text-xs">
              <Star size={11} className="fill-current" />
              Featured
            </span>
          )}
          {listing.verified && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-semibold text-white shadow sm:text-xs">
              <ShieldCheck size={11} />
              Verified
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={onToggleSave}
          aria-label={saved ? 'Remove from saved properties' : 'Save property'}
          aria-pressed={saved}
          className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-white/95 shadow transition hover:bg-white sm:h-9 sm:w-9"
        >
          <Heart
            size={16}
            className={saved ? 'fill-destructive text-destructive' : 'text-foreground'}
          />
        </button>

        {photoCount > 0 && (
          <div className="pointer-events-none absolute bottom-2 left-2 flex items-center gap-1 rounded-md bg-black/60 px-2 py-1 text-[10px] font-medium text-white backdrop-blur-sm">
            <Camera size={11} />
            {photoCount}
          </div>
        )}
      </div>

      {/* Details */}
      <div className="flex min-w-0 flex-1 flex-col p-3 sm:p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-base font-extrabold leading-tight text-primary sm:text-lg">
              {naira(listing.price_monthly)}
              <span className="text-[11px] font-medium text-muted-foreground sm:text-xs">
                {' '}
                /month
              </span>
            </p>
            {Number(listing.price_yearly) > 0 && (
              <p className="text-[11px] text-muted-foreground sm:text-xs">
                {naira(listing.price_yearly)}/year
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={onShare}
            aria-label="Share property"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-secondary hover:text-foreground"
          >
            <Share2 size={16} />
          </button>
        </div>

        <button type="button" onClick={onOpen} className="mt-2 text-left">
          <h3 className="line-clamp-1 text-sm font-semibold text-foreground sm:text-base">
            {listing.title || listing.property_type}
          </h3>
        </button>

        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
          <MapPin size={12} className="shrink-0" />
          <span className="line-clamp-1">{listing.location_text}</span>
        </p>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {listing.property_type && (
            <span className="rounded-full bg-secondary px-2 py-0.5 font-medium text-foreground">
              {listing.property_type}
            </span>
          )}
          {listing.bedrooms != null && (
            <span className="flex items-center gap-1">
              <BedDouble size={13} className="text-primary" />
              {listing.bedrooms}
            </span>
          )}
          {listing.bathrooms != null && (
            <span className="flex items-center gap-1">
              <Bath size={13} className="text-primary" />
              {listing.bathrooms}
            </span>
          )}
        </div>

        {added && <p className="mt-2 text-[11px] font-medium text-emerald-700">{added}</p>}

        <div className="mt-auto grid grid-cols-2 gap-2 pt-3">
          <Button type="button" variant="outline" onClick={onOpen} className="h-9 px-2 text-xs font-semibold sm:text-sm">
            Details
          </Button>
          <Button
            type="button"
            onClick={requestViewing}
            className="h-9 gap-1 bg-primary px-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 sm:text-sm"
          >
            <Calendar size={14} />
            Viewing
          </Button>
        </div>
      </div>
    </article>
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
    'flex h-10 min-w-[2.5rem] items-center justify-center rounded-lg border px-3 text-sm font-semibold transition-colors'

  return (
    <nav className="mt-8 flex flex-col items-center gap-3" aria-label="Pagination">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onChange(page - 1)}
          disabled={page === 1}
          aria-label="Previous page"
          className={`${base} border-border bg-card text-foreground hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40`}
        >
          <ChevronLeft size={18} />
        </button>

        {getPageNumbers(page, totalPages).map((p, i) =>
          p === '…' ? (
            <span key={`gap-${i}`} className="px-1 text-muted-foreground">
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => onChange(p)}
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
          <ChevronRight size={18} />
        </button>
      </div>

      <p className="text-xs text-muted-foreground">
        Page {page} of {totalPages}
      </p>
    </nav>
  )
}

/* ---------------- Page ---------------- */

export default function SearchPage() {
  const router = useRouter()
  const resultsTopRef = useRef<HTMLDivElement>(null)

  const [listings, setListings] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
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

  useEffect(() => {
    setSeed(Math.floor(Math.random() * 2147483647))
  }, [])

  // Pre-fill from Home page links (?location, ?type, ?minPrice, ?maxPrice, ?bedrooms, ?featured=1, ?sort=newest)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)

    setLocationText(params.get('location') || '')
    setPropertyType(params.get('type') || '')
    setSearch(params.get('q') || '')

    if (params.get('minPrice')) setMinPrice(Number(params.get('minPrice')))
    if (params.get('maxPrice')) setMaxPrice(Number(params.get('maxPrice')))

    const beds = params.get('bedrooms')
    if (beds && ['1', '2', '3', '4+'].includes(beds)) setBedrooms(beds)

    if (params.get('featured') === '1') setFeaturedOnly(true)
    if (params.get('sort') === 'newest') setSortBy('newest')
  }, [])

  useEffect(() => {
    const fetchListings = async () => {
      setLoading(true)
      setLoadError(false)

      const { data, error } = await supabase
        .from('listings')
        .select(
          'id, landlord_id, title, photos, price_monthly, price_yearly, location_text, property_type, bedrooms, bathrooms, amenities, created_at, verified, featured'
        )
        .eq('status', 'approved')
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Failed to load listings:', error.message)
        setLoadError(true)
      }

      setListings(data || [])
      setLoading(false)
    }
    fetchListings()
  }, [])

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
      router.push(`/login?redirect=${encodeURIComponent('/search')}`)
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
  const verifiedTotal = useMemo(() => listings.filter((l) => l.verified).length, [listings])

  /* ---- Filter + rank: featured always first ---- */

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
    let regular = r.filter((l) => !l.featured)

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
      regular.sort(newest)
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
    resultsTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
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

  // Label and link for recent searches and alerts
  const searchLabel = [
    bedrooms ? `${bedrooms} bed` : '',
    propertyType || (activeFilterCount > 0 || search ? 'Properties' : ''),
    locationText ? `in ${locationText}` : '',
    search ? `"${search}"` : '',
    maxPrice < PRICE_CAP ? `under ${naira(maxPrice)}` : '',
  ]
    .filter(Boolean)
    .join(' ')

  const urlParams = new URLSearchParams()
  if (locationText) urlParams.set('location', locationText)
  if (propertyType) urlParams.set('type', propertyType)
  if (search) urlParams.set('q', search)
  if (minPrice > 0) urlParams.set('minPrice', String(minPrice))
  if (maxPrice < PRICE_CAP) urlParams.set('maxPrice', String(maxPrice))
  if (bedrooms) urlParams.set('bedrooms', bedrooms)
  const searchHref = `/search?${urlParams.toString()}`

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
      label: maxPrice >= PRICE_CAP ? `From ${naira(minPrice)}` : `Up to ${naira(maxPrice)}`,
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

  // Rendered as a function (not a component) so inputs keep focus while typing
  const renderFilters = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-foreground">Filter Results</h3>
        <button
          type="button"
          onClick={clearFilters}
          className="text-xs font-medium text-primary hover:underline"
        >
          Reset
        </button>
      </div>

      {/* Location */}
      <div>
        <label className="mb-2 block text-sm font-medium text-foreground">Location</label>
        <input
          type="text"
          value={locationText}
          onChange={(e) => setLocationText(e.target.value)}
          placeholder="e.g. Abakaliki, Ebonyi State"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      {/* Property Type */}
      <div>
        <label className="mb-2 block text-sm font-medium text-foreground">Property Type</label>
        <div className="grid grid-cols-2 gap-2">
          {[{ value: '', label: 'All Types' }, ...PROPERTY_TYPES].map((t) => (
            <button
              type="button"
              key={t.value || 'all'}
              onClick={() => setPropertyType(t.value)}
              className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                propertyType === t.value
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:bg-secondary'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Price */}
      <div>
        <label className="mb-2 block text-sm font-medium text-foreground">
          Max rent (₦ / month)
        </label>
        <input
          type="range"
          min={0}
          max={PRICE_CAP}
          step={10000}
          value={Math.min(maxPrice, PRICE_CAP)}
          onChange={(e) => setMaxPrice(Number(e.target.value))}
          className="w-full accent-primary"
        />
        <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
          <span>{naira(minPrice)}</span>
          <span>{maxPrice >= PRICE_CAP ? 'No limit' : naira(maxPrice)}</span>
        </div>
      </div>

      {/* Bedrooms */}
      <div>
        <label className="mb-2 block text-sm font-medium text-foreground">Bedrooms</label>
        <div className="flex gap-2">
          {['', '1', '2', '3', '4+'].map((b) => (
            <button
              type="button"
              key={b || 'any'}
              onClick={() => setBedrooms(b)}
              className={`flex-1 rounded-lg border py-2 text-xs font-medium transition-colors ${
                bedrooms === b
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:bg-secondary'
              }`}
            >
              {b === '' ? 'Any' : b}
            </button>
          ))}
        </div>
      </div>

      {/* Bathrooms */}
      <div>
        <label className="mb-2 block text-sm font-medium text-foreground">Bathrooms</label>
        <div className="flex gap-2">
          {['', '1', '2', '3', '4+'].map((b) => (
            <button
              type="button"
              key={b || 'any'}
              onClick={() => setBathrooms(b)}
              className={`flex-1 rounded-lg border py-2 text-xs font-medium transition-colors ${
                bathrooms === b
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:bg-secondary'
              }`}
            >
              {b === '' ? 'Any' : b}
            </button>
          ))}
        </div>
      </div>

      {/* Amenities */}
      <div>
        <label className="mb-2 block text-sm font-medium text-foreground">Amenities</label>
        <div className="space-y-2">
          {AMENITIES.map((a) => (
            <label key={a} className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={amenities.includes(a)}
                onChange={() => toggleAmenity(a)}
                className="accent-primary"
              />
              {a}
            </label>
          ))}
        </div>
      </div>

      <Button
        type="button"
        onClick={() => setShowMobileFilters(false)}
        className="w-full bg-primary font-semibold text-primary-foreground hover:bg-primary/90"
      >
        Show {results.length} {results.length === 1 ? 'property' : 'properties'}
      </Button>
    </div>
  )

  const gridClass =
    viewMode === 'grid'
      ? 'grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3'
      : 'grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-1'

  const chipBase =
    'shrink-0 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors sm:text-sm'
  const chipOn = 'border-primary bg-primary text-primary-foreground'
  const chipOff = 'border-border bg-card text-foreground hover:bg-secondary'

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />

      {/* Search bar */}
      <div className="sticky top-16 z-30 border-b border-border bg-card">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-4 py-3 sm:gap-3 sm:px-6 lg:px-8">
          <div className="relative min-w-[160px] flex-1">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              size={18}
            />
            <input
              type="text"
              placeholder="Search by location, property name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-border bg-background py-2.5 pl-10 pr-4 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <button
            type="button"
            onClick={() => setShowMobileFilters(true)}
            className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5 text-sm font-medium text-foreground hover:bg-secondary lg:hidden"
          >
            <SlidersHorizontal size={16} />
            Filters
            {activeFilterCount > 0 && (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
                {activeFilterCount}
              </span>
            )}
          </button>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            aria-label="Sort properties"
            className="rounded-lg border border-border bg-card px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="recommended">Recommended</option>
            <option value="newest">Newest first</option>
            <option value="price-low">Price: Low to High</option>
            <option value="price-high">Price: High to Low</option>
          </select>

          <div className="hidden items-center overflow-hidden rounded-lg border border-border md:flex">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              aria-label="Grid view"
              className={`p-2.5 ${viewMode === 'grid' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground'}`}
            >
              <Grid size={16} />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              aria-label="List view"
              className={`p-2.5 ${viewMode === 'list' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground'}`}
            >
              <ListIcon size={16} />
            </button>
          </div>
        </div>
      </div>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-24 pt-5 sm:px-6 md:pb-8 lg:px-8">
        <RecentSearches />

        {/* Site numbers + quick filter chips */}
        {!loading && listings.length > 0 && (
          <section className="mb-5">
            <p className="mb-3 text-xs text-muted-foreground sm:text-sm">
              <span className="font-bold text-foreground">{listings.length}</span> properties available
              {featuredTotal > 0 && (
                <>
                  {' · '}
                  <span className="font-bold text-foreground">{featuredTotal}</span> featured
                </>
              )}
              {verifiedTotal > 0 && (
                <>
                  {' · '}
                  <span className="font-bold text-foreground">{verifiedTotal}</span> verified
                </>
              )}
            </p>

            {/* Property type chips */}
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 [&::-webkit-scrollbar]:hidden">
              <button
                type="button"
                onClick={() => setPropertyType('')}
                className={`${chipBase} ${propertyType === '' ? chipOn : chipOff}`}
              >
                All ({listings.length})
              </button>

              {featuredTotal > 0 && (
                <button
                  type="button"
                  onClick={() => setFeaturedOnly(!featuredOnly)}
                  aria-pressed={featuredOnly}
                  className={`${chipBase} inline-flex items-center gap-1 ${
                    featuredOnly
                      ? 'border-amber-400 bg-amber-400 text-amber-950'
                      : 'border-amber-300 bg-card text-amber-700 hover:bg-amber-50'
                  }`}
                >
                  <Star size={12} className="fill-current" />
                  Featured ({featuredTotal})
                </button>
              )}

              {PROPERTY_TYPES.filter((t) => typeCounts[t.value] > 0).map((t) => (
                <button
                  type="button"
                  key={t.value}
                  onClick={() => setPropertyType(propertyType === t.value ? '' : t.value)}
                  className={`${chipBase} ${propertyType === t.value ? chipOn : chipOff}`}
                >
                  {t.label} ({typeCounts[t.value]})
                </button>
              ))}
            </div>

            {/* Bedroom chips */}
            <div className="-mx-4 mt-2 flex items-center gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
              <span className="shrink-0 text-xs font-medium text-muted-foreground">Bedrooms:</span>
              {['', '1', '2', '3', '4+'].map((b) => (
                <button
                  type="button"
                  key={b || 'any'}
                  onClick={() => setBedrooms(bedrooms === b ? '' : b)}
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
          <aside className="hidden lg:block">
            <div className="sticky top-36 max-h-[calc(100vh-10rem)] overflow-y-auto rounded-lg border border-border bg-card p-5">
              {renderFilters()}
            </div>
          </aside>

          {/* Results */}
          <div ref={resultsTopRef} className="scroll-mt-32">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">
                {loading ? (
                  'Loading...'
                ) : results.length === 0 ? (
                  '0 properties found'
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
                  className="text-xs font-semibold text-primary hover:underline"
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
                    className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary transition hover:bg-primary/20"
                  >
                    {chip.label}
                    <X size={12} />
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
              <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div
                    key={i}
                    className="h-64 animate-pulse rounded-xl border border-border bg-card"
                  />
                ))}
              </div>
            ) : loadError ? (
              <div className="rounded-lg border border-border bg-card p-10 text-center">
                <h3 className="mb-2 text-lg font-semibold text-foreground">
                  Could not load properties
                </h3>
                <p className="mb-5 text-sm text-muted-foreground">
                  Please check your connection and try again.
                </p>
                <Button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="bg-primary font-semibold text-primary-foreground hover:bg-primary/90"
                >
                  Try again
                </Button>
              </div>
            ) : results.length === 0 ? (
              <div className="rounded-lg border border-border bg-card p-10 text-center sm:p-12">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-secondary text-muted-foreground">
                  <Search size={26} />
                </div>
                <h3 className="mb-2 text-lg font-semibold text-foreground">No properties match</h3>
                <p className="mx-auto mb-6 max-w-sm text-sm text-muted-foreground">
                  {activeFilterCount > 0 || search
                    ? 'Try removing a filter or widening your budget to see more.'
                    : 'There are no approved properties yet. Please check back soon.'}
                </p>
                {(activeFilterCount > 0 || search) && (
                  <Button
                    type="button"
                    onClick={clearFilters}
                    className="bg-primary font-semibold text-primary-foreground hover:bg-primary/90"
                  >
                    Clear filters
                  </Button>
                )}
              </div>
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
                      onOpen={() => router.push(`/listing/${listing.id}`)}
                    />
                  ))}
                </div>

                <Pagination page={currentPage} totalPages={totalPages} onChange={changePage} />
              </>
            )}
          </div>
        </div>
      </main>

      {/* Mobile filter drawer */}
      {showMobileFilters && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowMobileFilters(false)}
          />
          <div className="absolute bottom-0 right-0 top-0 w-full max-w-sm overflow-y-auto bg-card p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold text-foreground">Filters</h2>
              <button
                type="button"
                onClick={() => setShowMobileFilters(false)}
                aria-label="Close filters"
              >
                <X size={20} className="text-foreground" />
              </button>
            </div>
            {renderFilters()}
          </div>
        </div>
      )}

      {shareTarget && <ShareSheet listing={shareTarget} onClose={() => setShareTarget(null)} />}

      <Footer />
    </div>
  )
}