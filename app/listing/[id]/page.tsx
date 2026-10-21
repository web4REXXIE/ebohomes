'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  Heart,
  Share2,
  MapPin,
  MessageCircle,
  ShieldCheck,
  ShieldOff,
  Flag,
  Calendar,
  Clock,
  FileText,
  Route,
  Droplet,
  Zap,
  Wifi,
  Lock,
  Building2,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  AlertTriangle,
  Leaf,
  Home,
  Copy,
  Check,
  Send,
  X,
} from 'lucide-react'
import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'
import dynamic from 'next/dynamic'
import { ReportListingModal } from '@/components/report-listing-modal'
import { PropertyGallery } from '@/components/property-gallery'

const ListingLocation = dynamic(
  () =>
    import('@/components/listing-location').then((mod) => ({
      default: mod.ListingLocation,
    })),
  { ssr: false }
)

const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  agent: 'Agent',
  manager: 'Property manager',
  other: 'Other',
}

// Fixes garbled characters (encoding bugs) and tidies spacing in descriptions
function cleanDescription(text: string) {
  if (!text) return ''
  return text
    .replace(/\r\n/g, '\n')
    .replace(/â‚¦/g, '₦')
    .replace(/â€™/g, '’')
    .replace(/â€˜/g, '‘')
    .replace(/â€œ|â€\u009d|â€/g, '"')
    .replace(/â€“/g, '–')
    .replace(/â€”/g, '—')
    .replace(/â€¢/g, '•')
    .replace(/Â/g, '')
    .replace(/�/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function formatDate(value?: string | null) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-NG', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export default function ListingDetailPage() {
  const params = useParams()
  const router = useRouter()

  const id = typeof params.id === 'string' ? params.id : undefined

  const [listing, setListing] = useState<any>(null)
  const [landlord, setLandlord] = useState<any>(null)
  const [inspection, setInspection] = useState<any>(null)
  const [trust, setTrust] = useState<any>(null)
  const [dates, setDates] = useState<{
    created_at: string | null
    updated_at: string | null
  }>({ created_at: null, updated_at: null })
  const [inspectionExpanded, setInspectionExpanded] = useState(false)
  const [loading, setLoading] = useState(true)

  const [saved, setSaved] = useState(false)
  const [savedBusy, setSavedBusy] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [showReportModal, setShowReportModal] = useState(false)
  const [notAvailable, setNotAvailable] = useState(false)
  const [pageError, setPageError] = useState('')
  const [shareMessage, setShareMessage] = useState('')
  const [copied, setCopied] = useState(false)
  const [showShareMenu, setShowShareMenu] = useState(false)
  const [canNativeShare, setCanNativeShare] = useState(false)

  // Derived early so gallery handlers and hooks below can use it
  const photos: string[] = Array.isArray(listing?.photos)
    ? listing.photos
    : []

  /* ---------------- Share ---------------- */

  // Detect native share support (phones) once on the client
  useEffect(() => {
    setCanNativeShare(
      typeof navigator !== 'undefined' && typeof navigator.share === 'function'
    )
  }, [])

  // Close share sheet with Escape
  useEffect(() => {
    if (!showShareMenu) return

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setShowShareMenu(false)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [showShareMenu])

  // Called by the Share button: opens the share sheet
  function handleShare() {
    if (!listing) return
    setShareMessage('')
    setCopied(false)
    setShowShareMenu(true)
  }

  function getShareDetails() {
    const url = window.location.href
    const text = `Check out this property on EboHomes: ${listing.title}`
    return {
      url,
      text,
      encodedUrl: encodeURIComponent(url),
      encodedText: encodeURIComponent(text),
    }
  }

  function openShareLink(
    platform: 'whatsapp' | 'facebook' | 'x' | 'telegram'
  ) {
    if (!listing || typeof window === 'undefined') return

    const { encodedUrl, encodedText } = getShareDetails()

    const links = {
      whatsapp: `https://wa.me/?text=${encodedText}%20${encodedUrl}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
      x: `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`,
      telegram: `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`,
    }

    window.open(links[platform], '_blank', 'noopener,noreferrer')
    setShowShareMenu(false)
  }

  async function handleCopyLink() {
    if (!listing || typeof window === 'undefined') return

    setShowShareMenu(false)

    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setShareMessage('Property link copied. Paste it anywhere to share.')
    } catch {
      setCopied(false)
      setShareMessage(
        'Unable to copy automatically. Copy the link from your browser address bar.'
      )
    }
  }

  // Opens the phone's native share sheet (TikTok, Instagram, SMS, etc.)
  async function handleNativeShare() {
    if (!listing || typeof navigator === 'undefined' || !navigator.share) {
      return
    }

    const { url, text } = getShareDetails()
    setShowShareMenu(false)

    try {
      await navigator.share({
        title: listing.title || 'Property on EboHomes',
        text,
        url,
      })
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return
      console.error('Native share failed:', error)
    }
  }

  /* ---------------- Data loading ---------------- */

  useEffect(() => {
    let cancelled = false

    async function fetchListing() {
      setLoading(true)
      setPageError('')
      setNotAvailable(false)

      if (!id) {
        setLoading(false)
        return
      }

      try {
        const { data, error } = await supabase
          .from('listings')
          .select(
            'id, landlord_id, title, description, location_text, lat, lng, price_monthly, service_charge, caution_deposit, property_type, bedrooms, bathrooms, amenities, photos, video_url, availability_date, listed_by_role, status, properties(public_id)'
          )
          .eq('id', id)
          .maybeSingle()

        if (cancelled) return

        if (error) {
          console.error('Failed to load listing:', error.message)
          setPageError(
            'We could not load this property right now. Please try again.'
          )
          setLoading(false)
          return
        }

        if (!data) {
          setLoading(false)
          return
        }

        if (data.status !== 'approved') {
          setNotAvailable(true)
          setLoading(false)
          return
        }

        setListing(data)

        // Date added / updated. Separate query so the page never breaks
        // if a column is missing.
        {
          const both = await supabase
            .from('listings')
            .select('created_at, updated_at')
            .eq('id', data.id)
            .maybeSingle()

          if (!cancelled) {
            if (!both.error && both.data) {
              setDates({
                created_at: (both.data as any).created_at ?? null,
                updated_at: (both.data as any).updated_at ?? null,
              })
            } else {
              const createdOnly = await supabase
                .from('listings')
                .select('created_at')
                .eq('id', data.id)
                .maybeSingle()

              if (!cancelled && !createdOnly.error && createdOnly.data) {
                setDates({
                  created_at: (createdOnly.data as any).created_at ?? null,
                  updated_at: null,
                })
              }
            }
          }
        }

        if (data.landlord_id) {
          const { data: profile, error: profileError } = await supabase
            .from('profiles_public')
            .select('full_name, verified')
            .eq('id', data.landlord_id)
            .maybeSingle()

          if (!cancelled) {
            if (profileError) {
              console.error(
                'Failed to load public landlord profile:',
                profileError.message
              )
            } else {
              setLandlord(profile)
            }
          }
        }

        const { data: inspectionData, error: inspectionError } =
          await supabase
            .from('public_listing_inspections')
            .select(
              'inspected_at, road_condition, road_matches, water_source, water_matches, electricity_notes, electricity_matches, network_notes, network_matches, security_notes, security_matches, neighborhood_type, nearby_landmarks, environment_notes, environment_matches, condition_notes, condition_matches, overall_notes'
            )
            .eq('listing_id', data.id)
            .order('inspected_at', { ascending: false })
            .limit(1)
            .maybeSingle()

        if (!cancelled) {
          if (inspectionError) {
            console.error(
              'Failed to load listing inspection:',
              inspectionError.message
            )
          } else {
            setInspection(inspectionData)
          }
        }

        const { data: trustRows, error: trustError } = await supabase.rpc(
          'listing_trust',
          { p_listing: data.id }
        )

        if (!cancelled) {
          if (trustError) {
            console.error(
              'Failed to load listing trust information:',
              trustError.message
            )
          } else {
            setTrust(
              Array.isArray(trustRows) ? trustRows[0] ?? null : null
            )
          }
        }

        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser()

        if (cancelled) return

        if (authError) {
          console.error('Failed to check current user:', authError.message)
        }

        const uid = user?.id ?? null
        setUserId(uid)

        if (uid) {
          const { data: existing, error: savedError } = await supabase
            .from('saved_properties')
            .select('id')
            .eq('tenant_id', uid)
            .eq('listing_id', data.id)
            .maybeSingle()

          if (!cancelled) {
            if (savedError) {
              console.error(
                'Failed to check saved property:',
                savedError.message
              )
            } else {
              setSaved(!!existing)
            }
          }
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Unexpected listing error:', error)
          setPageError(
            'Something went wrong while loading this property. Please try again.'
          )
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    fetchListing()

    return () => {
      cancelled = true
    }
  }, [id])

  async function handleToggleSave() {
    if (savedBusy || !listing) return

    if (!userId) {
      router.push(`/login?redirect=${encodeURIComponent(`/listing/${id}`)}`)
      return
    }

    setSavedBusy(true)
    setPageError('')

    try {
      if (saved) {
        const { error } = await supabase
          .from('saved_properties')
          .delete()
          .eq('tenant_id', userId)
          .eq('listing_id', listing.id)

        if (error) {
          console.error('Failed to remove saved property:', error.message)
          setPageError(
            'Could not remove this property from your saved list. Please try again.'
          )
          return
        }

        setSaved(false)
      } else {
        const { error } = await supabase.from('saved_properties').insert({
          tenant_id: userId,
          listing_id: listing.id,
        })

        if (error) {
          console.error('Failed to save property:', error.message)
          setPageError(
            'Could not save this property. Please try again.'
          )
          return
        }

        setSaved(true)
      }
    } catch (error) {
      console.error('Unexpected save error:', error)
      setPageError('Something went wrong. Please try again.')
    } finally {
      setSavedBusy(false)
    }
  }

  /* ---------------- Early returns ---------------- */

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header />

        <main className="max-w-6xl mx-auto px-4 py-10 w-full animate-pulse flex-1">
          <div className="h-96 bg-secondary rounded-lg mb-4" />
          <div className="h-6 bg-secondary rounded w-1/3 mb-2" />
          <div className="h-4 bg-secondary rounded w-1/4" />
        </main>

        <Footer />
      </div>
    )
  }

  if (pageError && !listing) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header />

        <main className="max-w-2xl mx-auto px-4 py-20 text-center flex-1">
          <p className="text-lg font-semibold text-foreground mb-2">
            Unable to load property
          </p>

          <p className="text-sm text-muted-foreground mb-5">{pageError}</p>

          <Button
            onClick={() => window.location.reload()}
            className="mr-2"
          >
            Try again
          </Button>

          <button
            onClick={() => router.push('/search')}
            className="text-primary text-sm font-medium hover:underline"
          >
            Back to search
          </button>
        </main>

        <Footer />
      </div>
    )
  }

  if (!listing || notAvailable) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header />

        <main className="max-w-2xl mx-auto px-4 py-20 text-center flex-1">
          <p className="text-lg font-semibold text-foreground mb-2">
            {notAvailable
              ? 'This listing is no longer available'
              : 'Listing not found'}
          </p>

          <p className="text-sm text-muted-foreground mb-4">
            {notAvailable
              ? 'This property is not currently available for applications.'
              : 'We could not find the property you requested.'}
          </p>

          <button
            onClick={() => router.push('/search')}
            className="text-primary text-sm font-medium hover:underline"
          >
            ← Back to search
          </button>
        </main>

        <Footer />
      </div>
    )
  }

  /* ---------------- Derived values ---------------- */

  // Contact goes through the EboHomes in-app inbox (one conversation per property).
  const openEboHomesChat = (category: 'viewing' | 'property') => {
    if (!listing) return
    const params = new URLSearchParams({
      new: '1',
      category,
      listing: String(listing.id),
      subject: `${category === 'viewing' ? 'Viewing' : 'Question'}: ${String(listing.title ?? 'Property').slice(0, 90)}`,
    })
    const target = `/messages?${params.toString()}`
    if (!userId) {
      router.push(`/login?redirect=${encodeURIComponent(target)}`)
      return
    }
    router.push(target)
  }

  const listedByLabel: string | null = listing.listed_by_role
    ? ROLE_LABELS[listing.listed_by_role] ?? 'Other'
    : null

  const addedText = formatDate(dates.created_at)
  const updatedText = formatDate(dates.updated_at)
  const showUpdated =
    !!dates.created_at &&
    !!dates.updated_at &&
    Math.abs(
      new Date(dates.updated_at).getTime() -
        new Date(dates.created_at).getTime()
    ) > 86400000 &&
    !!updatedText

  const cleanedDescription = cleanDescription(listing.description ?? '')

  const inspectionFields = inspection
    ? [
        {
          key: 'road_condition',
          label: 'Road',
          icon: Route,
          value: inspection.road_condition,
          match: inspection.road_matches,
        },
        {
          key: 'water_source',
          label: 'Water',
          icon: Droplet,
          value: inspection.water_source,
          match: inspection.water_matches,
        },
        {
          key: 'electricity_notes',
          label: 'Electricity',
          icon: Zap,
          value: inspection.electricity_notes,
          match: inspection.electricity_matches,
        },
        {
          key: 'network_notes',
          label: 'Network',
          icon: Wifi,
          value: inspection.network_notes,
          match: inspection.network_matches,
        },
        {
          key: 'security_notes',
          label: 'Security',
          icon: Lock,
          value: inspection.security_notes,
          match: inspection.security_matches,
        },
        {
          key: 'neighborhood_type',
          label: 'Neighbourhood',
          icon: Building2,
          value: inspection.neighborhood_type,
          match: null as boolean | null,
        },
      ].filter((field) => field.value)
    : []

  const inspectionNotes = inspection
    ? [
        {
          key: 'environment',
          label: 'Environment',
          icon: Leaf,
          value: inspection.environment_notes,
          match: inspection.environment_matches,
        },
        {
          key: 'condition',
          label: 'Condition',
          icon: Home,
          value: inspection.overall_notes || inspection.condition_notes,
          match: inspection.condition_matches,
        },
      ].filter((field) => field.value)
    : []

  /* ---------------- Main render ---------------- */

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      <main className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 lg:px-8 pt-6 pb-28 lg:py-6">
        <button
          onClick={() => router.back()}
          className="text-sm text-primary font-medium hover:underline mb-4"
        >
          ← Back to search
        </button>

        {pageError && (
          <div
            role="alert"
            className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
          >
            {pageError}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <div className="relative mb-4">
              <PropertyGallery
                key={listing.id}
                images={photos}
                title={listing.title}
              />

              {/* Save property */}
              <button
                type="button"
                onClick={handleToggleSave}
                disabled={savedBusy}
                aria-label={
                  saved ? 'Remove from saved properties' : 'Save property'
                }
                aria-pressed={saved}
                className="absolute right-14 top-3 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/95 shadow-md transition hover:bg-white disabled:opacity-50"
              >
                <Heart
                  size={19}
                  className={
                    saved
                      ? 'fill-destructive text-destructive'
                      : 'text-foreground'
                  }
                />
              </button>

              {/* Share property */}
              <button
                type="button"
                onClick={handleShare}
                aria-label="Share property"
                className="absolute right-3 top-3 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/95 shadow-md transition hover:bg-white"
              >
                <Share2 size={18} className="text-foreground" />
              </button>
            </div>

            {/* Share feedback */}
            {shareMessage && (
              <div
                role="status"
                className="mb-4 flex items-center gap-2 text-xs text-primary"
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {shareMessage}
              </div>
            )}

            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-1">
              <h1 className="text-2xl font-bold text-foreground">
                {listing.title}
              </h1>

              {(listing.properties?.public_id || listedByLabel) && (
                <p className="text-xs font-medium text-muted-foreground sm:text-right">
                  {listing.properties?.public_id && (
                    <>Property ID: {listing.properties.public_id}</>
                  )}

                  {listing.properties?.public_id && listedByLabel && ' · '}

                  {listedByLabel && <>Listed by {listedByLabel}</>}
                </p>
              )}
            </div>

            <p className="flex items-center gap-1 text-muted-foreground text-sm mb-2">
              <MapPin size={14} />
              {listing.location_text}
            </p>

            {/* Date added / updated */}
            {addedText && (
              <p className="mb-4 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                <Clock size={12} className="shrink-0" />
                <span>Added {addedText}</span>
                {showUpdated && <span>· Updated {updatedText}</span>}
              </p>
            )}

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
                  <Calendar size={12} />
                  Available: {listing.availability_date}
                </span>
              )}
            </div>

            {listing.video_url && (
              <div className="mb-6">
                <h3 className="font-semibold text-foreground mb-2">
                  Property Walkthrough
                </h3>

                <video
                  src={listing.video_url}
                  controls
                  preload="metadata"
                  className="w-full rounded-lg max-h-96 bg-black"
                />
              </div>
            )}

            {cleanedDescription && (
              <div className="mb-6">
                <h3 className="font-semibold text-foreground mb-2">
                  Description
                </h3>

                <p className="text-muted-foreground text-sm leading-relaxed whitespace-pre-line">
                  {cleanedDescription}
                </p>
              </div>
            )}

            {listing.amenities?.length > 0 && (
              <div className="mb-6">
                <h3 className="font-semibold text-foreground mb-3">
                  Amenities
                </h3>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {listing.amenities.map((amenity: string) => (
                    <span
                      key={amenity}
                      className="text-sm text-foreground flex items-center gap-2"
                    >
                      <ShieldCheck size={14} className="text-primary" />
                      {amenity}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {(trust?.identity_checked ||
              trust?.documents_reviewed ||
              inspection) && (
              <div className="mb-6 flex flex-wrap gap-2">
                {trust?.identity_checked && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800">
                    <ShieldCheck size={14} />
                    Identity checked
                  </span>
                )}

                {trust?.documents_reviewed && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800">
                    <FileText size={14} />
                    Documents reviewed
                  </span>
                )}

                {inspection && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800">
                    <CheckCircle2 size={14} />
                    Physically inspected by EboHomes.
                  </span>
                )}
              </div>
            )}

            {inspection && (
              <div className="mb-6 rounded-xl border-2 border-emerald-300 bg-emerald-50 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setInspectionExpanded((value) => !value)}
                  aria-expanded={inspectionExpanded}
                  className="w-full flex items-center justify-between gap-2.5 px-5 py-4 text-left"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-emerald-600 flex items-center justify-center shrink-0">
                      <ShieldCheck size={18} className="text-white" />
                    </div>

                    <div className="min-w-0">
                      <p className="font-extrabold text-emerald-900 leading-tight">
                        Physically inspected by EboHomes.
                      </p>

                      <p className="text-xs text-emerald-700 truncate">
                        Inspected{' '}
                        {new Date(inspection.inspected_at).toLocaleDateString(
                          'en-NG',
                          {
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric',
                          }
                        )}{' '}
                        · Tap for details
                      </p>
                    </div>
                  </div>

                  {inspectionExpanded ? (
                    <ChevronUp
                      size={20}
                      className="text-emerald-700 shrink-0"
                    />
                  ) : (
                    <ChevronDown
                      size={20}
                      className="text-emerald-700 shrink-0"
                    />
                  )}
                </button>

                {inspectionExpanded && (
                  <div className="border-t border-emerald-200">
                    {inspectionFields.length > 0 && (
                      <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {inspectionFields.map(
                          ({ key, label, icon: Icon, value, match }) => (
                            <div
                              key={key}
                              className="flex items-start gap-2"
                            >
                              <Icon
                                size={16}
                                className="text-emerald-600 shrink-0 mt-0.5"
                              />

                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <p className="text-[11px] uppercase tracking-wide text-emerald-700 font-semibold">
                                    {label}
                                  </p>

                                  {match === true && (
                                    <CheckCircle2
                                      size={12}
                                      className="text-emerald-600 shrink-0"
                                    />
                                  )}

                                  {match === false && (
                                    <AlertTriangle
                                      size={12}
                                      className="text-amber-600 shrink-0"
                                    />
                                  )}
                                </div>

                                <p className="text-sm text-emerald-950 font-medium">
                                  {value}
                                </p>

                                {match === false && (
                                  <p className="text-[11px] text-amber-700 mt-0.5">
                                    Differs from listing description
                                  </p>
                                )}
                              </div>
                            </div>
                          )
                        )}
                      </div>
                    )}

                    {inspectionNotes.length > 0 && (
                      <div className="px-5 pb-4 space-y-3 border-t border-emerald-200 pt-3">
                        {inspectionNotes.map(
                          ({ key, label, icon: Icon, value, match }) => (
                            <div
                              key={key}
                              className="flex items-start gap-2"
                            >
                              <Icon
                                size={16}
                                className="text-emerald-600 shrink-0 mt-0.5"
                              />

                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <p className="text-[11px] uppercase tracking-wide text-emerald-700 font-semibold">
                                    {label}
                                  </p>

                                  {match === true && (
                                    <CheckCircle2
                                      size={12}
                                      className="text-emerald-600 shrink-0"
                                    />
                                  )}

                                  {match === false && (
                                    <AlertTriangle
                                      size={12}
                                      className="text-amber-600 shrink-0"
                                    />
                                  )}
                                </div>

                                <p className="text-sm text-emerald-950">
                                  {value}
                                </p>

                                {match === false && (
                                  <p className="text-[11px] text-amber-700 mt-0.5">
                                    Differs from listing description
                                  </p>
                                )}
                              </div>
                            </div>
                          )
                        )}
                      </div>
                    )}

                  
                 <div className="px-5 pb-3">
                      <p className="text-[11px] text-emerald-800">
                        This is a physical inspection of the property only. It does not confirm ownership, the
                        right to rent it out, the rental terms or availability.
                      </p>
                    </div>
                    
                    {inspection.nearby_landmarks && (
                      <div className="px-5 pb-4">
                        <p className="text-sm text-emerald-800">
                          <span className="font-semibold">Nearby: </span>
                          {inspection.nearby_landmarks}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {listing.lat != null && listing.lng != null && (
              <ListingLocation
                lat={Number(listing.lat)}
                lng={Number(listing.lng)}
                title={listing.title}
                address={listing.location_text}
              />
            )}

            {/* Safety tip */}
            <div className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-4">
              <div className="flex items-start gap-3">
                <ShieldCheck
                  size={20}
                  className="mt-0.5 shrink-0 text-amber-700"
                />

                <div className="min-w-0">
                  <p className="text-sm font-extrabold text-amber-900">
                    Stay safe: never pay outside EboHomes
                  </p>

                  <ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs leading-relaxed text-amber-900">
                    <li>
                      Do not send money to any person or account that is not
                      arranged through EboHomes.
                    </li>
                    <li>
                      Inspect the property before you pay, and confirm the
                      rent, agreement and documents.
                    </li>
                    <li>
                      Unsure about anything? Tap the chat button and ask
                      EboHomes first.
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Report property */}
            <div className="mt-4 flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">
                  Something doesn&apos;t look right?
                </p>

                <p className="text-xs text-muted-foreground">
                  Report fake, wrong or already-rented listings so EboHomes can
                  check them.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowReportModal(true)}
                className="flex shrink-0 items-center justify-center gap-2 rounded-md border border-destructive px-3 py-2 text-sm font-semibold text-destructive transition-colors hover:bg-destructive hover:text-white"
              >
                <Flag size={14} />
                Report property
              </button>
            </div>

            {showReportModal && (
              <ReportListingModal
                listingId={listing.id}
                onClose={() => setShowReportModal(false)}
              />
            )}
          </div>

          <div className="lg:col-span-1">
            <div className="sticky top-24 space-y-4">
              <div className="bg-card border border-border rounded-lg p-4 sm:p-5">
                <p className="text-2xl font-bold text-primary">
                  ₦{Number(listing.price_monthly ?? 0).toLocaleString('en-NG')}
                </p>

                <p className="text-xs text-muted-foreground mb-4">
                  per month
                </p>

                {(Number(listing.service_charge) > 0 ||
                  Number(listing.caution_deposit) > 0) && (
                  <div className="mb-4 space-y-1 text-sm">
                    {Number(listing.service_charge) > 0 && (
                      <div className="flex justify-between gap-3">
                        <span className="text-muted-foreground">
                          Service charge
                        </span>

                        <span className="font-semibold text-foreground">
                          ₦
                          {Number(listing.service_charge).toLocaleString(
                            'en-NG'
                          )}
                        </span>
                      </div>
                    )}

                    {Number(listing.caution_deposit) > 0 && (
                      <div className="flex justify-between gap-3">
                        <span className="text-muted-foreground">
                          Caution / deposit
                        </span>

                        <span className="font-semibold text-foreground">
                          ₦
                          {Number(listing.caution_deposit).toLocaleString(
                            'en-NG'
                          )}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {landlord && (
                  <div className="mb-4 pb-4 border-b border-border">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-sm font-semibold text-foreground shrink-0">
                        {landlord.full_name?.[0] ?? 'L'}
                      </div>

                      <p className="text-sm font-medium text-foreground truncate min-w-0">
                        {landlord.full_name}
                      </p>
                    </div>

                    {landlord.verified ? (
                      <div className="flex items-start gap-2 sm:gap-2.5 bg-emerald-50 border-2 border-emerald-300 rounded-xl px-3 py-2.5 sm:px-3.5 sm:py-3">
                        <ShieldCheck
                          size={20}
                          className="text-emerald-600 shrink-0 mt-0.5"
                        />

                        <div className="min-w-0">
                          <p className="text-sm sm:text-base font-extrabold text-emerald-800 leading-tight">
                            Verified Landlord
                          </p>

                          <p className="text-[11px] sm:text-xs text-emerald-700 leading-snug mt-0.5">
                            Identity and ownership documents reviewed by
                            EboHomes.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start gap-2 sm:gap-2.5 bg-secondary border-2 border-border rounded-xl px-3 py-2.5 sm:px-3.5 sm:py-3">
                        <ShieldOff
                          size={20}
                          className="text-muted-foreground shrink-0 mt-0.5"
                        />

                        <div className="min-w-0">
                          <p className="text-sm sm:text-base font-bold text-foreground leading-tight">
                            Not Yet Verified
                          </p>

                          <p className="text-[11px] sm:text-xs text-muted-foreground leading-snug mt-0.5">
                            EboHomes has not confirmed this landlord&apos;s
                            identity.
                          </p>
                        </div>
                      </div>
                    )}

                    <p className="mt-2 text-[10px] sm:text-[11px] text-muted-foreground leading-snug">
                      Identity verification does not by itself confirm the
                      condition of this specific property. Check the property
                      and relevant documents before paying.
                    </p>
                  </div>
                )}

                <div>
                  <Button
                    type="button"
                    onClick={() => openEboHomesChat('property')}
                    className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold mb-4 flex items-center justify-center gap-2"
                  >
                    <MessageCircle size={16} />
                    Chat with EboHomes
                  </Button>

                  <p className="text-sm font-semibold text-foreground mb-3">
                    Interested?
                  </p>

                  <Button
                    type="button"
                    onClick={() => router.push(`/journey/apply/${listing.id}`)}
                    disabled={listing.status !== 'approved'}
                    className="w-full bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-primary-foreground font-semibold mt-2 flex items-center justify-center gap-2"
                  >
                    <FileText size={16} />
                    Apply Now
                  </Button>

                  <Button
                    type="button"
                    onClick={() => openEboHomesChat('viewing')}
                    variant="outline"
                    className="w-full font-semibold mt-2 flex items-center justify-center gap-2"
                  >
                    <Calendar size={16} />
                    Request a Viewing
                  </Button>

                  <p className="mt-3 text-[11px] text-muted-foreground leading-snug">
                    EboHomes coordinates viewing requests and applications.
                    Arrange viewings through EboHomes. Inspect the property
                    yourself and confirm the rent, agreement, ownership
                    documents, and payment arrangements before paying.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Sticky action bar (mobile and tablet) */}
      <div
        className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 border-t border-border bg-background/95 px-3 py-2.5 shadow-[0_-4px_16px_rgba(0,0,0,0.08)] backdrop-blur md:bottom-0 lg:hidden"
        role="region"
        aria-label="Property actions"
      >
        <div className="mx-auto flex max-w-xl items-center gap-2">
          <button
            type="button"
            onClick={() => openEboHomesChat('property')}
            aria-label="Contact EboHomes"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-primary transition hover:bg-secondary"
          >
            <MessageCircle size={20} />
          </button>

          <Button
            type="button"
            variant="outline"
            onClick={() => openEboHomesChat('viewing')}
            className="h-11 flex-1 gap-1.5 px-2 text-[13px] font-semibold"
          >
            <Calendar size={16} />
            Request a viewing
          </Button>

          <Button
            type="button"
            onClick={() => router.push(`/journey/apply/${listing.id}`)}
            disabled={listing.status !== 'approved'}
            className="h-11 flex-[1.3] gap-1.5 bg-primary px-2 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <FileText size={16} />
            Apply now
          </Button>
        </div>
      </div>

      {/* Share sheet */}
      {showShareMenu && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center"
          onClick={() => setShowShareMenu(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Share this property"
        >
          <div
            className="w-full max-w-md rounded-t-2xl bg-background p-5 shadow-xl sm:rounded-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-1 flex items-center justify-between">
              <h2 className="text-base font-bold text-foreground">
                Share this property
              </h2>

              <button
                type="button"
                onClick={() => setShowShareMenu(false)}
                aria-label="Close share menu"
                className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-secondary"
              >
                <X size={18} />
              </button>
            </div>

            <p className="mb-4 truncate text-xs text-muted-foreground">
              {listing.title}
            </p>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => openShareLink('whatsapp')}
                className="flex items-center gap-2 rounded-lg border border-border px-3 py-3 text-sm font-medium text-foreground transition hover:bg-secondary"
              >
                <MessageCircle size={18} className="text-emerald-600" />
                WhatsApp
              </button>

              <button
                type="button"
                onClick={() => openShareLink('facebook')}
                className="flex items-center gap-2 rounded-lg border border-border px-3 py-3 text-sm font-medium text-foreground transition hover:bg-secondary"
              >
                <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-blue-600 text-[11px] font-bold leading-none text-white">
                  f
                </span>
                Facebook
              </button>

              <button
                type="button"
                onClick={() => openShareLink('x')}
                className="flex items-center gap-2 rounded-lg border border-border px-3 py-3 text-sm font-medium text-foreground transition hover:bg-secondary"
              >
                <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-black text-[10px] font-bold leading-none text-white">
                  X
                </span>
                X (Twitter)
              </button>

              <button
                type="button"
                onClick={() => openShareLink('telegram')}
                className="flex items-center gap-2 rounded-lg border border-border px-3 py-3 text-sm font-medium text-foreground transition hover:bg-secondary"
              >
                <Send size={18} className="text-sky-500" />
                Telegram
              </button>

              <button
                type="button"
                onClick={handleCopyLink}
                className="flex items-center gap-2 rounded-lg border border-border px-3 py-3 text-sm font-medium text-foreground transition hover:bg-secondary"
              >
                <Copy size={18} />
                Copy link
              </button>

              {canNativeShare && (
                <button
                  type="button"
                  onClick={handleNativeShare}
                  className="flex items-center gap-2 rounded-lg border border-border px-3 py-3 text-sm font-medium text-foreground transition hover:bg-secondary"
                >
                  <Share2 size={18} />
                  More apps
                </button>
              )}
            </div>

            <p className="mt-4 text-[11px] leading-snug text-muted-foreground">
              For TikTok or Instagram, tap &quot;More apps&quot; on your phone,
              or copy the link and paste it into your post or story.
            </p>
          </div>
        </div>
      )}

      <Footer />
    </div>
  )
}