'use client'
import { supabase } from '@/lib/supabase'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, Upload, MapPin, X, Check, Loader2, Pencil } from 'lucide-react'
import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { Button } from '@/components/ui/button'
import dynamic from 'next/dynamic'
import { computeImageHash, computeVideoHashes } from '@/lib/image-hash'
import { getDeviceId } from '@/lib/device-id'
import { cleanDescription } from '@/lib/clean-description'
import { VerificationModal, useListingVerification } from '@/components/listing-verification-gate'

// Stage 16 Part 2: presentation changes only.
// The listing insert, the Cloudinary and storage uploads, the hashes and the redirect are the same as before.
// New: readable step labels on phones, sticky Back/Continue bar, inline messages instead of browser pop-ups,
// keyboard-reachable upload boxes, and a fuller review step.
// New: an unverified landlord can always tap Next on step 1. A popup then sends them to the verification page.

const LocationPickerModal = dynamic(
  () => import('@/components/location-picker-modal').then((mod) => ({ default: mod.LocationPickerModal })),
  { ssr: false }
)

const PROPERTY_TYPES = [
  'Flat / Apartment',
  'Bungalow',
  'Duplex',
  'Self Contain',
  'Penthouse',
  'Hostel',
  'Office',
  'Shop / Mall',
  'Warehouse',
  'Land / Plot',
  'Event Center',
]

const AMENITIES = [
  { id: 'generator', label: 'Generator' },
  { id: 'water', label: 'Water Supply' },
  { id: 'tiled-floor', label: 'Tiled Floor' },
  { id: 'pop-ceiling', label: 'POP Ceiling' },
  { id: 'parking', label: 'Parking Space' },
  { id: 'security', label: 'Security (24/7)' },
  { id: 'wardrobe', label: 'Wardrobe' },
  { id: 'ac', label: 'Air Conditioning' },
]

const STEPS = ['Property Details', 'Photos', 'Location', 'Pricing', 'Review']

const INPUT =
  'min-h-11 w-full rounded-lg border border-border bg-input px-4 py-3 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary'

const naira = (v: string) => (v ? `₦${Number(v).toLocaleString()}` : '—')

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-semibold text-foreground">{label}</label>
      {children}
      {hint && <p id={`${id}-hint`} className="mt-1.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

// The Back / Continue bar. It stays above the phone's bottom bar so the main action is always in reach.
function StepActions({
  onBack,
  onNext,
  nextLabel,
  nextDisabled,
  missing,
  busy,
  error,
}: {
  onBack?: () => void
  onNext: () => void
  nextLabel: string
  nextDisabled: boolean
  missing: string[]
  busy?: boolean
  error?: string
}) {
  return (
    <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-10 -mx-4 -mb-4 mt-6 space-y-2 border-t border-border bg-card px-4 py-3 sm:-mx-6 sm:-mb-6 sm:px-6 md:bottom-0">
      {error && <p role="alert" className="text-sm font-medium text-destructive">{error}</p>}
      {nextDisabled && missing.length > 0 && !busy && (
        <p className="text-xs text-muted-foreground">To continue, add: {missing.join(', ')}.</p>
      )}
      <div className="flex gap-3">
        {onBack && (
          <Button type="button" variant="outline" onClick={onBack} className="flex-1 py-3 font-semibold">
            Back
          </Button>
        )}
        <Button
          type="button"
          disabled={nextDisabled || busy}
          onClick={onNext}
          className="flex-1 bg-primary py-3 font-semibold text-primary-foreground hover:bg-primary/90"
        >
          {busy ? (
            <>
              <Loader2 size={16} className="animate-spin" aria-hidden /> Please wait...
            </>
          ) : (
            nextLabel
          )}
        </Button>
      </div>
    </div>
  )
}

function ReviewRow({ label, value, strong }: { label: string; value: React.ReactNode; strong?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`break-words text-sm font-semibold ${strong ? 'text-primary' : 'text-foreground'}`}>{value}</dd>
    </div>
  )
}

export default function ListPropertyPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [photos, setPhotos] = useState<string[]>([])
  const [photoHashes, setPhotoHashes] = useState<string[]>([])

  const [formData, setFormData] = useState({
    listingType: 'rent',
    propertyType: '',
    title: '',
    bedrooms: '',
    bathrooms: '',
    toilets: '',
    furnished: 'no',
    description: '',
    amenities: [] as string[],
    monthlyRent: '',
    annualRent: '',
    serviceCharge: '',
    cautionDeposit: '',
    location: '',
    lat: null as number | null,
    lng: null as number | null,
    phoneNumber: '',
    availabilityDate: '',
  })

  const [showMapModal, setShowMapModal] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [photoMessage, setPhotoMessage] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [videoHashes, setVideoHashes] = useState<string[]>([])
  const [videoUploading, setVideoUploading] = useState(false)
  const [videoError, setVideoError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [authChecked, setAuthChecked] = useState(false)

  // Verification: only a verified landlord can move past step 1.
  const { loading: verifLoading, canList, display: verifDisplay } = useListingVerification()
  const [showVerifyModal, setShowVerifyModal] = useState(false)

  const headingRef = useRef<HTMLHeadingElement>(null)
  const firstRender = useRef(true)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data?.user) {
        router.replace('/login')
        return
      }
      setAuthChecked(true)
    })
  }, [router])

  // On each step change, move to the top of the form and put focus on its heading (screen readers announce it).
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    headingRef.current?.focus()
    headingRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [step])

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target
    const files = input.files
    if (!files) return
    setPhotoMessage('')
    setUploading(true)
    const room = 10 - photos.length
    const filesToUpload = Array.from(files).slice(0, room)
    const skipped = files.length - filesToUpload.length
    const uploadedUrls: string[] = []
    const uploadedHashes: string[] = []
    let failed = 0

    for (const file of filesToUpload) {
      try {
        const data = new FormData()
        data.append('file', file)
        data.append('upload_preset', process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET!)
        const res = await fetch(
          `https://api.cloudinary.com/v1_1/${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/image/upload`,
          { method: 'POST', body: data }
        )
        const json = await res.json()
        if (json.secure_url) {
          const hash = await computeImageHash(file)
          uploadedUrls.push(json.secure_url)
          uploadedHashes.push(hash)
        } else {
          failed += 1
        }
      } catch {
        failed += 1
      }
    }

    setPhotos([...photos, ...uploadedUrls])
    setPhotoHashes([...photoHashes, ...uploadedHashes])
    setUploading(false)
    input.value = ''

    const notes: string[] = []
    if (failed > 0) notes.push(`${failed} ${failed === 1 ? 'photo' : 'photos'} could not be uploaded. Check your network and try those again.`)
    if (skipped > 0) notes.push(`You can add up to 10 photos, so ${skipped} ${skipped === 1 ? 'was' : 'were'} left out.`)
    setPhotoMessage(notes.join(' '))
  }

  const removePhoto = (index: number) => {
    setPhotos(photos.filter((_, i) => i !== index))
    setPhotoHashes(photoHashes.filter((_, i) => i !== index))
  }

  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setVideoError('')
    const okTypes = ['video/mp4', 'video/webm', 'video/quicktime']
    if (!okTypes.includes(file.type)) {
      setVideoError('Please upload an MP4, MOV or WEBM video.')
      return
    }
    if (file.size > 50 * 1024 * 1024) {
      setVideoError('Video is too large (max 50MB). Try a shorter clip of 20 to 90 seconds.')
      return
    }
    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) {
      setVideoError('Please log in again.')
      return
    }
    setVideoUploading(true)
    const ext = file.type === 'video/webm' ? 'webm' : file.type === 'video/quicktime' ? 'mov' : 'mp4'
    const path = `${userData.user.id}/${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage
      .from('listing-videos')
      .upload(path, file, { contentType: file.type, upsert: false })
    if (upErr) {
      setVideoError('Video upload failed. Please try again.')
      setVideoUploading(false)
      return
    }
    const { data } = supabase.storage.from('listing-videos').getPublicUrl(path)
    setVideoUrl(data.publicUrl)
    setVideoHashes(await computeVideoHashes(file))
    setVideoUploading(false)
  }

  const handleAmenityToggle = (amenityId: string) => {
    setFormData((prev) => ({
      ...prev,
      amenities: prev.amenities.includes(amenityId)
        ? prev.amenities.filter((a) => a !== amenityId)
        : [...prev.amenities, amenityId],
    }))
  }

  const handleMonthlyRentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const monthly = e.target.value
    setFormData((prev) => ({
      ...prev,
      monthlyRent: monthly,
      annualRent: monthly ? String(Number(monthly) * 12) : '',
    }))
  }

  const canContinueStep1 = formData.propertyType && formData.bedrooms
  const canContinueStep2 = photos.length > 0
  const canContinueStep3 = formData.location
  const canContinueStep4 = formData.monthlyRent && formData.phoneNumber

  // Plain list of what is still needed, for the hint under a disabled Continue button.
  const missing1 = [!formData.propertyType && 'property type', !formData.bedrooms && 'bedrooms'].filter(Boolean) as string[]
  const missing2 = [photos.length === 0 && 'at least one photo'].filter(Boolean) as string[]
  const missing3 = [!formData.location && 'neighbourhood or area'].filter(Boolean) as string[]
  const missing4 = [!formData.monthlyRent && 'monthly rent', !formData.phoneNumber && 'phone number'].filter(Boolean) as string[]

  const handleSubmit = async () => {
    // Safety net: an unverified account never reaches the insert from this screen.
    if (!canList) {
      setShowVerifyModal(true)
      setStep(1)
      return
    }

    setSubmitting(true)
    setSubmitError('')
    const { data: userData } = await supabase.auth.getUser()

    if (!userData?.user) {
      setSubmitError('You must be logged in to submit a listing. Please log in and try again.')
      setSubmitting(false)
      return
    }

    const { data: newListing, error } = await supabase
      .from('listings')
      .insert({
        landlord_id: userData.user.id,
        title: formData.title || `${formData.bedrooms} bed ${formData.propertyType} in ${formData.location}`,
        description: cleanDescription(formData.description),
        listing_type: formData.listingType,
        price_monthly: Number(formData.monthlyRent),
        location_text: formData.location,
        lat: formData.lat,
        lng: formData.lng,
        property_type: formData.propertyType,
        bedrooms: Number(formData.bedrooms),
        bathrooms: formData.bathrooms ? Number(formData.bathrooms) : null,
        toilets: formData.toilets ? Number(formData.toilets) : null,
        furnished: formData.furnished === 'yes',
        amenities: formData.amenities,
        photos: photos,
        photo_hashes: photoHashes.filter((h) => h.length === 16),
        contact_info: formData.phoneNumber,
        availability_date: formData.availabilityDate || null,
        video_url: videoUrl ? videoUrl : null,
        video_hashes: videoHashes,
        device_id: getDeviceId() ? getDeviceId() : null,
        service_charge: formData.serviceCharge ? Number(formData.serviceCharge) : null,
        caution_deposit: formData.cautionDeposit ? Number(formData.cautionDeposit) : null,
        status: 'pending', // critical: must be set for search filtering + admin review queue
      })
      .select('id')
      .single()

    setSubmitting(false)

    if (error) {
      console.error('Listing error:', error)
      setSubmitError('Failed to submit listing: ' + error.message)
      return
    }

    // Step 2 of 2: the lister shows they may list this property (reviewed per property by EboHomes).
    router.push(`/dashboard/authority/${newListing.id}`)
  }

  if (!authChecked) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading...</div>
  }

  const mediaBusy = uploading || videoUploading

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />

      <main className="flex-1">
        <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          <Link href="/dashboard" className="focus-ring mb-4 inline-flex min-h-11 items-center gap-2 font-medium text-primary hover:text-primary/80">
            <ChevronLeft size={20} aria-hidden /> Back to dashboard
          </Link>

          <div className="mb-5">
            <h1 className="mb-1 text-2xl font-bold text-foreground sm:text-3xl">Add New Listing</h1>
            <p className="text-sm text-muted-foreground">Provide accurate details to help tenants find your property.</p>
          </div>

          {/* Step indicator: the name of the current step is always visible, also on small phones. */}
          <nav aria-label="Listing steps" className="mb-6">
            <p className="mb-3 text-sm font-semibold text-foreground sm:hidden">
              Step {step} of {STEPS.length}: {STEPS[step - 1]}
            </p>
            <ol className="flex items-start">
              {STEPS.map((label, i) => {
                const n = i + 1
                const isDone = step > n
                const isCurrent = step === n
                const circle = `flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold ${
                  isDone || isCurrent ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
                }`
                return (
                  <li key={label} className="flex flex-1 items-start last:flex-none" aria-current={isCurrent ? 'step' : undefined}>
                    <div className="flex flex-col items-center">
                      {isDone ? (
                        <button
                          type="button"
                          onClick={() => setStep(n)}
                          aria-label={`Go back to step ${n}: ${label}`}
                          className={`${circle} focus-ring`}
                        >
                          <Check size={16} aria-hidden />
                        </button>
                      ) : (
                        <span className={circle}>
                          {n}
                          <span className="sr-only"> {label}{isCurrent ? ' (current step)' : ''}</span>
                        </span>
                      )}
                      <span className={`mt-1 hidden max-w-[5.5rem] text-center text-xs sm:block ${isCurrent ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
                        {label}
                      </span>
                    </div>
                    {n < STEPS.length && <div className={`mx-1 mt-[1.05rem] h-0.5 flex-1 ${isDone ? 'bg-primary' : 'bg-border'}`} aria-hidden />}
                  </li>
                )
              })}
            </ol>
          </nav>

          {/* STEP 1 — Property Details */}
          {step === 1 && (
            <section className="space-y-4 rounded-card border border-border bg-card p-4 shadow-rest sm:p-6" aria-labelledby="step-heading">
              <h2 id="step-heading" ref={headingRef} tabIndex={-1} className="text-xl font-bold text-foreground outline-none">Property Details</h2>

              <fieldset>
                <legend className="mb-2 block text-sm font-semibold text-foreground">Listing Type *</legend>
                <div className="flex gap-2">
                  {['rent', 'sale'].map((t) => (
                    <button
                      key={t}
                      type="button"
                      aria-pressed={formData.listingType === t}
                      onClick={() => setFormData((p) => ({ ...p, listingType: t }))}
                      className={`focus-ring min-h-11 flex-1 rounded-lg border-2 py-2.5 text-sm font-semibold capitalize transition-colors ${
                        formData.listingType === t ? 'border-primary bg-primary/5 text-primary' : 'border-border text-muted-foreground'
                      }`}
                    >
                      For {t}
                    </button>
                  ))}
                </div>
              </fieldset>

              <Field id="lp-title" label="Property Name / Title" hint="Optional. If you leave it empty, we write one from the bedrooms, type and area.">
                <input
                  id="lp-title"
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData((p) => ({ ...p, title: e.target.value }))}
                  placeholder="e.g. Modern 3 Bedroom Flat in Abakaliki"
                  aria-describedby="lp-title-hint"
                  className={INPUT}
                />
              </Field>

              <Field id="lp-type" label="Property Type *">
                <select
                  id="lp-type"
                  required
                  value={formData.propertyType}
                  onChange={(e) => setFormData((p) => ({ ...p, propertyType: e.target.value }))}
                  className={INPUT}
                >
                  <option value="">Select type</option>
                  {PROPERTY_TYPES.map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </Field>

              <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-3">
                <Field id="lp-beds" label="Bedrooms *">
                  <select
                    id="lp-beds"
                    required
                    value={formData.bedrooms}
                    onChange={(e) => setFormData((p) => ({ ...p, bedrooms: e.target.value }))}
                    className={INPUT}
                  >
                    <option value="">Select</option>
                    {[1, 2, 3, 4, 5, 6, 7].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </Field>
                <Field id="lp-baths" label="Bathrooms">
                  <select
                    id="lp-baths"
                    value={formData.bathrooms}
                    onChange={(e) => setFormData((p) => ({ ...p, bathrooms: e.target.value }))}
                    className={INPUT}
                  >
                    <option value="">Select</option>
                    {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </Field>
                <Field id="lp-toilets" label="Toilets">
                  <select
                    id="lp-toilets"
                    value={formData.toilets}
                    onChange={(e) => setFormData((p) => ({ ...p, toilets: e.target.value }))}
                    className={INPUT}
                  >
                    <option value="">Select</option>
                    {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </Field>
              </div>

              <fieldset>
                <legend className="mb-2 block text-sm font-semibold text-foreground">Furnished?</legend>
                <div className="flex gap-2">
                  {['yes', 'no'].map((v) => (
                    <button
                      key={v}
                      type="button"
                      aria-pressed={formData.furnished === v}
                      onClick={() => setFormData((p) => ({ ...p, furnished: v }))}
                      className={`focus-ring min-h-11 flex-1 rounded-lg border-2 py-2.5 text-sm font-semibold capitalize transition-colors ${
                        formData.furnished === v ? 'border-primary bg-primary/5 text-primary' : 'border-border text-muted-foreground'
                      }`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </fieldset>

              <Field id="lp-desc" label="Description" hint="Size, condition, nearby landmarks and anything special.">
                <textarea
                  id="lp-desc"
                  value={formData.description}
                  onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))}
                  placeholder="Describe the property — size, condition, nearby landmarks, special features..."
                  rows={4}
                  aria-describedby="lp-desc-hint"
                  className={`${INPUT} resize-none`}
                />
              </Field>

              <fieldset>
                <legend className="mb-3 block text-sm font-semibold text-foreground">Facilities &amp; Features</legend>
                <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 sm:grid-cols-3">
                  {AMENITIES.map((amenity) => (
                    <label key={amenity.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-border px-3">
                      <input
                        type="checkbox"
                        checked={formData.amenities.includes(amenity.id)}
                        onChange={() => handleAmenityToggle(amenity.id)}
                        className="h-5 w-5 shrink-0 rounded border-border accent-primary"
                      />
                      <span className="text-sm font-medium text-foreground">{amenity.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              {/* Unverified landlords can always tap Next. The popup then explains and links to verification. */}
              <StepActions
                onNext={() => {
                  if (verifLoading) return
                  if (!canList) {
                    setShowVerifyModal(true)
                    return
                  }
                  setStep(2)
                }}
                nextLabel="Next: Photos →"
                nextDisabled={canList ? !canContinueStep1 : false}
                missing={missing1}
              />
            </section>
          )}

          {/* STEP 2 — Photos */}
          {step === 2 && (
            <section className="rounded-card border border-border bg-card p-4 shadow-rest sm:p-6" aria-labelledby="step-heading">
              <h2 id="step-heading" ref={headingRef} tabIndex={-1} className="mb-1 text-xl font-bold text-foreground outline-none">Property Photos (up to 10)</h2>
              <p className="mb-4 text-sm text-muted-foreground">The first photo is the cover photo. Use clear, bright photos of the real property.</p>

              {photos.length < 10 && (
                <label
                  htmlFor="lp-photos"
                  className="mb-4 block min-h-14 cursor-pointer rounded-lg border-2 border-dashed border-border p-6 text-center transition-colors hover:bg-secondary focus-within:ring-2 focus-within:ring-primary"
                >
                  <Upload size={32} className="mx-auto mb-2 text-muted-foreground" aria-hidden />
                  <p className="font-semibold text-foreground">Tap to upload photos</p>
                  <p className="text-sm text-muted-foreground">You can pick several at once</p>
                  {uploading && (
                    <p role="status" className="mt-2 flex items-center justify-center gap-2 text-sm text-primary">
                      <Loader2 size={14} className="animate-spin" aria-hidden /> Uploading photos...
                    </p>
                  )}
                  <input
                    id="lp-photos"
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={handlePhotoUpload}
                    disabled={uploading}
                    className="sr-only"
                  />
                </label>
              )}

              {photoMessage && <p role="alert" className="mb-4 text-sm font-medium text-destructive">{photoMessage}</p>}

              {photos.length > 0 && (
                <ul className="mb-4 grid grid-cols-3 gap-3 sm:grid-cols-4 sm:gap-4">
                  {photos.map((photo, index) => (
                    <li key={photo + index} className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photo} alt={`Photo ${index + 1}${index === 0 ? ' (cover)' : ''}`} className="h-24 w-full rounded-lg object-cover" />
                      {index === 0 && (
                        <span className="absolute bottom-1 left-1 rounded bg-forest px-1.5 py-0.5 text-xs font-semibold text-white">Cover</span>
                      )}
                      <button
                        type="button"
                        onClick={() => removePhoto(index)}
                        aria-label={`Remove photo ${index + 1}`}
                        className="focus-ring absolute -right-2 -top-2 flex h-8 w-8 items-center justify-center rounded-full bg-destructive text-white shadow"
                      >
                        <X size={14} aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <p className="mb-6 text-sm text-muted-foreground">{photos.length}/10 photos uploaded</p>

              <div className="mb-2">
                <h3 className="mb-1 text-base font-bold text-foreground">Walkthrough Video (optional)</h3>
                <p className="mb-3 text-sm text-muted-foreground">
                  Show the real property in one go, 20 to 90 seconds. No heavy editing, please. Max 50MB.
                </p>
                {videoUrl ? (
                  <div>
                    <video src={videoUrl} controls className="max-h-64 w-full rounded-lg bg-black" />
                    <button
                      type="button"
                      onClick={() => {
                        setVideoUrl('')
                        setVideoHashes([])
                      }}
                      className="focus-ring mt-2 min-h-11 text-sm font-semibold text-destructive"
                    >
                      Remove video
                    </button>
                  </div>
                ) : (
                  <label
                    htmlFor="lp-video"
                    className="block min-h-14 cursor-pointer rounded-lg border-2 border-dashed border-border p-6 text-center transition-colors hover:bg-secondary focus-within:ring-2 focus-within:ring-primary"
                  >
                    <Upload size={28} className="mx-auto mb-2 text-muted-foreground" aria-hidden />
                    <p className="font-semibold text-foreground">Add Property Walkthrough Video</p>
                    {videoUploading && (
                      <p role="status" className="mt-2 flex items-center justify-center gap-2 text-sm text-primary">
                        <Loader2 size={14} className="animate-spin" aria-hidden /> Uploading video... please wait
                      </p>
                    )}
                    <input
                      id="lp-video"
                      type="file"
                      accept="video/mp4,video/quicktime,video/webm"
                      onChange={handleVideoUpload}
                      disabled={videoUploading}
                      className="sr-only"
                    />
                  </label>
                )}
                {videoError && <p role="alert" className="mt-2 text-sm font-medium text-destructive">{videoError}</p>}
              </div>

              <StepActions
                onBack={() => setStep(1)}
                onNext={() => setStep(3)}
                nextLabel="Next: Location →"
                nextDisabled={!canContinueStep2 || mediaBusy}
                missing={missing2}
                busy={mediaBusy}
              />
            </section>
          )}

          {/* STEP 3 — Location */}
          {step === 3 && (
            <section className="space-y-4 rounded-card border border-border bg-card p-4 shadow-rest sm:p-6" aria-labelledby="step-heading">
              <h2 id="step-heading" ref={headingRef} tabIndex={-1} className="text-xl font-bold text-foreground outline-none">Location</h2>

              <Field id="lp-location" label="Neighborhood/Area *">
                <input
                  id="lp-location"
                  type="text"
                  required
                  value={formData.location}
                  onChange={(e) => setFormData((p) => ({ ...p, location: e.target.value }))}
                  placeholder="e.g., Abakaliki GRA"
                  className={INPUT}
                />
              </Field>

              <div>
                <button
                  type="button"
                  onClick={() => setShowMapModal(true)}
                  className="focus-ring flex min-h-14 w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border p-4 font-medium text-primary transition-colors hover:bg-secondary"
                >
                  <MapPin size={20} aria-hidden />
                  {formData.lat ? 'Pin dropped — tap to change' : 'Drop a pin on map'}
                </button>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {formData.lat != null && formData.lng != null ? 'A map pin is saved for this listing.' : 'Optional. Drop a pin to mark the exact spot.'}
                </p>
              </div>

              <StepActions
                onBack={() => setStep(2)}
                onNext={() => setStep(4)}
                nextLabel="Next: Pricing →"
                nextDisabled={!canContinueStep3}
                missing={missing3}
              />
            </section>
          )}

          {/* STEP 4 — Pricing */}
          {step === 4 && (
            <section className="space-y-4 rounded-card border border-border bg-card p-4 shadow-rest sm:p-6" aria-labelledby="step-heading">
              <h2 id="step-heading" ref={headingRef} tabIndex={-1} className="text-xl font-bold text-foreground outline-none">Pricing &amp; Contact</h2>

              <Field id="lp-rent" label="Monthly Rent (₦) *">
                <input
                  id="lp-rent"
                  type="number"
                  inputMode="numeric"
                  min="0"
                  required
                  value={formData.monthlyRent}
                  onChange={handleMonthlyRentChange}
                  placeholder="e.g., 150000"
                  className={INPUT}
                />
              </Field>

              <Field id="lp-annual" label="Annual Rent (₦)" hint="Worked out for you: monthly rent × 12.">
                <input
                  id="lp-annual"
                  type="number"
                  value={formData.annualRent}
                  onChange={(e) => setFormData((p) => ({ ...p, annualRent: e.target.value }))}
                  readOnly
                  placeholder="Auto-calculated as monthly × 12"
                  aria-describedby="lp-annual-hint"
                  className={INPUT}
                />
              </Field>

              <Field id="lp-phone" label="Phone Number (Nigerian) *">
                <input
                  id="lp-phone"
                  type="tel"
                  required
                  value={formData.phoneNumber}
                  onChange={(e) => setFormData((p) => ({ ...p, phoneNumber: e.target.value }))}
                  placeholder="+234 801 234 5678"
                  className={INPUT}
                />
              </Field>

              <Field id="lp-service" label="Service Charge (₦, optional)">
                <input
                  id="lp-service"
                  type="number"
                  inputMode="numeric"
                  min="0"
                  value={formData.serviceCharge}
                  onChange={(e) => setFormData((p) => ({ ...p, serviceCharge: e.target.value }))}
                  placeholder="e.g., 20000"
                  className={INPUT}
                />
              </Field>

              <Field id="lp-caution" label="Caution / Deposit (₦, optional)">
                <input
                  id="lp-caution"
                  type="number"
                  inputMode="numeric"
                  min="0"
                  value={formData.cautionDeposit}
                  onChange={(e) => setFormData((p) => ({ ...p, cautionDeposit: e.target.value }))}
                  placeholder="e.g., 50000"
                  className={INPUT}
                />
              </Field>

              <Field id="lp-available" label="Availability Date">
                <input
                  id="lp-available"
                  type="date"
                  value={formData.availabilityDate}
                  onChange={(e) => setFormData((p) => ({ ...p, availabilityDate: e.target.value }))}
                  className={INPUT}
                />
              </Field>

              <StepActions
                onBack={() => setStep(3)}
                onNext={() => setStep(5)}
                nextLabel="Next: Review →"
                nextDisabled={!canContinueStep4}
                missing={missing4}
              />
            </section>
          )}

          {/* STEP 5 — Review */}
          {step === 5 && (
            <section className="space-y-4 rounded-card border border-border bg-card p-4 shadow-rest sm:p-6" aria-labelledby="step-heading">
              <h2 id="step-heading" ref={headingRef} tabIndex={-1} className="text-xl font-bold text-foreground outline-none">Review &amp; Submit</h2>
              <p className="text-sm text-muted-foreground">Check everything below. Use Edit to fix a section. Nothing is sent until you press Submit Listing.</p>

              {photos[0] && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photos[0]} alt="Cover" className="h-48 w-full rounded-lg object-cover" />
              )}

              {([
                {
                  title: 'Property',
                  edit: 1,
                  rows: [
                    ['Title', formData.title || '—'],
                    ['Listing type', formData.listingType === 'sale' ? 'For sale' : 'For rent'],
                    ['Type', formData.propertyType],
                    ['Bedrooms', formData.bedrooms],
                    ['Bathrooms', formData.bathrooms || '—'],
                    ['Toilets', formData.toilets || '—'],
                    ['Furnished', formData.furnished === 'yes' ? 'Yes' : 'No'],
                    [
                      'Facilities',
                      formData.amenities.length
                        ? formData.amenities.map((id) => AMENITIES.find((a) => a.id === id)?.label ?? id).join(', ')
                        : '—',
                    ],
                  ],
                },
                {
                  title: 'Photos and video',
                  edit: 2,
                  rows: [
                    ['Photos', `${photos.length} uploaded`],
                    ['Walkthrough video', videoUrl ? 'Added' : 'Not added'],
                  ],
                },
                {
                  title: 'Location',
                  edit: 3,
                  rows: [
                    ['Area', formData.location],
                    ['Map pin', formData.lat != null && formData.lng != null ? 'Saved' : 'Not added'],
                  ],
                },
                {
                  title: 'Pricing and contact',
                  edit: 4,
                  rows: [
                    ['Monthly rent', naira(formData.monthlyRent)],
                    ['Annual rent', naira(formData.annualRent)],
                    ['Service charge', naira(formData.serviceCharge)],
                    ['Caution / deposit', naira(formData.cautionDeposit)],
                    ['Phone', formData.phoneNumber],
                    ['Available from', formData.availabilityDate || '—'],
                  ],
                },
              ] as { title: string; edit: number; rows: [string, string][] }[]).map((section) => (
                <div key={section.title} className="rounded-lg border border-border p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h3 className="text-sm font-bold text-foreground">{section.title}</h3>
                    <button
                      type="button"
                      onClick={() => setStep(section.edit)}
                      className="focus-ring inline-flex min-h-11 items-center gap-1 px-2 text-sm font-semibold text-primary"
                    >
                      <Pencil size={14} aria-hidden /> Edit<span className="sr-only"> {section.title}</span>
                    </button>
                  </div>
                  <dl className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
                    {section.rows.map(([label, value]) => (
                      <ReviewRow key={label} label={label} value={value} strong={label === 'Monthly rent'} />
                    ))}
                  </dl>
                </div>
              ))}

              {formData.description.trim() && (
                <div className="rounded-lg border border-border p-3">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <h3 className="text-sm font-bold text-foreground">Description</h3>
                    <button type="button" onClick={() => setStep(1)} className="focus-ring inline-flex min-h-11 items-center gap-1 px-2 text-sm font-semibold text-primary">
                      <Pencil size={14} aria-hidden /> Edit<span className="sr-only"> description</span>
                    </button>
                  </div>
                  <p className="whitespace-pre-line break-words text-sm text-foreground">{formData.description}</p>
                </div>
              )}

              <div className="rounded-lg border border-border bg-secondary p-4">
                <p className="text-center text-sm text-foreground">
                  Your listing is <span className="font-semibold">free</span>. Next, you will show that you may list this property. EboHomes reviews it before it goes live.
                </p>
              </div>

              <StepActions
                onBack={() => setStep(4)}
                onNext={handleSubmit}
                nextLabel="Submit Listing"
                nextDisabled={false}
                missing={[]}
                busy={submitting}
                error={submitError}
              />
            </section>
          )}
        </div>
      </main>

      <Footer />

      {/* Verification popup for unverified landlords */}
      {showVerifyModal && verifDisplay && !canList && (
        <VerificationModal display={verifDisplay} onClose={() => setShowVerifyModal(false)} />
      )}

      {/* Map Modal */}
      {showMapModal && (
        <LocationPickerModal
          initial={
            formData.lat != null && formData.lng != null
              ? { lat: formData.lat, lng: formData.lng }
              : null
          }
          onClose={() => setShowMapModal(false)}
          onConfirm={(lat, lng) => {
            setFormData((p) => ({ ...p, lat, lng }))
            setShowMapModal(false)
          }}
        />
      )}
    </div>
  )
                    }
