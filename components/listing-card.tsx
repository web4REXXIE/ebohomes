'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import {
  Heart,
  Camera,
  ShieldCheck,
  Zap,
  Bed,
  Bath,
  Sofa,
  Building2,
  Ruler,
  MessageSquare,
  Phone,
} from 'lucide-react'
import { ShareButton } from './share-button'
import { supabase } from '@/lib/supabase'

type ListingCardProps = {
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
  photoCount?: number
  verified?: boolean
  featured?: boolean
}

export function ListingCard({
  id,
  landlord_id,
  image,
  price_monthly,
  price_yearly,
  location,
  property_type,
  bedrooms,
  bathrooms,
  living_rooms,
  build_size,
  photoCount,
  verified,
  featured,
}: ListingCardProps) {
  const [saved, setSaved] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const router = useRouter()

  // Find out who's logged in, and whether they've already saved this listing
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      const uid = data?.user?.id ?? null
      setUserId(uid)
      if (uid) {
        const { data: existing } = await supabase
          .from('saved_properties')
          .select('id')
          .eq('tenant_id', uid)
          .eq('listing_id', id)
          .maybeSingle()
        setSaved(!!existing)
      }
    })
  }, [id])

  async function handleSave(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (busy) return

    if (!userId) {
      router.push('/login')
      return
    }

    setBusy(true)
    if (saved) {
      await supabase
        .from('saved_properties')
        .delete()
        .eq('tenant_id', userId)
        .eq('listing_id', id)
      setSaved(false)
    } else {
      await supabase
        .from('saved_properties')
        .insert({ tenant_id: userId, listing_id: id })
      setSaved(true)
    }
    setBusy(false)
  }

  function handleMessageClick(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    router.push(`/messages?to=${landlord_id}&listing=${id}`)
  }

  const SaveButton = ({ small }: { small?: boolean }) => (
    <button
      onClick={handleSave}
      disabled={busy}
      title={saved ? 'Remove from saved properties' : 'Save this property'}
      aria-label={saved ? 'Unsave property' : 'Save property'}
      className={`group absolute top-2.5 right-2.5 flex items-center gap-1.5 rounded-full bg-white/95 backdrop-blur-md shadow hover:scale-105 transition-all duration-200 ${
        small ? 'h-8 px-2.5' : 'h-8 px-2.5'
      }`}
    >
      <Heart
        size={15}
        className={saved ? 'fill-primary text-primary' : 'text-foreground'}
      />
      <span className={`text-[10px] font-semibold ${saved ? 'text-primary' : 'text-foreground'}`}>
        {saved ? 'Saved' : 'Save'}
      </span>
    </button>
  )

  if (featured) {
    return (
      <div className="relative rounded-2xl p-[2px] bg-gradient-to-br from-amber-300 via-amber-400 to-amber-500 shadow-lg shadow-amber-500/20 hover:shadow-xl hover:shadow-amber-500/30 hover:-translate-y-0.5 transition-all duration-300 max-w-sm w-full">
        <div className="bg-card rounded-[18px] overflow-hidden">
          <div className="relative h-40 sm:h-44 bg-secondary/40">
            <img
              src={image || '/placeholder-property.jpg'}
              alt={property_type}
              className="w-full h-full object-cover"
              onError={(e) => {
                e.currentTarget.onerror = null
                e.currentTarget.src = '/placeholder-property.jpg'
              }}
            />

            <div className="absolute top-0 left-0">
              <div className="flex items-center gap-1 bg-gradient-to-r from-amber-300 to-amber-500 text-amber-950 text-[11px] font-bold px-3 py-1.5 rounded-br-xl shadow">
                <span>★</span> FEATURED
              </div>
            </div>

            <SaveButton />

            {photoCount ? (
              <div className="absolute bottom-2.5 left-2.5 flex items-center gap-1 bg-black/60 backdrop-blur-sm text-white text-[10px] font-medium px-2 py-1 rounded-md">
                <Camera size={11} />
                {photoCount}
              </div>
            ) : null}
          </div>

          <div className="p-3.5 sm:p-4 min-w-0">
            <span className="inline-flex items-center gap-1 text-amber-600 text-[10px] font-bold bg-amber-50 px-2 py-0.5 rounded-full mb-2">
              ☆ FEATURED
            </span>

            <div className="flex items-start justify-between gap-2 mb-1">
              <div className="min-w-0">
                <h3 className="text-base font-bold text-foreground truncate">{property_type}</h3>
                <p className="text-muted-foreground text-xs flex items-center gap-1 mt-0.5 truncate">
                  📍 {location}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm sm:text-base font-extrabold text-primary whitespace-nowrap">
                  ₦{price_monthly?.toLocaleString()}
                </p>
                <p className="text-[10px] text-muted-foreground whitespace-nowrap">/month</p>
              </div>
            </div>

            <div className="flex items-center gap-3 py-2.5 my-2 border-y border-border text-xs">
              <span className="flex items-center gap-1 text-muted-foreground">
                <Bed size={13} className="text-primary" /> {bedrooms}
              </span>
              <span className="flex items-center gap-1 text-muted-foreground">
                <Bath size={13} className="text-primary" /> {bathrooms ?? '-'}
              </span>
              <span className="flex items-center gap-1 text-muted-foreground">
                <Sofa size={13} className="text-primary" /> {living_rooms ?? '-'}
              </span>
            </div>

            <div className="flex gap-2">
              <Link
                href={`/listing/${id}`}
                className="flex-1 flex items-center justify-center gap-1 border border-border rounded-lg px-2 py-2 text-xs font-semibold text-foreground hover:bg-secondary/50 transition-colors"
              >
                <MessageSquare size={13} />
                Details
              </Link>
              <button
                onClick={handleMessageClick}
                className="flex-1 flex items-center justify-center gap-1 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg px-2 py-2 text-xs font-semibold transition-colors"
              >
                <MessageSquare size={13} />
                Message
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Non-featured card — now with a working, labeled save button
  return (
    <div className="block bg-card rounded-lg overflow-hidden border border-border hover:shadow-md transition-shadow">
      <Link href={`/listing/${id}`} className="block">
        <div className="relative h-40">
          <img src={image} alt={property_type} className="w-full h-full object-cover" />
          {verified && (
            <span className="absolute top-2 left-2 bg-white/95 text-primary text-[10px] font-semibold px-2 py-1 rounded-full flex items-center gap-1">
              <ShieldCheck size={11} /> Verified
            </span>
          )}
          <SaveButton small />
        </div>
      </Link>
      <div className="p-4">
        <div className="mb-2 flex items-start justify-between">
          <div>
            <p className="text-lg font-bold text-primary">₦{price_monthly?.toLocaleString()}/month</p>
            <p className="text-xs text-muted-foreground">₦{price_yearly?.toLocaleString()}/year</p>
          </div>
          <ShareButton listingId={id} />
        </div>
        <p className="text-sm text-muted-foreground mb-1">{location}</p>
        <p className="text-xs text-muted-foreground">{property_type} · {bedrooms} Beds</p>
        <button
          onClick={handleMessageClick}
          className="mt-2 w-full flex items-center justify-center gap-1 border border-border rounded-lg px-2 py-2 text-xs font-semibold text-foreground hover:bg-secondary/50 transition-colors"
        >
          <MessageSquare size={13} />
          Message Landlord
        </button>
      </div>
    </div>
  )
}