'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Heart, Share2, MapPin, Phone, MessageCircle, ShieldCheck, ShieldOff, Flag, Calendar, MessageSquare, FileText, Route, Droplet, Zap, Wifi, Lock, Building2 } from 'lucide-react'
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
  const [inspection, setInspection] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [currentPhoto, setCurrentPhoto] = useState(0)
  const [saved, setSaved] = useState(false)
  const [savedBusy, setSavedBusy] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [showReportModal, setShowReportModal] = useState(false)
  const [notAvailable, setNotAvailable] = useState(false)

  useEffect(() => {
    const fetchListing = async () => {
      const { data } = await supabase.from('listings').select('*').eq('id', id).single()

      if (data && data.status !== 'approved') {
        setNotAvailable(true)
        setLoading(false)
        return
      }

      setListing(data)

      if (data?.landlord_id) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name, phone, verified')
          .eq('id', data.landlord_id)
          .maybeSingle()
        setLandlord(profile)
      }

      if (data?.id) {
        const { data: inspectionData } = await supabase
          .from('property_inspections')
          .select('inspected_at, road_condition, water_source, electricity_notes, network_notes, security_notes, neighborhood_type, nearby_landmarks, environment_notes, condition_notes, overall_notes')
          .eq('listing_id', data.id)
          .order('inspected_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        setInspection(inspectionData)
      }

      const { data: userData } = await supabase.auth.getUser()
      const uid = userData?.user?.id ?? null
      setUserId(uid)
      if (uid && data?.id) {
        const { data: existing } = await supabase
          .from('saved_properties')
          .select('id')
          .eq('tenant_id', uid)
          .eq('listing_id', data.id)
          .maybeSingle()
        setSaved(!!existing)
      }

      setLoading(false)
    }
    if (id) fetchListing()
  }, [id])

  async function handleToggleSave() {
    if (savedBusy) return
    if (!userId) {
      router.push('/login')
      return
    }
    setSavedBusy(true)
    if (saved) {
      await supabase
        .from('saved_properties')
        .delete()
        .eq('tenant_id', userId)
        .eq('listing_id', listing.id)
      setSaved(false)
    } else {
      await supabase
        .from('saved_properties')
        .insert({ tenant_id: userId, listing_id: listing.id })
      setSaved(true)
    }
    setSavedBusy(false)
  }

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

  if (!listing || notAvailable) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header />
        <div className="max-w-2xl mx-auto px-4 py-20 text-center">
          <p className="text-lg font-semibold text-foreground mb-2">
            {notAvailable ? 'This listing is no longer available' : 'Listing not found'}
          </p>
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

  const inspectionFields = inspection
    ? [
        { key: 'road_condition', label: 'Road', icon: Route, value: inspection.road_condition },
        { key: 'water_source', label: 'Water', icon: Droplet, value: inspection.water_source },
        { key: 'electricity_notes', label: 'Electricity', icon: Zap, value: inspection.electricity_notes },
        { key: 'network_notes', label: 'Network', icon: Wifi, value: inspection.network_notes },
        { key: 'security_notes', label: 'Security', icon: Lock, value: inspection.security_notes },
        { key: 'neighborhood_type', label: 'Neighbourhood', icon: Building2, value: inspection.neighborhood_type },
      ].filter((f) => f.value)
    : []

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      <main className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6">
        <button onClick={() => router.back()} className="text-sm text-primary font-medium hover:underline mb-4">
          ← Back to search
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <div className="relative rounded-lg overflow-hidden border border-border mb-2">
              <button
                onClick={handleToggleSave}
                disabled={savedBusy}
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

            {inspection && (
              <div className="mb-6 rounded-xl border-2 border-emerald-300 bg-emerald-50 overflow-hidden">
                <div className="flex items-center gap-2.5 px-5 pt-4 pb-3 border-b border-emerald-200">
                  <div className="w-9 h-9 rounded-full bg-emerald-600 flex items-center justify-center shrink-0">
                    <ShieldCheck size={18} className="text-white" />
                  </div>
                  <div>
                    <p className="font-extrabold text-emerald-900 leading-tight">EboHomes Inspected</p>
                    <p className="text-xs text-emerald-700">
                      Verified {new Date(inspection.inspected_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </p>
                  </div>
                </div>

                {inspectionFields.length > 0 && (
                  <div className="px-5 py-4 grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {inspectionFields.map(({ key, label, icon: Icon, value }) => (
                      <div key={key} className="flex items-start gap-2">
                        <Icon size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <p className="text-[11px] uppercase tracking-wide text-emerald-700 font-semibold">{label}</p>
                          <p className="text-sm text-emerald-950 font-medium">{value}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {inspection.nearby_landmarks && (
                  <div className="px-5 pb-3">
                    <p className="text-sm text-emerald-800">
                      <span className="font-semibold">Nearby: </span>{inspection.nearby_landmarks}
                    </p>
                  </div>
                )}

                {(inspection.overall_notes || inspection.condition_notes) && (
                  <div className="px-5 pb-4">
                    <p className="text-sm text-emerald-800">{inspection.overall_notes || inspection.condition_notes}</p>
                  </div>
                )}
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

          <div className="lg:col-span-1">
            <div className="sticky top-24 space-y-4">
              <div className="bg-card border border-border rounded-lg p-4 sm:p-5">
                <p className="text-2xl font-bold text-primary">₦{listing.price_monthly?.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground mb-4">per month</p>

                {landlord && (
                  <div className="mb-4 pb-4 border-b border-border">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-sm font-semibold text-foreground shrink-0">
                        {landlord.full_name?.[0] ?? 'L'}
                      </div>
                      <p className="text-sm font-medium text-foreground truncate min-w-0">{landlord.full_name}</p>
                    </div>

                    {landlord.verified ? (
                      <div className="flex items-start gap-2 sm:gap-2.5 bg-emerald-50 border-2 border-emerald-300 rounded-xl px-3 py-2.5 sm:px-3.5 sm:py-3">
                        <ShieldCheck size={20} className="text-emerald-600 shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <p className="text-sm sm:text-base font-extrabold text-emerald-800 leading-tight">
                            Verified Landlord
                          </p>
                          <p className="text-[11px] sm:text-xs text-emerald-700 leading-snug mt-0.5">
                            Identity &amp; ownership document reviewed by EboHomes
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start gap-2 sm:gap-2.5 bg-secondary border-2 border-border rounded-xl px-3 py-2.5 sm:px-3.5 sm:py-3">
                        <ShieldOff size={20} className="text-muted-foreground shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <p className="text-sm sm:text-base font-bold text-foreground leading-tight">
                            Not Yet Verified
                          </p>
                          <p className="text-[11px] sm:text-xs text-muted-foreground leading-snug mt-0.5">
                            EboHomes has not confirmed this landlord's identity
                          </p>
                        </div>
                      </div>
                    )}

                    <p className="mt-2 text-[10px] sm:text-[11px] text-muted-foreground leading-snug">
                      This checks the landlord's identity only — EboHomes has not inspected or confirmed the condition of this specific property.
                    </p>
                  </div>
                )}

                <div>
                  <p className="text-sm font-semibold text-foreground mb-3">Contact Landlord</p>

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
                    disabled={listing.status !== 'approved'}
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