'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Heart, Search, AlertCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { ListingCard } from '@/components/listing-card'

type SavedListing = {
  saved_id: string
  saved_at: string
  id: string
  landlord_id: string
  image: string
  price_monthly: number
  price_yearly: number
  location: string
  property_type: string
  bedrooms: number
  bathrooms?: number
  living_rooms?: number
  build_size?: number
  verified?: boolean
}

export default function SavedPropertiesPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<SavedListing[]>([])
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setFailed(false)
      const { data: userData } = await supabase.auth.getUser()
      const uid = userData?.user?.id
      if (!uid) {
        router.push('/login')
        return
      }

      const { data, error } = await supabase
        .from('saved_properties')
        .select(
          `
          id,
          created_at,
          listing:listings (
            id,
            landlord_id,
            photos,
            price_monthly,
            price_yearly,
            location_text,
            property_type,
            bedrooms,
            bathrooms,
            verified
          )
        `
        )
        .eq('tenant_id', uid)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Failed to load saved properties:', error)
        if (!cancelled) { setFailed(true); setLoading(false) }
        return
      }

      const mapped: SavedListing[] = (data ?? [])
        // listings can be null if the row was deleted — drop those instead of crashing
        .filter((row: any) => row.listing)
        .map((row: any) => ({
          saved_id: row.id,
          saved_at: row.created_at,
          id: row.listing.id,
          landlord_id: row.listing.landlord_id,
          image: Array.isArray(row.listing.photos) ? row.listing.photos[0] : '',
          price_monthly: row.listing.price_monthly,
          price_yearly: row.listing.price_yearly,
          location: row.listing.location_text,
          property_type: row.listing.property_type,
          bedrooms: row.listing.bedrooms,
          bathrooms: row.listing.bathrooms,
          verified: row.listing.verified,
        }))

      if (!cancelled) {
        setItems(mapped)
        setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [router, attempt])

  // Only numbers that come from the saved rows themselves are shown here.
  // Two earlier cards were removed: one only repeated the saved count and the other was a fixed zero.
  const avgPrice =
    items.length > 0
      ? Math.round(items.reduce((sum, i) => sum + (i.price_monthly || 0), 0) / items.length)
      : 0

  const propertyTypes = Array.from(new Set(items.map((i) => i.property_type))).filter(Boolean)
  const filteredItems =
    typeFilter === 'all' ? items : items.filter((i) => i.property_type === typeFilter)

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8" role="status" aria-busy="true" aria-label="Loading your saved homes">
        <div className="mb-6 h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="mb-8 grid grid-cols-2 gap-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-card bg-muted" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-64 animate-pulse rounded-card bg-muted" />
          ))}
        </div>
      </div>
    )
  }

  if (failed) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="mb-6 text-2xl font-bold text-foreground">Saved Homes</h1>
        <div role="alert" className="rounded-card border border-border bg-card p-8 text-center">
          <AlertCircle size={28} className="mx-auto mb-3 text-muted-foreground" aria-hidden />
          <p className="mb-1 font-semibold text-foreground">We could not load your saved homes</p>
          <p className="mb-4 text-sm text-muted-foreground">This is usually temporary. Your saved homes have not been removed.</p>
          <button
            type="button"
            onClick={() => { setLoading(true); setAttempt((n) => n + 1) }}
            className="focus-ring inline-flex min-h-11 items-center justify-center rounded-button bg-primary px-5 text-sm font-semibold text-primary-foreground"
          >
            Try again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Saved Homes</h1>
          <p className="text-sm text-muted-foreground">Homes you saved to look at again.</p>
        </div>
        <Link
          href="/search"
          className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-button border border-border bg-card px-4 text-sm font-semibold text-foreground hover:bg-muted"
        >
          <Search size={16} aria-hidden /> Search homes
        </Link>
      </div>

      {items.length > 0 && (
        <div className="mb-6 grid grid-cols-2 gap-4">
          <div className="rounded-card border border-border bg-card p-4">
            <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
              <Heart size={14} className="text-primary" aria-hidden />
              Saved homes
            </div>
            <p className="text-2xl font-bold text-foreground">{items.length}</p>
          </div>
          <div className="rounded-card border border-border bg-card p-4">
            <div className="mb-1 text-xs text-muted-foreground">Average rent per month</div>
            <p className="text-2xl font-bold text-foreground">₦{avgPrice.toLocaleString()}</p>
          </div>
        </div>
      )}

      {propertyTypes.length > 1 && (
        <div role="group" aria-label="Filter by property type" className="mb-6 flex items-center gap-2 overflow-x-auto pb-1">
          {['all', ...propertyTypes].map((type) => {
            const on = typeFilter === type
            return (
              <button
                key={type}
                type="button"
                aria-pressed={on}
                onClick={() => setTypeFilter(type)}
                className={`focus-ring min-h-11 whitespace-nowrap rounded-full border px-4 text-xs font-semibold ${
                  on
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border text-muted-foreground hover:bg-secondary/50'
                }`}
              >
                {type === 'all' ? 'All' : type}
              </button>
            )
          })}
        </div>
      )}

      {filteredItems.length === 0 ? (
        <div className="rounded-card border border-dashed border-border py-16 text-center">
          <Heart size={32} className="mx-auto mb-3 text-muted-foreground" aria-hidden />
          <p className="mb-1 font-medium text-foreground">No saved homes yet</p>
          <p className="mb-4 text-sm text-muted-foreground">Tap the heart on any listing to save it here.</p>
          <Link
            href="/search"
            className="focus-ring inline-flex min-h-11 items-center justify-center rounded-button bg-primary px-5 text-sm font-semibold text-primary-foreground"
          >
            Browse homes
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredItems.map((item) => (
            <ListingCard
              key={item.saved_id}
              id={item.id}
              landlord_id={item.landlord_id}
              image={item.image}
              price_monthly={item.price_monthly}
              price_yearly={item.price_yearly}
              location={item.location}
              property_type={item.property_type}
              bedrooms={item.bedrooms}
              bathrooms={item.bathrooms}
              verified={item.verified}
            />
          ))}
        </div>
      )}
    </div>
  )
}
