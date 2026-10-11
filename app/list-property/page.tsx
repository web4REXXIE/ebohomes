'use client'
import { supabase } from '@/lib/supabase'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, Upload, Check, MapPin, X } from 'lucide-react'
import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { Button } from '@/components/ui/button'
import dynamic from 'next/dynamic'
import {
  OWNERSHIP_BUCKET,
  OWNERSHIP_ACCEPT,
  validateOwnershipFile,
  buildOwnershipPath,
  isValidOwnershipPath,
} from '@/lib/ownership-docs'

const MapPlaceholder = dynamic(
  () => import('@/components/map-placeholder').then((mod) => ({ default: mod.MapPlaceholder })),
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

export default function ListPropertyPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [submitted, setSubmitted] = useState(false)
  const [photos, setPhotos] = useState<string[]>([])

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
  const [ownershipDoc, setOwnershipDoc] = useState('')
  const [docUploading, setDocUploading] = useState(false)
  const [docName, setDocName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [authChecked, setAuthChecked] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data?.user) {
        router.replace('/login')
        return
      }
      setAuthChecked(true)
    })
  }, [router])

  const handleDocUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target
    const file = input.files?.[0]
    if (!file) return

    const err = validateOwnershipFile(file)
    if (err) {
      alert(err)
      input.value = ''
      return
    }

    setDocUploading(true)
    const { data: userData } = await supabase.auth.getUser()
    const user = userData?.user
    if (!user) {
      alert('You must be logged in.')
      setDocUploading(false)
      router.replace('/login')
      return
    }

    const filePath = buildOwnershipPath(user.id, 'listing', file)
    const { error: uploadError } = await supabase.storage
      .from(OWNERSHIP_BUCKET)
      .upload(filePath, file, { contentType: file.type, upsert: false })

    if (uploadError) {
      alert('Failed to upload document: ' + uploadError.message)
      setDocUploading(false)
      input.value = ''
      return
    }

    setOwnershipDoc(filePath) // path only
    setDocName(file.name)
    setDocUploading(false)
    input.value = ''
  }

  const removeDoc = () => {
    setOwnershipDoc('')
    setDocName('')
  }

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    setUploading(true)
    const filesToUpload = Array.from(files).slice(0, 10 - photos.length)
    const uploadedUrls: string[] = []

    for (const file of filesToUpload) {
      const data = new FormData()
      data.append('file', file)
      data.append('upload_preset', process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET!)
      const res = await fetch(
        `https://api.cloudinary.com/v1_1/${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/image/upload`,
        { method: 'POST', body: data }
      )
      const json = await res.json()
      if (json.secure_url) uploadedUrls.push(json.secure_url)
    }

    setPhotos([...photos, ...uploadedUrls])
    setUploading(false)
  }

  const removePhoto = (index: number) => setPhotos(photos.filter((_, i) => i !== index))

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

  const handleSubmit = async () => {
    setSubmitting(true)
    const { data: userData } = await supabase.auth.getUser()

    if (!userData?.user) {
      alert('You must be logged in to submit a listing. Please log in and try again.')
      setSubmitting(false)
      return
    }

    if (ownershipDoc && !isValidOwnershipPath(ownershipDoc, userData.user.id)) {
      alert('Invalid ownership document. Please remove it and upload again.')
      setSubmitting(false)
      return
    }

    const { error } = await supabase.from('listings').insert({
      landlord_id: userData.user.id,
      title: formData.title || `${formData.bedrooms} bed ${formData.propertyType} in ${formData.location}`,
      description: formData.description,
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
      ownership_doc_url: ownershipDoc || null,
      contact_info: formData.phoneNumber,
      availability_date: formData.availabilityDate || null,
      service_charge: formData.serviceCharge ? Number(formData.serviceCharge) : null,
      caution_deposit: formData.cautionDeposit ? Number(formData.cautionDeposit) : null,
      status: 'pending', // critical: must be set for search filtering + admin review queue
    })

    setSubmitting(false)

    if (error) {
      console.error('Listing error:', error)
      alert('Failed to submit listing: ' + error.message)
      return
    }

    setSubmitted(true)
  }

  if (!authChecked) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header />
        <main className="flex-1 flex items-center justify-center px-4 py-8">
          <div className="max-w-md w-full bg-card border border-border rounded-lg p-8 text-center card-shadow">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <Check size={32} className="text-primary" />
            </div>
            <h1 className="text-3xl font-bold text-foreground mb-2">Listing Submitted!</h1>
            <p className="text-foreground mb-2">We've received your listing.</p>
            <p className="text-muted-foreground mb-8">
              Our team will review it and publish it within 24 hours. You'll receive a confirmation once it's live.
            </p>
            <Link href="/dashboard/listings" className="inline-block w-full">
              <Button className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold w-full">
                Go to My Listings
              </Button>
            </Link>
          </div>
        </main>
        <Footer />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      <main className="flex-1">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Link href="/dashboard" className="inline-flex items-center gap-2 text-primary hover:text-primary/80 font-medium mb-6">
            <ChevronLeft size={20} /> Back
          </Link>

          <div className="mb-6">
            <h1 className="text-3xl font-bold text-foreground mb-1">Add New Listing</h1>
            <p className="text-muted-foreground text-sm">Provide accurate details to help tenants find your property.</p>
          </div>

          {/* Step indicator */}
          <div className="flex items-center mb-8">
            {STEPS.map((label, i) => {
              const n = i + 1
              return (
                <div key={label} className="flex items-center flex-1">
                  <div className="flex flex-col items-center">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                        step >= n ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
                      }`}
                    >
                      {n}
                    </div>
                    <p className="text-[10px] text-center text-muted-foreground mt-1 whitespace-nowrap hidden sm:block">{label}</p>
                  </div>
                  {n < STEPS.length && <div className={`h-0.5 flex-1 mx-1 ${step > n ? 'bg-primary' : 'bg-border'}`} />}
                </div>
              )
            })}
          </div>

          {/* STEP 1 — Property Details */}
          {step === 1 && (
            <div className="bg-card border border-border rounded-lg p-6 space-y-4">
              <h2 className="text-xl font-bold text-foreground">Property Details</h2>

              <div>
                <label className="block text-sm font-semibold text-foreground mb-2">Listing Type *</label>
                <div className="flex gap-2">
                  {['rent', 'sale'].map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setFormData((p) => ({ ...p, listingType: t }))}
                      className={`flex-1 py-2.5 rounded-lg border-2 text-sm font-semibold capitalize transition-colors ${
                        formData.listingType === t ? 'border-primary bg-primary/5 text-primary' : 'border-border text-muted-foreground'
                      }`}
                    >
                      For {t}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-foreground mb-2">Property Name / Title</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData((p) => ({ ...p, title: e.target.value }))}
                  placeholder="e.g. Modern 3 Bedroom Flat in Abakaliki"
                  className="w-full bg-input border border-border rounded-lg px-4 py-3 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-foreground mb-2">Property Type *</label>
                <select
                  required
                  value={formData.propertyType}
                  onChange={(e) => setFormData((p) => ({ ...p, propertyType: e.target.value }))}
                  className="w-full bg-input border border-border rounded-lg px-4 py-3 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">Select type</option>
                  {PROPERTY_TYPES.map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-foreground mb-2">Bedrooms *</label>
                  <select
                    required
                    value={formData.bedrooms}
                    onChange={(e) => setFormData((p) => ({ ...p, bedrooms: e.target.value }))}
                    className="w-full bg-input border border-border rounded-lg px-3 py-3 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="">Select</option>
                    {[1, 2, 3, 4, 5, 6, 7].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-foreground mb-2">Bathrooms</label>
                  <select
                    value={formData.bathrooms}
                    onChange={(e) => setFormData((p) => ({ ...p, bathrooms: e.target.value }))}
                    className="w-full bg-input border border-border rounded-lg px-3 py-3 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="">Select</option>
                    {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-foreground mb-2">Toilets</label>
                  <select
                    value={formData.toilets}
                    onChange={(e) => setFormData((p) => ({ ...p, toilets: e.target.value }))}
                    className="w-full bg-input border border-border rounded-lg px-3 py-3 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="">Select</option>
                    {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-foreground mb-2">Furnished?</label>
                <div className="flex gap-2">
                  {['yes', 'no'].map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setFormData((p) => ({ ...p, furnished: v }))}
                      className={`flex-1 py-2.5 rounded-lg border-2 text-sm font-semibold capitalize transition-colors ${
                        formData.furnished === v ? 'border-primary bg-primary/5 text-primary' : 'border-border text-muted-foreground'
                      }`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-foreground mb-2">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))}
                  placeholder="Describe the property — size, condition, nearby landmarks, special features..."
                  rows={4}
                  className="w-full bg-input border border-border rounded-lg px-4 py-3 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-foreground mb-3">Facilities & Features</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {AMENITIES.map((amenity) => (
                    <label key={amenity.id} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.amenities.includes(amenity.id)}
                        onChange={() => handleAmenityToggle(amenity.id)}
                        className="w-4 h-4 rounded border-border accent-primary"
                      />
                      <span className="text-sm font-medium text-foreground">{amenity.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Ownership doc — always visible, required for trust */}
              <div className="border-t border-border pt-4">
                <label className="block text-sm font-semibold text-destructive mb-2">Proof of Ownership *</label>
                <p className="text-xs text-muted-foreground mb-3">
                  Upload a document showing you own or manage this property (land title, C of O, deed, or tenancy agreement).
                </p>
                {ownershipDoc ? (
                  <div className="flex items-center justify-between border-2 border-border rounded-lg p-3 bg-secondary">
                    <span className="text-sm font-semibold text-foreground truncate flex items-center gap-2">
                      <Check size={14} className="text-primary" /> {docName || 'Document uploaded'}
                    </span>
                    <button type="button" onClick={removeDoc} className="text-destructive text-sm font-semibold px-2">
                      Remove
                    </button>
                  </div>
                ) : (
                  <label className="block border-2 border-dashed border-border rounded-lg p-4 text-center cursor-pointer hover:bg-secondary transition-colors text-sm">
                    {docUploading ? (
                      <span className="text-primary">Uploading document...</span>
                    ) : (
                      <span className="font-semibold text-foreground">Click to upload ownership document</span>
                    )}
                    <input type="file" accept={OWNERSHIP_ACCEPT} onChange={handleDocUpload} className="hidden" />
                  </label>
                )}
              </div>

              <Button
                type="button"
                disabled={!canContinueStep1}
                onClick={() => setStep(2)}
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-3"
              >
                Next: Photos →
              </Button>
            </div>
          )}

          {/* STEP 2 — Photos */}
          {step === 2 && (
            <div className="bg-card border border-border rounded-lg p-6">
              <h2 className="text-xl font-bold text-foreground mb-4">Property Photos (up to 10)</h2>

              {photos.length < 10 && (
                <label className="block border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:bg-secondary transition-colors mb-4">
                  <Upload size={32} className="mx-auto text-muted-foreground mb-2" />
                  <p className="font-semibold text-foreground">Click to upload photos</p>
                  <p className="text-sm text-muted-foreground">or drag and drop</p>
                  {uploading && <p className="text-sm text-primary mt-2">Uploading photos...</p>}
                  <input type="file" multiple accept="image/*" onChange={handlePhotoUpload} className="hidden" />
                </label>
              )}

              {photos.length > 0 && (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-4 mb-4">
                  {photos.map((photo, index) => (
                    <div key={index} className="relative">
                      <img src={photo} alt={`Photo ${index + 1}`} className="w-full h-24 object-cover rounded-lg" />
                      <button
                        type="button"
                        onClick={() => removePhoto(index)}
                        className="absolute -top-2 -right-2 bg-destructive text-white rounded-full w-6 h-6 flex items-center justify-center"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <p className="text-sm text-muted-foreground mb-6">{photos.length}/10 photos uploaded</p>

              <div className="flex gap-3">
                <Button type="button" variant="outline" onClick={() => setStep(1)} className="flex-1 font-semibold py-3">
                  Back
                </Button>
                <Button
                  type="button"
                  disabled={!canContinueStep2}
                  onClick={() => setStep(3)}
                  className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-3"
                >
                  Next: Location →
                </Button>
              </div>
            </div>
          )}

          {/* STEP 3 — Location */}
          {step === 3 && (
            <div className="bg-card border border-border rounded-lg p-6 space-y-4">
              <h2 className="text-xl font-bold text-foreground">Location</h2>

              <div>
                <label className="block text-sm font-semibold text-foreground mb-2">Neighborhood/Area *</label>
                <input
                  type="text"
                  required
                  value={formData.location}
                  onChange={(e) => setFormData((p) => ({ ...p, location: e.target.value }))}
                  placeholder="e.g., Abakaliki GRA"
                  className="w-full bg-input border border-border rounded-lg px-4 py-3 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <button
                type="button"
                onClick={() => setShowMapModal(true)}
                className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-border rounded-lg p-4 text-primary hover:bg-secondary transition-colors font-medium"
              >
                <MapPin size={20} />
                {formData.lat ? 'Pin dropped — tap to change' : 'Drop a pin on map'}
              </button>

              <div className="flex gap-3">
                <Button type="button" variant="outline" onClick={() => setStep(2)} className="flex-1 font-semibold py-3">
                  Back
                </Button>
                <Button
                  type="button"
                  disabled={!canContinueStep3}
                  onClick={() => setStep(4)}
                  className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-3"
                >
                  Next: Pricing →
                </Button>
              </div>
            </div>
          )}

          {/* STEP 4 — Pricing */}
          {step === 4 && (
            <div className="bg-card border border-border rounded-lg p-6 space-y-4">
              <h2 className="text-xl font-bold text-foreground">Pricing & Contact</h2>

              <div>
                <label className="block text-sm font-semibold text-foreground mb-2">Monthly Rent (₦) *</label>
                <input
                  type="number"
                  required
                  value={formData.monthlyRent}
                  onChange={handleMonthlyRentChange}
                  placeholder="e.g., 150000"
                  className="w-full bg-input border border-border rounded-lg px-4 py-3 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-foreground mb-2">Annual Rent (₦)</label>
                <input
                  type="number"
                  value={formData.annualRent}
                  onChange={(e) => setFormData((p) => ({ ...p, annualRent: e.target.value }))}
                  readOnly placeholder="Auto-calculated as monthly × 12"
                  className="w-full bg-input border border-border rounded-lg px-4 py-3 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-foreground mb-2">Phone Number (Nigerian) *</label>
                <input
                  type="tel"
                  required
                  value={formData.phoneNumber}
                  onChange={(e) => setFormData((p) => ({ ...p, phoneNumber: e.target.value }))}
                  placeholder="+234 801 234 5678"
                  className="w-full bg-input border border-border rounded-lg px-4 py-3 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
<div>
                <label className="block text-sm font-semibold text-foreground mb-2">Service Charge (₦, optional)</label>
                <input
                  type="number"
                  min="0"
                  value={formData.serviceCharge}
                  onChange={(e) => setFormData((p) => ({ ...p, serviceCharge: e.target.value }))}
                  placeholder="e.g., 20000"
                  className="w-full bg-input border border-border rounded-lg px-4 py-3 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-foreground mb-2">Caution / Deposit (₦, optional)</label>
                <input
                  type="number"
                  min="0"
                  value={formData.cautionDeposit}
                  onChange={(e) => setFormData((p) => ({ ...p, cautionDeposit: e.target.value }))}
                  placeholder="e.g., 50000"
                  className="w-full bg-input border border-border rounded-lg px-4 py-3 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-foreground mb-2">Availability Date</label>
                <input
                  type="date"
                  value={formData.availabilityDate}
                  onChange={(e) => setFormData((p) => ({ ...p, availabilityDate: e.target.value }))}
                  className="w-full bg-input border border-border rounded-lg px-4 py-3 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div className="flex gap-3">
                <Button type="button" variant="outline" onClick={() => setStep(3)} className="flex-1 font-semibold py-3">
                  Back
                </Button>
                <Button
                  type="button"
                  disabled={!canContinueStep4}
                  onClick={() => setStep(5)}
                  className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-3"
                >
                  Next: Review →
                </Button>
              </div>
            </div>
          )}

          {/* STEP 5 — Review */}
          {step === 5 && (
            <div className="bg-card border border-border rounded-lg p-6 space-y-4">
              <h2 className="text-xl font-bold text-foreground">Review & Submit</h2>

              {photos[0] && <img src={photos[0]} alt="Cover" className="w-full h-48 object-cover rounded-lg" />}

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-muted-foreground">Title</p><p className="font-semibold text-foreground">{formData.title || '—'}</p></div>
                <div><p className="text-muted-foreground">Type</p><p className="font-semibold text-foreground">{formData.propertyType}</p></div>
                <div><p className="text-muted-foreground">Bedrooms</p><p className="font-semibold text-foreground">{formData.bedrooms}</p></div>
                <div><p className="text-muted-foreground">Bathrooms</p><p className="font-semibold text-foreground">{formData.bathrooms || '—'}</p></div>
                <div><p className="text-muted-foreground">Location</p><p className="font-semibold text-foreground">{formData.location}</p></div>
                <div><p className="text-muted-foreground">Monthly Rent</p><p className="font-semibold text-primary">₦{Number(formData.monthlyRent).toLocaleString()}</p></div>
                <div><p className="text-muted-foreground">Photos</p><p className="font-semibold text-foreground">{photos.length} uploaded</p></div>
                <div><p className="text-muted-foreground">Ownership Doc</p><p className="font-semibold text-foreground">{ownershipDoc ? 'Uploaded' : 'Missing'}</p></div>
              </div>

              <div className="bg-secondary border border-border rounded-lg p-4">
                <p className="text-sm text-foreground text-center">
                  Your listing is <span className="font-semibold">free</span> and will be reviewed before going live.
                </p>
              </div>

              <div className="flex gap-3">
                <Button type="button" variant="outline" onClick={() => setStep(4)} className="flex-1 font-semibold py-3">
                  Back
                </Button>
                <Button
                  type="button"
                  disabled={submitting}
                  onClick={handleSubmit}
                  className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground font-bold py-3"
                >
                  {submitting ? 'Submitting...' : 'Submit Listing'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </main>

      <Footer />

      {/* Map Modal */}
      {showMapModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-card rounded-lg max-w-2xl w-full max-h-[28rem] overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h3 className="text-lg font-bold text-foreground">Drop a pin on map</h3>
              <button onClick={() => setShowMapModal(false)} className="text-muted-foreground hover:text-foreground">
                <X size={20} />
              </button>
            </div>
            <MapPlaceholder
              height="h-80"
              onLocationSelect={(lat, lng) => setFormData((p) => ({ ...p, lat, lng }))}
            />
            <div className="p-4 border-t border-border flex gap-3">
              <Button onClick={() => setShowMapModal(false)} variant="outline" className="flex-1 font-semibold">
                Cancel
              </Button>
              <Button onClick={() => setShowMapModal(false)} className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold">
                Confirm Location
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}