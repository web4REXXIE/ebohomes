'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, SlidersHorizontal, Grid, List as ListIcon, X } from 'lucide-react'
import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { ListingCard } from '@/components/listing-card'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'
import dynamic from 'next/dynamic'

const MapPlaceholder = dynamic(
  () => import('@/components/map-placeholder').then((mod) => ({ default: mod.MapPlaceholder })),
  { ssr: false }
)

const PROPERTY_TYPES = [
  { value: '', label: 'All Types' },
  { value: 'flat', label: 'Flat / Apartment' },
  { value: 'bungalow', label: 'Bungalow' },
  { value: 'duplex', label: 'Duplex' },
  { value: 'self-contain', label: 'Self Contain' },
  { value: 'penthouse', label: 'Penthouse' },
]

const AMENITIES = ['Parking Space', '24/7 Security', 'Water Supply', 'Generator', 'Furnished']

export default function SearchPage() {
  const router = useRouter()

  const [listings, setListings] = useState<any[]>([])
  const [filtered, setFiltered] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [showMobileFilters, setShowMobileFilters] = useState(false)
  const [sortBy, setSortBy] = useState('newest')

  const [locationText, setLocationText] = useState('')
  const [search, setSearch] = useState('')
  const [propertyType, setPropertyType] = useState('')
  const [minPrice, setMinPrice] = useState(0)
  const [maxPrice, setMaxPrice] = useState(10000000000000)
  const [bedrooms, setBedrooms] = useState<string>('')
  const [bathrooms, setBathrooms] = useState<string>('')
  const [amenities, setAmenities] = useState<string[]>([])

  // Pre-fill from Home page search
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)

    setLocationText(params.get('location') || '')
    setPropertyType(params.get('type') || '')

    if (params.get('minPrice')) {
      setMinPrice(Number(params.get('minPrice')))
    }

    if (params.get('maxPrice')) {
      setMaxPrice(Number(params.get('maxPrice')))
    }
  }, [])

  useEffect(() => {
    const fetchListings = async () => {
      setLoading(true)
      const { data } = await supabase
        .from('listings')
        .select('*')
        .eq('status', 'approved')
        .order('created_at', { ascending: false })
      setListings(data || [])
      setLoading(false)
    }
    fetchListings()
  }, [])

  useEffect(() => {
    let results = [...listings]

    if (locationText) {
      results = results.filter((l) => l.location_text?.toLowerCase().includes(locationText.toLowerCase()))
    }
    if (search) {
      results = results.filter(
        (l) =>
          l.title?.toLowerCase().includes(search.toLowerCase()) ||
          l.location_text?.toLowerCase().includes(search.toLowerCase())
      )
    }
    if (propertyType) results = results.filter((l) => l.property_type === propertyType)
    results = results.filter((l) => l.price_monthly >= minPrice && l.price_monthly <= maxPrice)
    if (bedrooms) results = results.filter((l) => String(l.bedrooms) === bedrooms)
    if (bathrooms) results = results.filter((l) => String(l.bathrooms) === bathrooms)
    if (amenities.length > 0) {
      results = results.filter((l) => amenities.some((a) => l.amenities?.includes(a)))
    }

    if (sortBy === 'price-low') results.sort((a, b) => a.price_monthly - b.price_monthly)
    if (sortBy === 'price-high') results.sort((a, b) => b.price_monthly - a.price_monthly)
    if (sortBy === 'newest') results.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    setFiltered(results)
  }, [listings, locationText, search, propertyType, minPrice, maxPrice, bedrooms, bathrooms, amenities, sortBy])

  const activeFilterCount =
    (propertyType ? 1 : 0) +
    (minPrice > 0 || maxPrice < 10000000000000 ? 1 : 0) +
    (bedrooms ? 1 : 0) +
    (bathrooms ? 1 : 0) +
    amenities.length

  const clearFilters = () => {
    setPropertyType('')
    setMinPrice(0)
    setMaxPrice(10000000000000)
    setBedrooms('')
    setBathrooms('')
    setAmenities([])
  }

  const toggleAmenity = (a: string) => {
    setAmenities((prev) => (prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]))
  }

  const FilterSidebarContent = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-foreground">Filter Results</h3>
        <button onClick={clearFilters} className="text-xs text-primary font-medium hover:underline">
          Reset
        </button>
      </div>

      {/* Location */}
      <div>
        <label className="text-sm font-medium text-foreground mb-2 block">Location</label>
        <input
          type="text"
          value={locationText}
          onChange={(e) => setLocationText(e.target.value)}
          placeholder="e.g. Abakaliki, Ebonyi State"
          className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      {/* Property Type */}
      <div>
        <label className="text-sm font-medium text-foreground mb-2 block">Property Type</label>
        <div className="grid grid-cols-2 gap-2">
          {PROPERTY_TYPES.map((t) => (
            <button
              key={t.value}
              onClick={() => setPropertyType(t.value)}
              className={`text-xs font-medium px-3 py-2 rounded-lg border transition-colors ${
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

      {/* Price Range */}
      <div>
        <label className="text-sm font-medium text-foreground mb-2 block">Price Range (₦ / year)</label>
        <input
          type="range"
          min={0}
          max={10000000000000}
          step={10000}
          value={maxPrice}
          onChange={(e) => setMaxPrice(Number(e.target.value))}
          className="w-full accent-primary"
        />
        <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
          <span>₦{minPrice.toLocaleString()}</span>
          <span>₦{maxPrice.toLocaleString()}{maxPrice >= 1000000 ? '+' : ''}</span>
        </div>
      </div>

      {/* Bedrooms */}
      <div>
        <label className="text-sm font-medium text-foreground mb-2 block">Bedrooms</label>
        <div className="flex gap-2">
          {['', '1', '2', '3', '4+'].map((b) => (
            <button
              key={b || 'any'}
              onClick={() => setBedrooms(b)}
              className={`flex-1 text-xs font-medium py-2 rounded-lg border transition-colors ${
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
        <label className="text-sm font-medium text-foreground mb-2 block">Bathrooms</label>
        <div className="flex gap-2">
          {['', '1', '2', '3', '4+'].map((b) => (
            <button
              key={b || 'any'}
              onClick={() => setBathrooms(b)}
              className={`flex-1 text-xs font-medium py-2 rounded-lg border transition-colors ${
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
        <label className="text-sm font-medium text-foreground mb-2 block">Amenities</label>
        <div className="space-y-2">
          {AMENITIES.map((a) => (
            <label key={a} className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
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
        className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
      >
        Apply Filters
      </Button>
    </div>
  )

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      {/* Search bar */}
      <div className="bg-card border-b border-border sticky top-16 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[200px] relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
            <input
              type="text"
              placeholder="Search by location, property name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <button
            onClick={() => setShowMobileFilters(true)}
            className="lg:hidden flex items-center gap-2 bg-card border border-border rounded-lg px-4 py-2.5 text-sm font-medium text-foreground hover:bg-secondary"
          >
            <SlidersHorizontal size={16} />
            Filters
            {activeFilterCount > 0 && (
              <span className="bg-primary text-primary-foreground text-xs w-5 h-5 rounded-full flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </button>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="bg-card border border-border rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="newest">Newest First</option>
            <option value="price-low">Price: Low to High</option>
            <option value="price-high">Price: High to Low</option>
          </select>

          <div className="hidden md:flex items-center border border-border rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2.5 ${viewMode === 'grid' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground'}`}
            >
              <Grid size={16} />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2.5 ${viewMode === 'list' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground'}`}
            >
              <ListIcon size={16} />
            </button>
          </div>
        </div>
      </div>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
          {/* Desktop sidebar */}
          <aside className="hidden lg:block">
            <div className="bg-card border border-border rounded-lg p-5 sticky top-36">
              <FilterSidebarContent />
            </div>
          </aside>

          {/* Results */}
          <div>
            <p className="text-sm text-muted-foreground mb-4">
              {loading ? 'Loading...' : `${filtered.length} Properties Found`}
            </p>

            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="bg-card rounded-lg border border-border animate-pulse h-72" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="bg-card rounded-lg p-12 text-center border border-border">
                <div className="text-4xl mb-4">🔍</div>
                <h3 className="text-lg font-semibold text-foreground mb-2">No properties found</h3>
                <p className="text-muted-foreground mb-6">Try widening your search or adjusting your filters</p>
                <Button onClick={clearFilters} className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold">
                  Clear Filters
                </Button>
              </div>
            ) : (
              <div
                className={
                  viewMode === 'grid'
                    ? 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5'
                    : 'space-y-4'
                }
              >
                {filtered.map((listing) => (
                  <ListingCard
                    key={listing.id}
                    id={listing.id}
                    landlord_id={listing.landlord_id}
                    image={listing.photos?.[0] ?? ''}
                    price_monthly={listing.price_monthly}
                    price_yearly={listing.price_yearly}
                    location={listing.location_text}
                    property_type={listing.property_type}
                    bedrooms={listing.bedrooms}
                    verified={listing.verified}
                    featured={listing.featured}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Mobile filter drawer */}
      {showMobileFilters && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowMobileFilters(false)} />
          <div className="absolute right-0 top-0 bottom-0 w-full max-w-sm bg-card overflow-y-auto p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-foreground">Filters</h2>
              <button onClick={() => setShowMobileFilters(false)}>
                <X size={20} className="text-foreground" />
              </button>
            </div>
            <FilterSidebarContent />
          </div>
        </div>
      )}

      <Footer />
    </div>
  )
}