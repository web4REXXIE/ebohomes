'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
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
import { useModal } from '@/lib/use-modal'
import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'
import dynamic from 'next/dynamic'
import Link from 'next/link'
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
import { displayTitle, amenityLabels, toMoney } from '@/lib/property-display'
import { cleanMediaUrls } from '@/lib/property-media'
import { isValidListingId } from '@/lib/listing-id'
import { PropertyVideo } from '@/components/property-video'
import { PropertySectionNav, type SectionNavItem } from '@/components/property-section-nav'
import { PropertyTrust } from '@/components/property-trust'
import { UnitBadge } from '@/components/unit-badge'
import { RemoteInspectionEntry } from '@/components/remote-inspection-entry'
import { identityState } from '@/lib/property-trust'
import { listedByLabel as toListedByLabel } from '@/lib/listing-authority'
import {
  PropertyActionsBar,
  PropertyActionsSidebar,
} from '@/components/property-actions'
import { decidePropertyActions } from '@/lib/property-actions'
import { VerifyPromptModal, type ViewerGate } from '@/components/verify-prompt-modal'
import { tenantVerificationState } from '@/lib/tenant-verification'
import { OPEN_STATUSES as APPLICATION_OPEN_STATUSES } from '@/lib/application-form'
import { OPEN_STATUSES as VIEWING_OPEN_STATUSES } from '@/lib/viewing-status'
import { useListingReserved } from '@/lib/use-listing-reserved'

const ListingLocation = dynamic(
  () =>
    import('@/components/listing-location-public').then((mod) => ({
      default: mod.ListingLocationPublic,
    })),
  {
    ssr: false,
    loading: () => (
      <div
        role="status"
        aria-label="Loading location"
        className="mb-6 animate-pulse rounded-card border border-border bg-card p-card shadow-rest"
      >
        <div className="mb-3 h-5 w-24 rounded bg-secondary" />
        <div className="h-64 w-full rounded-control bg-secondary sm:h-80" />
      </div>
    ),
  }
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

// Reads when the listing was added and last updated. Kept as its own request so the page never
// breaks if a column is missing. Returns null if neither date could be read.
async function loadListingDates(
  listingId: string
): Promise<{ created_at: string | null; updated_at: string | null } | null> {
  const both = await supabase
    .from('listings')
    .select('created_at, updated_at')
    .eq('id', listingId)
    .maybeSingle()

  if (!both.error && both.data) {
    return {
      created_at: (both.data as any).created_at ?? null,
      updated_at: (both.data as any).updated_at ?? null,
    }
  }

  const createdOnly = await supabase
    .from('listings')
    .select('created_at')
    .eq('id', listingId)
    .maybeSingle()

  if (!createdOnly.error && createdOnly.data) {
    return {
      created_at: (createdOnly.data as any).created_at ?? null,
      updated_at: null,
    }
  }

  return null
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
  const reserved = useListingReserved(listing ? String(listing.id) : null)
  const [myApplication, setMyApplication] = useState<{
    id: string
    status: string
  } | null>(null)
  const [myViewing, setMyViewing] = useState<{ status: string } | null>(null)
  const [userId, setUserId] = useState<string | null>(null)

  // Is this viewer a tenant who still needs to verify? null = no gate
  // (verified, not a tenant, signed out, or the check could not be made).
  const [viewerGate, setViewerGate] = useState<ViewerGate | null>(null)
  const [showVerifyPrompt, setShowVerifyPrompt] = useState(false)

  const [showReportModal, setShowReportModal] = useState(false)
  const [notAvailable, setNotAvailable] = useState(false)
  const [pageError, setPageError] = useState('')
  const [shareMessage, setShareMessage] = useState('')
  const [copied, setCopied] = useState(false)
  const [showShareMenu, setShowShareMenu] = useState(false)
  const [canNativeShare, setCanNativeShare] = useState(false)

  // Derived early so gallery handlers and hooks below can use it
  const photos: string[] = cleanMediaUrls(listing?.photos)

  /* ---------------- Verification gate (popup only) ---------------- */

  // This only decides whether Apply opens the popup. The apply page still checks on its own,
  // so if this lookup fails nothing is blocked or opened by mistake.
  useEffect(() => {
    if (!userId) {
      setViewerGate(null)
      return
    }
    let alive = true
    ;(async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('role, id_document_type, id_document_url, selfie_url, verification_status, verified')
        .eq('id', userId)
        .maybeSingle()
      if (!alive || error || !data) return
      if (data.role && data.role !== 'tenant') {
        setViewerGate(null)
        return
      }
      const s = tenantVerificationState(data)
      setViewerGate(s === 'verified' ? null : s)
    })()
    return () => {
      alive = false
    }
  }, [userId])

  /* ---------------- Share ---------------- */

  // Detect native share support (phones) once on the client
  useEffect(() => {
    setCanNativeShare(
      typeof navigator !== 'undefined' && typeof navigator.share === 'function'
    )
  }, [])

  // Share sheet: Escape closes, Tab stays inside, focus returns to the Share button on close
  const shareDialogRef = useRef<HTMLDivElement>(null)
  const shareCloseRef = useRef<HTMLButtonElement>(null)
  const closeShareMenu = useCallback(() => setShowShareMenu(false), [])
  useModal(showShareMenu, closeShareMenu, shareDialogRef, shareCloseRef)

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

      // A mistyped or malformed link is "Listing not found", not a database error.
      if (!id || !isValidListingId(id)) {
        setListing(null)
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

        const listingId: string = data.id
        const landlordId: string | null = data.landlord_id ?? null

        // Everything below only needs the listing id, the landlord id or the signed-in user,
        // so these requests run at the same time instead of one after another.
        const [datesResult, landlordResult, inspectionResult, trustResult, authorityResult, holdResult, authResult] =
          await Promise.all([
            loadListingDates(listingId),
            landlordId
              ? supabase
                  .from('profiles_public')
                  .select('full_name, verified')
                  .eq('id', landlordId)
                  .maybeSingle()
              : Promise.resolve(null),
            supabase
              .from('public_listing_inspections')
              .select(
                'inspected_at, road_condition, road_matches, water_source, water_matches, electricity_notes, electricity_matches, network_notes, network_matches, security_notes, security_matches, neighborhood_type, nearby_landmarks, environment_notes, environment_matches, condition_notes, condition_matches, overall_notes'
              )
              .eq('listing_id', listingId)
              .order('inspected_at', { ascending: false })
              .limit(1)
              .maybeSingle(),
            supabase.rpc('listing_trust', { p_listing: listingId }),
            // Has EboHomes accepted the authority evidence for this property? A yes/no only.
            supabase.rpc('listing_authority_reviewed', { p_listing: listingId }),
            // Is the property on hold? New applications and viewings are blocked in the
            // database while it is. This only lets the page explain it before the tenant types.
            supabase.rpc('listing_on_hold', { p_listing: listingId }),
            supabase.auth.getUser(),
          ])

        if (cancelled) return

        // Date added / updated (null if it could not be read; the page still works)
        if (datesResult) setDates(datesResult)

        // Public landlord profile
        if (landlordResult) {
          if (landlordResult.error) {
            console.error(
              'Failed to load public landlord profile:',
              landlordResult.error.message
            )
          } else {
            setLandlord(landlordResult.data)
          }
        }

        // Physical inspection
        setInspectionFailed(Boolean(inspectionResult.error))
        if (inspectionResult.error) {
          console.error(
            'Failed to load listing inspection:',
            inspectionResult.error.message
          )
        } else {
          setInspection(inspectionResult.data)
        }

        // Trust information
        setTrustFailed(Boolean(trustResult.error))
        if (trustResult.error) {
          console.error(
            'Failed to load listing trust information:',
            trustResult.error.message
          )
        } else {
          setTrust(
            Array.isArray(trustResult.data) ? trustResult.data[0] ?? null : null
          )
        }

        // Authority review (null = could not be loaded)
        if (authorityResult.error) {
          console.error('Failed to load authority review:', authorityResult.error.message)
        } else {
          setAuthorityReviewed(authorityResult.data === true)
        }

        // Hold
        if (holdResult.error) {
          console.error('Failed to check property hold:', holdResult.error.message)
        } else {
          setOnHold(holdResult.data === true)
        }

        // Signed-in user
        if (authResult.error) {
          console.error('Failed to check current user:', authResult.error.message)
        }

        const uid = authResult.data?.user?.id ?? null
        setUserId(uid)

        if (uid && landlordId !== uid) {
          // The tenant's own saved state and open application. Only their own rows are read,
          // so no other tenant's data is involved. The two checks do not depend on each other.
          const [savedState, appResult] = await Promise.all([
            checkSaved(uid, listingId),
            supabase
              .from('applications')
              .select('id, status')
              .eq('listing_id', listingId)
              .eq('tenant_id', uid)
              .in('status', [...APPLICATION_OPEN_STATUSES])
              .order('created_at', { ascending: false })
              .limit(1),
          ])

          if (cancelled) return

          if (savedState === null) {
            setSavedKnown(false)
          } else {
            setSavedKnown(true)
            setSaved(savedState)
          }

          if (appResult.error) {
            console.error('Failed to check your application:', appResult.error.message)
          } else if (appResult.data && appResult.data.length > 0) {
            const app = appResult.data[0] as { id: string; status: string }
            setMyApplication({ id: app.id, status: app.status })

            // The viewing belongs to the application, so it has to wait for it.
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

        <main
          role="status"
          aria-label="Loading property"
          className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:px-8"
        >
          <div className="grid animate-pulse grid-cols-1 gap-8 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <div className="aspect-[4/3] w-full rounded-card bg-secondary sm:aspect-[16/10]" />
              <div className="mt-2 flex gap-2">
                <div className="h-14 w-20 rounded-md bg-secondary" />
                <div className="h-14 w-20 rounded-md bg-secondary" />
                <div className="h-14 w-20 rounded-md bg-secondary" />
              </div>
              <div className="mt-4 h-28 rounded-card bg-secondary" />
              <div className="mt-4 h-40 rounded-card bg-secondary lg:hidden" />
            </div>
            <div className="hidden space-y-4 lg:block">
              <div className="h-56 rounded-card bg-secondary" />
              <div className="h-40 rounded-card bg-secondary" />
            </div>
          </div>
        </main>

        <Footer />
      </div>
    )
  }

  if (pageError && !listing) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header />

        <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-20 text-center">
          <h1 className="mb-2 text-h2 font-bold text-foreground">
            Unable to load property
          </h1>

          <p role="alert" className="mb-6 text-body text-muted-foreground">
            {pageError}
          </p>

          <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button onClick={() => window.location.reload()}>Try again</Button>

            <button
              type="button"
              onClick={() => router.push('/search')}
              className="inline-flex min-h-11 items-center px-3 text-body font-semibold text-primary hover:underline"
            >
              Back to search
            </button>
          </div>
        </main>

        <Footer />
      </div>
    )
  }

  if (!listing || notAvailable) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header />

        <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-20 text-center">
          <h1 className="mb-2 text-h2 font-bold text-foreground">
            {notAvailable
              ? 'This listing is no longer available'
              : 'Listing not found'}
          </h1>

          <p className="mb-6 text-body text-muted-foreground">
            {notAvailable
              ? 'This property is not currently available for applications.'
              : 'We could not find the property you requested. The link may be mistyped or the listing may have been removed.'}
          </p>

          <button
            type="button"
            onClick={() => router.push('/search')}
            className="inline-flex min-h-11 items-center rounded-lg bg-primary px-5 text-body font-semibold text-primary-foreground transition hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            Browse available homes
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
    reserved,
    application: myApplication,
    viewing: myViewing,
  })

  // Jump-to pills: only sections that really have content on this listing.
  const navItems: SectionNavItem[] = [
    ...(cleanedDescription ? [{ id: 'about', label: 'About' }] : []),
    ...(amenityLabels(listing.amenities).length > 0 ? [{ id: 'amenities', label: 'Amenities' }] : []),
    { id: 'trust', label: 'Verification' },
    { id: 'location', label: 'Location' },
  ]

  const rentNumber = toMoney(listing.price_monthly)
  const barPriceText =
    rentNumber !== null && rentNumber > 0 ? `₦${rentNumber.toLocaleString('en-NG')}` : null

  // Opens the verify popup instead of the apply page, only for tenants who still need to verify.
  const onGate = viewerGate ? () => setShowVerifyPrompt(true) : undefined

  /* ---------------- Main render ---------------- */

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      <main className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 lg:px-8 pt-6 pb-[calc(10rem+env(safe-area-inset-bottom))] md:pb-32 lg:py-6">
        <button
          type="button"
          onClick={() => {
            if (typeof window !== 'undefined' && window.history.length > 1) {
              router.back()
            } else {
              router.push('/search')
            }
          }}
          className="mb-2 inline-flex min-h-11 items-center rounded-md pr-3 text-body font-semibold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
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
                className="absolute right-16 top-3 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/95 text-forest shadow-md transition hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50"
              >
                <Heart
                  size={19}
                  className={
                    saved
                      ? 'fill-destructive text-destructive'
                      : 'text-forest'
                  }
                />
              </button>
              )}

              {/* Share property */}
              <button
                type="button"
                onClick={handleShare}
                aria-label="Share property"
                className="absolute right-3 top-3 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/95 text-forest shadow-md transition hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                <Share2 size={18} className="text-forest" />
              </button>
            </div>

            {/* Save feedback: also read out by screen readers */}
            <div
              role="status"
              aria-live="polite"
              className={
                saveMessage
                  ? 'mb-4 flex items-center gap-2 text-caption font-medium text-primary'
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
                className="mb-4 flex items-center gap-2 text-caption font-medium text-primary"
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

            <UnitBadge listingId={String(listing.id)} className="mb-4" />

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

            <PropertySectionNav items={navItems} className="mb-6" />

            <PropertyVideo
              key={String(listing.video_url ?? '')}
              url={listing.video_url}
              title={displayTitle(listing)}
              posterPhoto={photos[0]}
              className="mb-6"
            />

            <div id="about" className="scroll-mt-32">
              <PropertyDescription text={cleanedDescription} className="mb-6" />
            </div>

            <div id="amenities" className="scroll-mt-32">
              <PropertyAmenities amenities={listing.amenities} className="mb-6" />
            </div>

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

            <div id="location" className="scroll-mt-32">
              <ListingLocation
                listingId={listing.id}
                title={displayTitle(listing)}
                address={listing.location_text}
              />
            </div>

            {/* Safety tip */}
            <div className="mt-6 rounded-card border border-warning/25 bg-warning-soft p-card">
              <div className="flex items-start gap-3">
                <ShieldCheck
                  size={20}
                  className="mt-0.5 shrink-0 text-warning"
                />

                <div className="min-w-0">
                  <h2 className="text-body font-extrabold text-warning">
                    Stay safe: never pay outside EboHomes
                  </h2>

                  <ul className="mt-1.5 list-disc space-y-1 pl-4 text-caption leading-relaxed text-warning">
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
            <div className="mt-4 flex flex-col gap-3 rounded-card border border-border bg-card p-card shadow-rest sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <h2 className="text-body font-semibold text-foreground">
                  Something doesn&apos;t look right?
                </h2>

                <p className="text-caption text-muted-foreground">
                  Report fake, wrong or already-rented listings so EboHomes can
                  check them.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowReportModal(true)}
                className="flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-md border border-destructive px-4 text-body font-semibold text-destructive transition-colors hover:bg-destructive hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-destructive"
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

              <div className="rounded-card border border-border bg-card p-card shadow-rest">
                {landlord && (
                  <div className="mb-4 border-b border-border pb-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-foreground">
                        {landlord.full_name?.[0] ?? 'L'}
                      </div>

                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          {listing.landlord_id ? (
                            <Link href={`/landlord/${listing.landlord_id}`} className="hover:underline">
                              {landlord.full_name}
                            </Link>
                          ) : (
                            landlord.full_name
                          )}
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
                  onGate={onGate}
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
        priceText={barPriceText}
        onGate={onGate}
      />

      {/* Verify popup: only opens when an unverified tenant taps Apply */}
      {showVerifyPrompt && viewerGate && (
        <VerifyPromptModal
          gate={viewerGate}
          listingId={String(listing.id)}
          onClose={() => setShowVerifyPrompt(false)}
        />
      )}

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
            ref={shareDialogRef}
            className="max-h-[88dvh] w-full max-w-md overflow-y-auto rounded-t-modal bg-background p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-modal sm:rounded-modal sm:pb-5"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-1 flex items-center justify-between">
              <h2 className="text-base font-bold text-foreground">
                Share this property
              </h2>

              <button
                ref={shareCloseRef}
                type="button"
                onClick={() => setShowShareMenu(false)}
                aria-label="Close share menu"
                className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-secondary focus-visible:outline-2 focus-visible:outline-primary"
              >
                <X size={18} />
              </button>
            </div>

            <p className="mb-4 truncate text-caption text-muted-foreground">
              {listing.title}
            </p>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => openShareLink('whatsapp')}
                className="flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 py-3 text-body font-medium text-foreground transition hover:bg-secondary focus-visible:outline-2 focus-visible:outline-primary"
              >
                <MessageCircle size={18} className="text-emerald-600" />
                WhatsApp
              </button>

              <button
                type="button"
                onClick={() => openShareLink('facebook')}
                className="flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 py-3 text-body font-medium text-foreground transition hover:bg-secondary focus-visible:outline-2 focus-visible:outline-primary"
              >
                <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-blue-600 text-[11px] font-bold leading-none text-white">
                  f
                </span>
                Facebook
              </button>

              <button
                type="button"
                onClick={() => openShareLink('x')}
                className="flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 py-3 text-body font-medium text-foreground transition hover:bg-secondary focus-visible:outline-2 focus-visible:outline-primary"
              >
                <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-black text-[10px] font-bold leading-none text-white">
                  X
                </span>
                X (Twitter)
              </button>

              <button
                type="button"
                onClick={() => openShareLink('telegram')}
                className="flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 py-3 text-body font-medium text-foreground transition hover:bg-secondary focus-visible:outline-2 focus-visible:outline-primary"
              >
                <Send size={18} className="text-sky-500" />
                Telegram
              </button>

              <button
                type="button"
                onClick={handleCopyLink}
                className="flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 py-3 text-body font-medium text-foreground transition hover:bg-secondary focus-visible:outline-2 focus-visible:outline-primary"
              >
                <Copy size={18} />
                Copy link
              </button>

              {canNativeShare && (
                <button
                  type="button"
                  onClick={handleNativeShare}
                  className="flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 py-3 text-body font-medium text-foreground transition hover:bg-secondary focus-visible:outline-2 focus-visible:outline-primary"
                >
                  <Share2 size={18} />
                  More apps
                </button>
              )}
            </div>

            <p className="mt-4 text-caption leading-snug text-muted-foreground">
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
