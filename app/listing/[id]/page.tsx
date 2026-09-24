'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Heart, Share2, MapPin, Phone, MessageCircle, ShieldCheck, Flag, Calendar, MessageSquare, FileText } from 'lucide-react'
import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'
import dynamic from 'next/dynamic'
import { ReportListingModal } from '@/components/report-listing-modal'

const MapPlaceholder = dynamic(
  () => import('@/components/map-placeholder').then((mod) => ({ default: mod.MapPlaceholder })),
  { ssr: false }
)

export default function ListingDetailPage() {
  const { id } = useParams()
  const router = useRouter()
  const [listing, setListing] = useState<any>(null)
  const [landlord, setLandlord] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [currentPhoto, setCurrentPhoto] = useState(0)
  const [saved, setSaved] = useState(false)
  const [showReportModal, setShowReportModal] = useState(false)

  useEffect(() => {
    const fetchListing = async () => {
      const { data } = await supabase.from('listings').select('*').eq('id', id).single()
      setListing(data)

      if (data?.landlord_id) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name, phone, verified')
          .eq('id', data.landlord_id)
          .maybeSingle()
        setLandlord(profile)
      }
      setLoading(false)
    }
    if (id) fetchListing()
  }, [id])

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header />
        <div className="max-w-6xl mx-auto px-4 py-10 w-full animate-pulse">
          <div className="h-96 bg-secondary rounded-lg mb-4" />
          <div className="h-6 bg-secondary rounded w-1/3 mb-2" />
          <div className="h-4 bg-secondary rounded w-1/4" />
        </div>
        <Footer />
      </div>
    )
  }

  if (!listing) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header />
        <div className="max-w-2xl mx-auto px-4 py-20 text-center">
          <p className="text-lg font-semibold text-foreground mb-2">Listing not found</p>
          <button onClick={() => router.push('/search')} className="text-primary text-sm font-medium hover:underline">
            ← Back to search
          </button>
        </div>
        <Footer />
      </div>
    )
  }

  const photos: string[] = listing.photos || []
  const whatsappMessage = `Hi, I found your listing on EboHomes: ${listing.title} in ${listing.location_text}. Is it still available?`

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      <main className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6">
        <button onClick={() => router.back()} className="text-sm text-primary font-medium hover:underline mb-4">
          ← Back to search
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left: photos + details */}
          <div className="lg:col-span-2">
            {/* Photo gallery */}
            <div className="relative rounded-lg overflow-hidden border border-border mb-2">
              {listing.verified && (
                <span className="absolute top-3 left-3 z-10 bg-primary text-primary-foreground text-xs font-semibold px-2.5 py-1 rounded-full flex items-center gap-1">
                  <ShieldCheck size={12} /> Verified
                </span>
              )}
              <button
                onClick={() => setSaved(!saved)}
                className="absolute top-3 right-14 z-10 w-9 h-9 rounded-full bg-white/90 flex items-center justify-center"
              >
                <Heart size={18} className={saved ? 'fill-destructive text-destructive' : 'text-foreground'} />
              </button>
              <button className="absolute top-3 right-3 z-10 w-9 h-9 rounded-full bg-white/90 flex items-center justify-center">
                <Share2 size={16} className="text-foreground" />
              </button>

              {photos.length > 0 ? (
                <img src={photos[currentPhoto]} alt={listing.title} className="w-full h-96 object-cover" />
              ) : (
                <div className="w-full h-96 bg-secondary flex items-center justify-center text-muted-foreground">
                  No Photos
                </div>
              )}
              {photos.length > 1 && (
                <span className="absolute bottom-3 left-3 bg-black/60 text-white text-xs px-2 py-1 rounded">
                  {currentPhoto + 1} / {photos.length}
                </span>
              )}
            </div>

            {photos.length > 1 && (
              <div className="flex gap-2 overflow-x-auto mb-6 pb-1">
                {photos.map((url, i) => (
                  <img
                    key={i}
                    src={url}
                    onClick={() => setCurrentPhoto(i)}
                    className={`w-20 h-16 object-cover rounded-md cursor-pointer border-2 shrink-0 ${
                      i === currentPhoto ? 'border-primary' : 'border-transparent'
                    }`}
                  />
                ))}
              </div>
            )}

            {/* Title & price */}
            <div className="flex items-start justify-between gap-4 mb-1">
              <h1 className="text-2xl font-bold text-foreground">{listing.title}</h1>
            </div>
            <p className="flex items-center gap-1 text-muted-foreground text-sm mb-4">
              <MapPin size={14} /> {listing.location_text}
            </p>

            <div className="flex flex-wrap gap-2 mb-6">
              {listing.property_type && (
                <span className="bg-secondary text-foreground text-xs font-medium px-3 py-1.5 rounded-full">
                  {listing.property_type}
                </span>
              )}
              {listing.bedrooms != null && (
                <span className="bg-secondary text-foreground text-xs font-medium px-3 py-1.5 rounded-full">
                  {listing.bedrooms} Bedrooms
                </span>
              )}
              {listing.bathrooms != null && (
                <span className="bg-secondary text-foreground text-xs font-medium px-3 py-1.5 rounded-full">
                  {listing.bathrooms} Bathrooms
                </span>
              )}
              {listing.availability_date && (
                <span className="bg-primary/10 text-primary text-xs font-medium px-3 py-1.5 rounded-full flex items-center gap-1">
                  <Calendar size={12} /> Available: {listing.availability_date}
                </span>
              )}
            </div>

            {listing.description && (
              <div className="mb-6">
                <h3 className="font-semibold text-foreground mb-2">Description</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{listing.description}</p>
              </div>
            )}

            {listing.amenities?.length > 0 && (
              <div className="mb-6">
                <h3 className="font-semibold text-foreground mb-3">Amenities</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {listing.amenities.map((a: string) => (
                    <span key={a} className="text-sm text-foreground flex items-center gap-2">
                      <ShieldCheck size={14} className="text-primary" /> {a}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {listing.lat && listing.lng && (
              <div className="mb-6">
                <h3 className="font-semibold text-foreground mb-3">Location</h3>
                <div className="rounded-lg overflow-hidden border border-border">
                  <MapPlaceholder height="h-64" listings={[{ id: listing.id, lat: listing.lat, lng: listing.lng, title: listing.title }]} />
                </div>
              </div>
            )}

            <button
              onClick={() => setShowReportModal(true)}
              className="flex items-center gap-2 text-sm font-semibold text-destructive border border-destructive rounded-md px-3 py-2 hover:bg-destructive hover:text-white transition-colors"
            >
              <Flag size={14} /> Report this listing
            </button>

            {showReportModal && (
              <ReportListingModal listingId={listing.id} onClose={() => setShowReportModal(false)} />
            )}
          </div>

          {/* Right: sticky contact card */}
          <div className="lg:col-span-1">
            <div className="sticky top-24 space-y-4">
              <div className="bg-card border border-border rounded-lg p-5">
                <p className="text-2xl font-bold text-primary">₦{listing.price_monthly?.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground mb-4">per month</p>

                <div className="border-t border-border pt-4">
                  <p className="text-sm font-semibold text-foreground mb-3">Contact Landlord</p>
                  {landlord && (
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-sm font-semibold text-foreground">
                        {landlord.full_name?.[0] ?? 'L'}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">{landlord.full_name}</p>
                        {landlord.verified && (
                          <p className="text-xs text-primary flex items-center gap-1">
                            <ShieldCheck size={11} /> Verified Landlord
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  <Button
                    onClick={() =>
                      window.open(
                        `https://wa.me/${listing.contact_info?.replace(/\D/g, '')}?text=${encodeURIComponent(whatsappMessage)}`,
                        '_blank'
                      )
                    }
                    className="w-full bg-[#25D366] hover:bg-[#20bd5a] text-white font-semibold mb-2 flex items-center justify-center gap-2"
                  >
                    <MessageCircle size={16} /> Chat on WhatsApp
                  </Button>

                  <a href={`tel:${listing.contact_info}`}>
                    <Button variant="outline" className="w-full font-semibold flex items-center justify-center gap-2">
                      <Phone size={16} /> Call Landlord
                    </Button>
                  </a>

                  <Button
                    onClick={() => router.push(`/apply/${listing.id}`)}
                    disabled={listing.status && listing.status !== 'available'}
                    className="w-full bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-primary-foreground font-semibold mt-2 flex items-center justify-center gap-2"
                  >
                    <FileText size={16} /> Apply Now
                  </Button>

                  <Button
                    onClick={() => router.push(`/messages?to=${listing.landlord_id}&listing=${listing.id}`)}
                    variant="outline"
                    className="w-full font-semibold mt-2 flex items-center justify-center gap-2"
                  >
                    <MessageSquare size={16} /> Message Landlord
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  )
}