'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Heart, ShieldCheck, TrendingDown } from 'lucide-react'
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

  useEffect(() => {
    let cancelled = false

    async function load() {
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
        if (!cancelled) setLoading(false)
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
  }, [router])

  const stillAvailableCount = items.length // every row here still has a live listings row by construction
  const avgPrice =
    items.length > 0
      ? Math.round(items.reduce((sum, i) => sum + (i.price_monthly || 0), 0) / items.length)
      : 0
  const priceDropCount = 0 // no price_history table yet

  const propertyTypes = Array.from(new Set(items.map((i) => i.property_type))).filter(Boolean)
  const filteredItems =
    typeFilter === 'all' ? items : items.filter((i) => i.property_type === typeFilter)

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="h-8 w-48 bg-muted rounded animate-pulse mb-6" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-64 bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-foreground mb-6">Saved Properties</h1>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            <Heart size={14} className="text-primary" />
            Saved Properties
          </div>
          <p className="text-2xl font-bold text-foreground">{items.length}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            <ShieldCheck size={14} className="text-primary" />
            Still Available
          </div>
          <p className="text-2xl font-bold text-foreground">{stillAvailableCount}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            Avg. Price
          </div>
          <p className="text-2xl font-bold text-foreground">
            ₦{avgPrice.toLocaleString()}
          </p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            <TrendingDown size={14} className="text-primary" />
            Price Drops
          </div>
          <p className="text-2xl font-bold text-foreground">{priceDropCount}</p>
        </div>
      </div>

      {propertyTypes.length > 1 && (
        <div className="flex items-center gap-2 mb-6 overflow-x-auto">
          <button
            onClick={() => setTypeFilter('all')}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full border whitespace-nowrap ${
              typeFilter === 'all'
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-border text-muted-foreground hover:bg-secondary/50'
            }`}
          >
            All
          </button>
          {propertyTypes.map((type) => (
            <button
              key={type}
              onClick={() => setTypeFilter(type)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full border whitespace-nowrap ${
                typeFilter === type
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border text-muted-foreground hover:bg-secondary/50'
              }`}
            >
              {type}
            </button>
          ))}
        </div>
      )}

      {filteredItems.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-border rounded-lg">
          <Heart size={32} className="mx-auto text-muted-foreground mb-3" />
          <p className="text-foreground font-medium mb-1">No saved properties yet</p>
          <p className="text-muted-foreground text-sm">
            Tap the heart on any listing to save it here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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