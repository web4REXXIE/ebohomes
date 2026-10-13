'use client'

import { useEffect, useMemo, useState } from 'react'
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
} from 'lucide-react'
import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'
import { EBOHOMES_WHATSAPP } from '@/lib/contact'

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
  const featured = !!listing.featured

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
              src={photo}
              alt={listing.title || listing.property_type || 'Property photo'}
              loading="lazy"
              className={`w-full object-cover ${
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
      </div>

      {/* Details */}
      <div className="flex flex-1 flex-col p-3 sm:p-4">
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
              <BedDouble size={13} />
              {listing.bedrooms}
            </span>
          )}
          {listing.bathrooms != null && (
            <span className="flex items-center gap-1">
              <Bath size={13} />
              {listing.bathrooms}
            </span>
          )}
        </div>

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

/* ---------------- Page ---------------- */

export default function SearchPage() {
  const router = useRouter()

  const [listings, setListings] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [showMobileFilters, setShowMobileFilters] = useState(false)
  const [sortBy, setSortBy] = useState('recommended')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

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

  const [userId, setUserId] = useState<string | null>(null)
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set())
  const [shareTarget, setShareTarget] = useState<any>(null)

  useEffect(() => {
    setSeed(Math.floor(Math.random() * 2147483647))
  }, [])

  // Pre-fill from Home page search
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)

    setLocationText(params.get('location') || '')
    setPropertyType(params.get('type') || '')

    if (params.get('minPrice')) setMinPrice(Number(params.get('minPrice')))
    if (params.get('maxPrice')) setMaxPrice(Number(params.get('maxPrice')))

    const beds = params.get('bedrooms')
    if (beds && ['1', '2', '3', '4+'].includes(beds)) setBedrooms(beds)
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
    } else {
      // Recommended: featured rotate randomly each visit, the rest newest first
      featured = seed === null ? featured : seededShuffle(featured, seed)
      regular.sort(newest)
    }

    return [...featured, ...regular]
  }, [
    listings,
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

  // Reset pagination when the result set changes
  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [locationText, search, propertyType, minPrice, maxPrice, bedrooms, bathrooms, amenities, sortBy])

  const visibleResults = results.slice(0, visibleCount)

  const activeFilterCount =
    (propertyType ? 1 : 0) +
    (minPrice > 0 || maxPrice < PRICE_CAP ? 1 : 0) +
    (bedrooms ? 1 : 0) +
    (bathrooms ? 1 : 0) +
    amenities.length

  const clearFilters = () => {
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

  // Rendered as a function (not a component) so inputs keep focus while typing
  const renderFilters = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-foreground">Filter Results</h3>
        <button onClick={clearFilters} className="text-xs font-medium text-primary hover:underline">
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
            className="rounded-lg border border-border bg-card px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="recommended">Recommended</option>
            <option value="price-low">Price: Low to High</option>
            <option value="price-high">Price: High to Low</option>
          </select>

          <div className="hidden items-center overflow-hidden rounded-lg border border-border md:flex">
            <button
              onClick={() => setViewMode('grid')}
              aria-label="Grid view"
              className={`p-2.5 ${viewMode === 'grid' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground'}`}
            >
              <Grid size={16} />
            </button>
            <button
              onClick={() => setViewMode('list')}
              aria-label="List view"
              className={`p-2.5 ${viewMode === 'list' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground'}`}
            >
              <ListIcon size={16} />
            </button>
          </div>
        </div>
      </div>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-5 sm:px-6 lg:px-8">
        {/* Site numbers + property type chips */}
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

            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
              <button
                onClick={() => setPropertyType('')}
                className={`shrink-0 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors sm:text-sm ${
                  propertyType === ''
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-card text-foreground hover:bg-secondary'
                }`}
              >
                All ({listings.length})
              </button>

              {PROPERTY_TYPES.filter((t) => typeCounts[t.value] > 0).map((t) => (
                <button
                  key={t.value}
                  onClick={() => setPropertyType(propertyType === t.value ? '' : t.value)}
                  className={`shrink-0 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors sm:text-sm ${
                    propertyType === t.value
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-card text-foreground hover:bg-secondary'
                  }`}
                >
                  {t.label} ({typeCounts[t.value]})
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
          <div>
            <p className="mb-4 text-sm text-muted-foreground">
              {loading
                ? 'Loading...'
                : `${results.length} ${results.length === 1 ? 'property' : 'properties'} found`}
            </p>

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
                <p className="mb-5 text-sm text-muted-foreground">Please check your connection and try again.</p>
                <Button
                  onClick={() => window.location.reload()}
                  className="bg-primary font-semibold text-primary-foreground hover:bg-primary/90"
                >
                  Try again
                </Button>
              </div>
            ) : results.length === 0 ? (
              <div className="rounded-lg border border-border bg-card p-10 text-center sm:p-12">
                <div className="mb-4 text-4xl">🔍</div>
                <h3 className="mb-2 text-lg font-semibold text-foreground">No properties found</h3>
                <p className="mb-6 text-muted-foreground">
                  Try widening your search or adjusting your filters
                </p>
                <Button
                  onClick={clearFilters}
                  className="bg-primary font-semibold text-primary-foreground hover:bg-primary/90"
                >
                  Clear Filters
                </Button>
              </div>
            ) : (
              <>
                <div className={gridClass}>
                  {visibleResults.map((listing) => (
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

                {visibleCount < results.length && (
                  <div className="mt-6 text-center">
                    <Button
                      variant="outline"
                      onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
                      className="font-semibold"
                    >
                      Show more ({results.length - visibleCount} left)
                    </Button>
                  </div>
                )}
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
              <button onClick={() => setShowMobileFilters(false)} aria-label="Close filters">
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