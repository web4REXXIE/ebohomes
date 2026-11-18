'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useParams, useRouter } from 'next/navigation'
import { Flag, Heart, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { PropertyGallery } from '@/components/property-gallery'
import { PropertyVideo } from '@/components/property-video'
import {
  PropertyAmenities,
  PropertyDescription,
  PropertyHeader,
  PropertyKeyFacts,
  PropertyLocationFallback,
  PropertyRentCard,
} from '@/components/property-details'
import { PropertyTrust } from '@/components/property-trust'
import { ListingTerms } from '@/components/listing-terms'
import { PropertySectionNav } from '@/components/property-section-nav'
import { PropertyActionsBar, PropertyActionsSidebar } from '@/components/property-actions'
import { RemoteInspectionEntry } from '@/components/remote-inspection-entry'
import { ListingLocationPublic } from '@/components/listing-location-public'
import { VerifyPromptModal, type ViewerGate } from '@/components/verify-prompt-modal'
import { decidePropertyActions } from '@/lib/property-actions'
import { displayTitle, toMoney } from '@/lib/property-display'
import { listedByLabel } from '@/lib/listing-authority'
import { isValidListingId } from '@/lib/listing-id'
import { tenantVerificationState } from '@/lib/tenant-verification'

const ReportListingModal = dynamic(
  () => import('@/components/report-listing-modal').then((m) => ({ default: m.ReportListingModal })),
  { ssr: false },
)

// The public property details page. Anyone can read it. Only approved listings are shown.
// Everything here is read only except Save and Report. Apply and Viewing open the tenant's own application.
// Exact map pins are never read here: ListingLocationPublic decides what each viewer may see.

const OPEN_APPLICATION = ['pending', 'info_requested', 'approved']

type Listing = {
  id: string
  landlord_id: string | null
  title: string | null
  description: string | null
  location_text: string | null
  price_monthly: number | null
  service_charge: number | null
  caution_deposit: number | null
  property_type: string | null
  bedrooms: number | null
  bathrooms: number | null
  amenities: unknown
  photos: unknown
  video_url: string | null
  availability_date: string | null
  status: string | null
  listed_by_role: string | null
  created_at: string | null
  duration_months: number | null
  notice_days: number | null
  payment_schedule: string | null
  house_rules: string | null
  properties?: { public_id?: string | null } | { public_id?: string | null }[] | null
}

const COLUMNS =
  'id, landlord_id, title, description, location_text, price_monthly, service_charge, caution_deposit, property_type, bedrooms, bathrooms, amenities, photos, video_url, availability_date, status, listed_by_role, created_at, duration_months, notice_days, payment_schedule, house_rules, properties(public_id)'

function addedOn(iso: string | null): string | undefined {
  if (!iso) return undefined
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? undefined : d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function ListingDetailPage() {
  const router = useRouter()
  const params = useParams()
  const id = String(params?.id ?? '')

  const [state, setState] = useState<'loading' | 'ok' | 'error' | 'notfound'>('loading')
  const [listing, setListing] = useState<Listing | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [onHold, setOnHold] = useState(false)
  const [reserved, setReserved] = useState(false)
  const [application, setApplication] = useState<{ id: string; status: string } | null>(null)
  const [viewing, setViewing] = useState<{ status: string } | null>(null)
  const [trust, setTrust] = useState<unknown>(null)
  const [trustFailed, setTrustFailed] = useState(false)
  const [authority, setAuthority] = useState<boolean | null>(null)
  const [inspection, setInspection] = useState<unknown>(null)
  const [inspectionFailed, setInspectionFailed] = useState(false)
  const [gate, setGate] = useState<ViewerGate | null>(null)
  const [showGate, setShowGate] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [reporting, setReporting] = useState(false)

  const load = useCallback(async () => {
    if (!isValidListingId(id)) {
      setState('notfound')
      return
    }
    const { data, error } = await supabase.from('listings').select(COLUMNS).eq('id', id).maybeSingle()
    if (error) {
      console.error('Listing load failed:', error.code, error.message)
      setState('error')
      return
    }
    // The page itself refuses to show anything that is not approved.
    if (!data || data.status !== 'approved') {
      setListing((data as Listing | null) ?? null)
      setState('notfound')
      return
    }
    const l = data as unknown as Listing
    setListing(l)
    setState('ok')

    const { data: auth } = await supabase.auth.getUser()
    const uid = auth?.user?.id ?? null
    setUserId(uid)

    const [hold, res, auth2, insp, tr] = await Promise.all([
      supabase.rpc('listing_on_hold', { p_listing: id }),
      supabase.rpc('listing_reserved', { p_listing: id }),
      supabase.rpc('listing_authority_reviewed', { p_listing: id }),
      supabase.from('public_listing_inspections').select('*').eq('listing_id', id).maybeSingle(),
      l.landlord_id ? supabase.from('landlord_trust').select('*').eq('landlord_id', l.landlord_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    ])
    setOnHold(hold.data === true)
    setReserved(res.data === true)
    setAuthority(auth2.error ? null : auth2.data === true)
    setInspection(insp.error ? null : insp.data ?? null)
    setInspectionFailed(!!insp.error)
    setTrust(tr.error ? null : tr.data ?? null)
    setTrustFailed(!!tr.error)

    if (!uid) return

    // The tenant's own open application and viewing for this property, if any.
    const { data: apps } = await supabase
      .from('applications')
      .select('id, status')
      .eq('listing_id', id)
      .eq('tenant_id', uid)
      .in('status', OPEN_APPLICATION)
      .order('created_at', { ascending: false })
      .limit(1)
    const app = (apps ?? [])[0] ?? null
    setApplication(app)
    if (app) {
      const { data: vws } = await supabase
        .from('viewings')
        .select('status')
        .eq('application_id', app.id)
        .order('created_at', { ascending: false })
        .limit(1)
      setViewing((vws ?? [])[0] ?? null)
    } else setViewing(null)

    const [{ data: profile }, { data: sv }] = await Promise.all([
      supabase.from('profiles').select('role, id_document_type, id_document_url, selfie_url, verification_status, verified').eq('id', uid).maybeSingle(),
      supabase.from('saved_properties').select('listing_id').eq('tenant_id', uid).eq('listing_id', id).maybeSingle(),
    ])
    setSaved(!!sv)
    if (profile?.role === 'tenant') {
      const s = tenantVerificationState(profile)
      setGate(s === 'verified' ? null : (s as ViewerGate))
    } else setGate(null)
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  const isOwner = !!userId && !!listing && listing.landlord_id === userId
  const actions = useMemo(
    () =>
      decidePropertyActions({
        listingId: id,
        listingStatus: listing?.status,
        signedIn: !!userId,
        isOwner,
        onHold,
        reserved,
        application,
        viewing,
      }),
    [id, listing?.status, userId, isOwner, onHold, reserved, application, viewing],
  )

  const toggleSave = async () => {
    if (!userId) {
      router.push(`/login?redirect=${encodeURIComponent(`/listing/${id}`)}`)
      return
    }
    if (saving) return
    setSaving(true)
    const { error } = saved
      ? await supabase.from('saved_properties').delete().eq('tenant_id', userId).eq('listing_id', id)
      : await supabase.from('saved_properties').insert({ tenant_id: userId, listing_id: id })
    if (!error) setSaved(!saved)
    setSaving(false)
  }

  const onChat = () => {
    if (!userId) {
      router.push(`/login?redirect=${encodeURIComponent(`/listing/${id}`)}`)
      return
    }
    const subject = encodeURIComponent(`Question about ${listing ? displayTitle(listing) : 'a property'}`)
    router.push(`/messages?new=1&category=property&listing=${id}&subject=${subject}`)
  }

  const onGate = gate ? () => setShowGate(true) : undefined

  if (state === 'loading') {
    return (
      <>
        <Header />
        <div className="flex min-h-[60vh] items-center justify-center" role="status" aria-label="Loading property">
          <Loader2 className="animate-spin text-primary" size={28} aria-hidden />
        </div>
        <Footer />
      </>
    )
  }

  if (state !== 'ok' || !listing) {
    const failed = state === 'error'
    return (
      <>
        <Header />
        <main className="mx-auto w-full max-w-xl space-y-3 px-4 py-16 text-center">
          <h1 className="text-xl font-bold text-foreground">{failed ? 'We could not load this property' : 'This property is not available'}</h1>
          <p className="text-sm text-muted-foreground">
            {failed
              ? 'This is usually temporary. Please try again.'
              : 'It may have been removed, rented, or is not open to the public right now.'}
          </p>
          <div className="flex justify-center gap-2">
            {failed && (
              <button
                type="button"
                onClick={() => {
                  setState('loading')
                  void load()
                }}
                className="inline-flex min-h-11 items-center rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground"
              >
                Try again
              </button>
            )}
            <Link href="/search" className="inline-flex min-h-11 items-center rounded-lg border border-border bg-card px-4 text-sm font-semibold text-foreground">
              Browse properties
            </Link>
          </div>
        </main>
        <Footer />
      </>
    )
  }

  const title = displayTitle(listing)
  const props = Array.isArray(listing.properties) ? listing.properties[0] : listing.properties
  const rent = toMoney(listing.price_monthly)
  const hasTerms =
    listing.duration_months != null || listing.notice_days != null || !!listing.payment_schedule?.trim() || !!listing.house_rules?.trim()

  const sections = [
    { id: 'about', label: 'About' },
    { id: 'trust', label: 'Verification' },
    { id: 'location', label: 'Location' },
  ]

  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-6xl px-4 pb-40 pt-4 lg:pb-12">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0 space-y-5">
            <PropertyGallery images={Array.isArray(listing.photos) ? (listing.photos as string[]) : []} title={title} />

            <PropertyHeader
              title={title}
              location={listing.location_text}
              publicId={props?.public_id ?? null}
              listedByLabel={listedByLabel(listing.listed_by_role)}
              addedText={addedOn(listing.created_at)}
            />

            <PropertySectionNav items={sections} />

            <section id="about" className="scroll-mt-28 space-y-5">
              <PropertyKeyFacts
                propertyType={listing.property_type}
                bedrooms={listing.bedrooms}
                bathrooms={listing.bathrooms}
                availabilityDate={listing.availability_date}
              />
              <PropertyRentCard priceMonthly={listing.price_monthly} serviceCharge={listing.service_charge} cautionDeposit={listing.caution_deposit} />
              {hasTerms && (
                <ListingTerms
                  durationMonths={listing.duration_months}
                  noticeDays={listing.notice_days}
                  paymentSchedule={listing.payment_schedule}
                  houseRules={listing.house_rules}
                />
              )}
              <PropertyDescription text={listing.description ?? ''} />
              <PropertyAmenities amenities={listing.amenities} />
              <PropertyVideo key={listing.video_url ?? 'none'} url={listing.video_url} title={title} posterPhoto={Array.isArray(listing.photos) ? ((listing.photos as string[])[0] ?? null) : null} />
            </section>

            <PropertyTrust
              trust={trust}
              trustFailed={trustFailed}
              authorityReviewed={authority}
              authorityFailed={authority === null}
              inspection={inspection}
              inspectionFailed={inspectionFailed}
            />

            <RemoteInspectionEntry listingId={listing.id} listingStatus={listing.status} userId={userId} isOwner={isOwner} onHold={onHold} />

            <section id="location" className="scroll-mt-28">
              <ListingLocationPublic listingId={listing.id} title={title} address={listing.location_text} />
              {!listing.location_text && <PropertyLocationFallback address={listing.location_text} />}
            </section>

            <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4 text-sm">
              {actions.canSave && (
                <button
                  type="button"
                  onClick={toggleSave}
                  disabled={saving}
                  aria-pressed={saved}
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-card px-4 font-semibold text-foreground hover:bg-secondary disabled:opacity-50"
                >
                  <Heart size={16} className={saved ? 'fill-current text-destructive' : ''} aria-hidden />
                  {saved ? 'Saved' : 'Save property'}
                </button>
              )}
              {!isOwner && (
                <button
                  type="button"
                  onClick={() => (userId ? setReporting(true) : router.push(`/login?redirect=${encodeURIComponent(`/listing/${id}`)}`))}
                  className="inline-flex min-h-11 items-center gap-2 px-2 text-muted-foreground underline hover:text-destructive"
                >
                  <Flag size={14} aria-hidden /> Report this listing
                </button>
              )}
              {isOwner && (
                <Link href={`/dashboard/edit/${listing.id}`} className="inline-flex min-h-11 items-center rounded-lg border border-border bg-card px-4 font-semibold text-foreground hover:bg-secondary">
                  Edit this listing
                </Link>
              )}
            </div>
          </div>

          <aside className="hidden lg:block">
            <div className="sticky top-24 space-y-4">
              <div className="rounded-card border border-border bg-card p-card shadow-rest">
                {rent !== null && (
                  <p className="mb-3 text-h3 font-bold text-foreground">
                    ₦{rent.toLocaleString('en-NG')}
                    <span className="text-caption font-normal text-muted-foreground"> per month</span>
                  </p>
                )}
                <PropertyActionsSidebar actions={actions} onChat={onChat} onGate={onGate} />
              </div>
            </div>
          </aside>
        </div>

      </main>

      <PropertyActionsBar actions={actions} onChat={onChat} priceText={rent !== null ? `₦${rent.toLocaleString('en-NG')}` : null} onGate={onGate} />

      {showGate && gate && <VerifyPromptModal gate={gate} listingId={listing.id} onClose={() => setShowGate(false)} />}
      {reporting && <ReportListingModal listingId={listing.id} onClose={() => setReporting(false)} />}
      <Footer />
    </>
  )
}
