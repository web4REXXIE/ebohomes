'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  Heart,
  Share2,
  MessageCircle,
  ShieldCheck,
  Flag,
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
import { AvailabilityNote } from '@/components/availability-note'
import {
  PropertyHeader,
  PropertyKeyFacts,
  PropertyRentCard,
  PropertyDescription,
  PropertyAmenities,
} from '@/components/property-details'
import { displayTitle } from '@/lib/property-display'
import { cleanMediaUrls } from '@/lib/property-media'
import { PropertyVideo } from '@/components/property-video'
import { PropertyTrust } from '@/components/property-trust'
import { RemoteInspectionEntry } from '@/components/remote-inspection-entry'
import { identityState } from '@/lib/property-trust'
import { listedByLabel as toListedByLabel } from '@/lib/listing-authority'
import {
  PropertyActionsBar,
  PropertyActionsSidebar,
} from '@/components/property-actions'
import { decidePropertyActions } from '@/lib/property-actions'
import { OPEN_STATUSES as APPLICATION_OPEN_STATUSES } from '@/lib/application-form'
import { OPEN_STATUSES as VIEWING_OPEN_STATUSES } from '@/lib/viewing-status'

const ListingLocation = dynamic(
  () =>
    import('@/components/listing-location-public').then((mod) => ({
      default: mod.ListingLocationPublic,
    })),
  { ssr: false }
)

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

// Reads whether this tenant already saved this listing. Returns null if it could not be checked,
// which is different from "not saved".
async function checkSaved(
  tenantId: string,
  listingId: string
): Promise<boolean | null> {
  const { data, error } = await supabase
    .from('saved_properties')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('listing_id', listingId)
    .maybeSingle()

  if (error) {
    console.error('Failed to check saved property:', error.message)
    return null
  }
  return !!data
}

export default function ListingDetailPage() {
  const params = useParams()
  const router = useRouter()

  const id = typeof params.id === 'string' ? params.id : undefined

  const [listing, setListing] = useState<any>(null)
  const [landlord, setLandlord] = useState<any>(null)
  const [inspection, setInspection] = useState<any>(null)
  const [trust, setTrust] = useState<any>(null)
  const [trustFailed, setTrustFailed] = useState(false)
  const [authorityReviewed, setAuthorityReviewed] = useState<boolean | null>(null)
  const [inspectionFailed, setInspectionFailed] = useState(false)
  const [dates, setDates] = useState<{
    created_at: string | null
    updated_at: string | null
  }>({ created_at: null, updated_at: null })
  const [loading, setLoading] = useState(true)

  const [saved, setSaved] = useState(false)
  const [savedBusy, setSavedBusy] = useState(false)
  const [savedKnown, setSavedKnown] = useState(true)
  const [saveMessage, setSaveMessage] = useState('')
  const [onHold, setOnHold] = useState(false)
  const [myApplication, setMyApplication] = useState<{
    id: string
    status: string
  } | null>(null)
  const [myViewing, setMyViewing] = useState<{ status: string } | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [showReportModal, setShowReportModal] = useState(false)
  const [notAvailable, setNotAvailable] = useState(false)
  const [pageError, setPageError] = useState('')
  const [shareMessage, setShareMessage] = useState('')
  const [copied, setCopied] = useState(false)
  const [showShareMenu, setShowShareMenu] = useState(false)
  const [canNativeShare, setCanNativeShare] = useState(false)

  // Derived early so gallery handlers and hooks below can use it
  const photos: string[] = cleanMediaUrls(listing?.photos)

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
            'id, landlord_id, title, description, location_text, price_monthly, service_charge, caution_deposit, property_type, bedrooms, bathrooms, amenities, photos, video_url, availability_date, listed_by_role, status, properties(public_id)'
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
          setInspectionFailed(Boolean(inspectionError))
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
          setTrustFailed(Boolean(trustError))
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

        // Has EboHomes accepted the authority evidence for this property? A yes/no only.
        const { data: authorityData, error: authorityError } = await supabase.rpc(
          'listing_authority_reviewed',
          { p_listing: data.id }
        )
        if (!cancelled) {
          if (authorityError) {
            console.error('Failed to load authority review:', authorityError.message)
          } else {
            setAuthorityReviewed(authorityData === true)
          }
        }

        // Is the property on hold? New applications and viewings are blocked in the
        // database while it is. This only lets the page explain it before the tenant types.
        const { data: holdData, error: holdError } = await supabase.rpc(
          'listing_on_hold',
          { p_listing: data.id }
        )

        if (!cancelled) {
          if (holdError) {
            console.error('Failed to check property hold:', holdError.message)
          } else {
            setOnHold(holdData === true)
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

        if (uid && data.landlord_id !== uid) {
          const savedState = await checkSaved(uid, data.id)

          if (!cancelled) {
            if (savedState === null) {
              setSavedKnown(false)
            } else {
              setSavedKnown(true)
              setSaved(savedState)
            }
          }

          // The tenant's own open application and viewing for this listing.
          // Only their own rows are read, so no other tenant's data is involved.
          const { data: appRows, error: appError } = await supabase
            .from('applications')
            .select('id, status')
            .eq('listing_id', data.id)
            .eq('tenant_id', uid)
            .in('status', [...APPLICATION_OPEN_STATUSES])
            .order('created_at', { ascending: false })
            .limit(1)

          if (cancelled) return

          if (appError) {
            console.error('Failed to check your application:', appError.message)
          } else if (appRows && appRows.length > 0) {
            const app = appRows[0] as { id: string; status: string }
            setMyApplication({ id: app.id, status: app.status })

            const { data: viewingRows, error: viewingError } = await supabase
              .from('viewings')
              .select('id, status')
              .eq('application_id', app.id)
              .in('status', VIEWING_OPEN_STATUSES)
              .order('created_at', { ascending: false })
              .limit(1)

            if (!cancelled) {
              if (viewingError) {
                console.error(
                  'Failed to check your viewing:',
                  viewingError.message
                )
              } else if (viewingRows && viewingRows.length > 0) {
                setMyViewing({
                  status: (viewingRows[0] as { status: string }).status,
                })
              }
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

    // The owner never saves their own listing.
    if (listing.landlord_id === userId) return

    setSavedBusy(true)
    setPageError('')
    setSaveMessage('')

    try {
      let isSaved = saved

      // The first check failed earlier, so the heart may be wrong. Check again before acting.
      if (!savedKnown) {
        const state = await checkSaved(userId, listing.id)

        if (state === null) {
          setPageError(
            'We could not check your saved list. Please try again.'
          )
          return
        }

        setSavedKnown(true)
        setSaved(state)

        if (state) {
          setSaveMessage('This property is already in your saved list.')
          return
        }

        isSaved = false
      }

      if (isSaved) {
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
        setSaveMessage('Removed from your saved properties.')
      } else {
        const { error } = await supabase.from('saved_properties').insert({
          tenant_id: userId,
          listing_id: listing.id,
        })

        // 23505 = already saved (unique rule on tenant and listing). Not a failure.
        if (error && error.code !== '23505') {
          console.error('Failed to save property:', error.message)
          setPageError('Could not save this property. Please try again.')
          return
        }

        setSaved(true)
        setSaveMessage(
          error
            ? 'This property is already in your saved list.'
            : 'Saved. You can find it under Saved properties.'
        )
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

  const listedByLabel: string | null = toListedByLabel(listing.listed_by_role)

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

  const isOwner =
    !!userId && !!listing.landlord_id && listing.landlord_id === userId

  const actions = decidePropertyActions({
    listingId: String(listing.id),
    listingStatus: listing.status,
    signedIn: !!userId,
    isOwner,
    onHold,
    application: myApplication,
    viewing: myViewing,
  })

  /* ---------------- Main render ---------------- */

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      <main className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 lg:px-8 pt-6 pb-36 lg:py-6">
        <button
          type="button"
          onClick={() => {
            if (typeof window !== 'undefined' && window.history.length > 1) {
              router.back()
            } else {
              router.push('/search')
            }
          }}
          className="mb-4 text-sm font-medium text-primary hover:underline"
        >
          ← Back
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
                title={displayTitle(listing)}
              />

              {/* Save property (hidden for the listing owner) */}
              {actions.canSave && (
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
              )}

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

            {/* Save feedback: also read out by screen readers */}
            <div
              role="status"
              aria-live="polite"
              className={
                saveMessage
                  ? 'mb-4 flex items-center gap-2 text-xs text-primary'
                  : 'sr-only'
              }
            >
              {saveMessage && <Check size={14} aria-hidden />}
              {saveMessage}
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

            <div className="mb-4">
              <PropertyHeader
                title={displayTitle(listing)}
                location={listing.location_text}
                publicId={listing.properties?.public_id}
                listedByLabel={listedByLabel}
                addedText={addedText}
                updatedText={showUpdated ? updatedText : undefined}
              />
            </div>

            <AvailabilityNote
              listingId={listing.id}
              listingStatus={listing.status}
              className="mb-4"
            />

            {/* Rent card: shown here on phones and tablets, in the side column on desktop */}
            <PropertyRentCard
              priceMonthly={listing.price_monthly}
              serviceCharge={listing.service_charge}
              cautionDeposit={listing.caution_deposit}
              className="mb-4 lg:hidden"
            />

            <div className="mb-6">
              <PropertyKeyFacts
                propertyType={listing.property_type}
                bedrooms={listing.bedrooms}
                bathrooms={listing.bathrooms}
                availabilityDate={listing.availability_date}
              />
            </div>

            <PropertyVideo
              key={String(listing.video_url ?? '')}
              url={listing.video_url}
              title={displayTitle(listing)}
              posterPhoto={photos[0]}
              className="mb-6"
            />

            <PropertyDescription text={cleanedDescription} className="mb-6" />

            <PropertyAmenities amenities={listing.amenities} className="mb-6" />

            <PropertyTrust
              trust={trust}
              trustFailed={trustFailed}
              authorityReviewed={authorityReviewed}
              inspection={inspection}
              inspectionFailed={inspectionFailed}
              className="mb-6"
            />

            <RemoteInspectionEntry
              listingId={String(listing.id)}
              listingStatus={listing.status}
              userId={userId}
              isOwner={isOwner}
              onHold={onHold}
              className="mb-6"
            />

            <ListingLocation
              listingId={listing.id}
              title={displayTitle(listing)}
              address={listing.location_text}
            />

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
              <PropertyRentCard
                priceMonthly={listing.price_monthly}
                serviceCharge={listing.service_charge}
                cautionDeposit={listing.caution_deposit}
                className="hidden lg:block"
              />

              <div className="bg-card border border-border rounded-lg p-4 sm:p-5">
                {landlord && (
                  <div className="mb-4 border-b border-border pb-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-foreground">
                        {landlord.full_name?.[0] ?? 'L'}
                      </div>

                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          {landlord.full_name}
                        </p>

                        <a
                          href="#trust"
                          className="text-caption font-semibold text-primary hover:underline"
                        >
                          {identityState(trust, trustFailed) === 'yes'
                            ? 'Identity checked'
                            : identityState(trust, trustFailed) === 'no'
                              ? 'Identity not yet checked'
                              : 'Verification details'}
                          {' · see details'}
                        </a>
                      </div>
                    </div>
                  </div>
                )}

                <PropertyActionsSidebar
                  actions={actions}
                  onChat={() => openEboHomesChat('property')}
                />
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Sticky action bar (mobile and tablet). Same decision as the sidebar. */}
      <PropertyActionsBar
        actions={actions}
        onChat={() => openEboHomesChat('property')}
      />

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
