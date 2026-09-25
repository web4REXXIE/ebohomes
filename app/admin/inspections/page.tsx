'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Search, ClipboardCheck, Home as HomeIcon, CheckCircle2, XCircle, Clock } from 'lucide-react'

type Category = {
  key: 'road' | 'water' | 'electricity' | 'network' | 'security' | 'condition' | 'environment'
  label: string
  notesField: string
  matchesField: string
  placeholder: string
}

const CATEGORIES: Category[] = [
  { key: 'road', label: 'Road', notesField: 'road_condition', matchesField: 'road_matches', placeholder: 'e.g. tarred, good condition' },
  { key: 'water', label: 'Water', notesField: 'water_source', matchesField: 'water_matches', placeholder: 'e.g. borehole, reliable' },
  { key: 'electricity', label: 'Electricity', notesField: 'electricity_notes', matchesField: 'electricity_matches', placeholder: 'e.g. NEPA + generator backup' },
  { key: 'network', label: 'Network', notesField: 'network_notes', matchesField: 'network_matches', placeholder: 'e.g. MTN strong, Glo weak' },
  { key: 'security', label: 'Security', notesField: 'security_notes', matchesField: 'security_matches', placeholder: 'e.g. gated, security guard present' },
  { key: 'condition', label: 'Property Condition', notesField: 'condition_notes', matchesField: 'condition_matches', placeholder: 'e.g. matches photos, well maintained' },
  { key: 'environment', label: 'Environment', notesField: 'environment_notes', matchesField: 'environment_matches', placeholder: 'e.g. quiet, residential, clean surroundings' },
]

function summarize(insp: any) {
  const parts: string[] = []
  for (const cat of CATEGORIES) {
    if (insp[cat.matchesField] === false) parts.push(`${cat.label} doesn't match`)
  }
  if (parts.length === 0 && insp.overall_notes) return insp.overall_notes
  if (parts.length === 0) return 'All categories matched, no issues flagged'
  return parts.join(' · ')
}

function InspectionsPageInner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const listingIdParam = searchParams.get('listing')

  const [listing, setListing] = useState<any>(null)
  const [loadingListing, setLoadingListing] = useState(false)

  // backup picker
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [searching, setSearching] = useState(false)

  // form state
  const [form, setForm] = useState<Record<string, any>>({})
  const [neighborhoodType, setNeighborhoodType] = useState('')
  const [nearbyLandmarks, setNearbyLandmarks] = useState('')
  const [photosInput, setPhotosInput] = useState('')
  const [overallNotes, setOverallNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  // past inspections for the selected listing
  const [pastInspections, setPastInspections] = useState<any[]>([])

  // all inspections, across every property — shown on the no-listing-selected view
  const [allInspections, setAllInspections] = useState<any[]>([])
  const [loadingAll, setLoadingAll] = useState(false)

  useEffect(() => {
    if (listingIdParam) {
      loadListing(listingIdParam)
    } else {
      setListing(null)
      fetchAllInspections()
    }
  }, [listingIdParam])

  const loadListing = async (id: string) => {
    setLoadingListing(true)
    const { data } = await supabase.from('listings').select('*').eq('id', id).single()
    setListing(data ?? null)
    setLoadingListing(false)
    if (data) fetchPastInspections(data.id)
  }

  const fetchPastInspections = async (listingId: string) => {
    const { data } = await supabase
      .from('property_inspections')
      .select('*')
      .eq('listing_id', listingId)
      .order('inspected_at', { ascending: false })
    setPastInspections(data ?? [])
  }

  const fetchAllInspections = async () => {
    setLoadingAll(true)
    const { data: inspections } = await supabase
      .from('property_inspections')
      .select('*')
      .order('inspected_at', { ascending: false })

    if (!inspections || inspections.length === 0) {
      setAllInspections([])
      setLoadingAll(false)
      return
    }

    // join in listing title/location — property_inspections doesn't store the property name itself
    const listingIds = [...new Set(inspections.map((i) => i.listing_id))]
    const { data: listingsData } = await supabase
      .from('listings')
      .select('id, title, location_text, photos')
      .in('id', listingIds)

    const listingMap = new Map((listingsData ?? []).map((l) => [l.id, l]))

    const merged = inspections.map((insp) => ({
      ...insp,
      listing: listingMap.get(insp.listing_id) ?? null,
    }))

    setAllInspections(merged)
    setLoadingAll(false)
  }

  const handleSearch = async () => {
    if (!query.trim()) {
      setResults([])
      return
    }
    setSearching(true)
    const { data } = await supabase
      .from('listings')
      .select('id, title, location_text, status, photos')
      .or(`title.ilike.%${query}%,location_text.ilike.%${query}%`)
      .limit(10)
    setResults(data ?? [])
    setSearching(false)
  }

  const selectFromPicker = (id: string) => {
    router.push(`/admin/inspections?listing=${id}`)
  }

  const updateField = (field: string, value: any) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const resetForm = () => {
    setForm({})
    setNeighborhoodType('')
    setNearbyLandmarks('')
    setPhotosInput('')
    setOverallNotes('')
    setSubmitted(false)
  }

  const handleSubmit = async () => {
    if (!listing) return
    setSubmitting(true)

    const { data: { user } } = await supabase.auth.getUser()

    const photos = photosInput
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean)

    const payload: Record<string, any> = {
      listing_id: listing.id,
      inspected_by: user?.id ?? null,
      inspected_at: new Date().toISOString(),
      neighborhood_type: neighborhoodType || null,
      nearby_landmarks: nearbyLandmarks || null,
      photos: photos.length > 0 ? photos : null,
      overall_notes: overallNotes || null,
    }
    for (const cat of CATEGORIES) {
      payload[cat.notesField] = form[cat.notesField] || null
      payload[cat.matchesField] = form[cat.matchesField] ?? null
    }

    const { error } = await supabase.from('property_inspections').insert(payload)

    if (error) {
      alert('Failed to save inspection: ' + error.message)
    } else {
      setSubmitted(true)
      fetchPastInspections(listing.id)
      resetForm()
    }
    setSubmitting(false)
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
      <h1 className="text-2xl font-bold text-foreground mb-1 flex items-center gap-2">
        <ClipboardCheck size={22} /> Property Inspection
      </h1>
      <p className="text-sm text-muted-foreground mb-6">
        Record what you actually found on a visit.
      </p>

      {/* Backup picker + all-inspections list — only shown if no listing selected yet */}
      {!listing && (
        <>
          <div className="bg-card border border-border rounded-lg p-4 mb-6">
            <label className="block text-xs font-medium text-muted-foreground mb-2">
              Search for a property to inspect
            </label>
            <div className="flex gap-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Search by title or location..."
                className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-sm"
              />
              <Button onClick={handleSearch} disabled={searching} className="shrink-0">
                <Search size={16} />
              </Button>
            </div>

            {results.length > 0 && (
              <div className="mt-3 space-y-2">
                {results.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => selectFromPicker(r.id)}
                    className="w-full text-left flex items-center gap-3 p-2 rounded-lg border border-border hover:bg-secondary transition-colors"
                  >
                    {r.photos?.[0] ? (
                      <img src={r.photos[0]} className="w-12 h-12 object-cover rounded-md shrink-0" />
                    ) : (
                      <div className="w-12 h-12 rounded-md bg-secondary flex items-center justify-center shrink-0">
                        <HomeIcon size={16} className="text-muted-foreground" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{r.title ?? 'Untitled listing'}</p>
                      <p className="text-xs text-muted-foreground truncate">{r.location_text}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* All Inspections — every record, every property, reverse chronological */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <Clock size={15} /> All Inspections
            </h3>

            {loadingAll ? (
              <p className="text-sm text-muted-foreground">Loading inspections...</p>
            ) : allInspections.length === 0 ? (
              <div className="bg-card border border-border rounded-lg p-6 text-center text-sm text-muted-foreground">
                No inspections recorded yet.
              </div>
            ) : (
              <div className="space-y-2">
                {allInspections.map((insp) => (
                  <button
                    key={insp.id}
                    onClick={() => insp.listing_id && router.push(`/admin/inspections?listing=${insp.listing_id}`)}
                    className="w-full text-left flex items-center gap-3 p-3 rounded-lg border border-border bg-card hover:bg-secondary transition-colors"
                  >
                    {insp.listing?.photos?.[0] ? (
                      <img src={insp.listing.photos[0]} className="w-14 h-14 object-cover rounded-lg shrink-0" />
                    ) : (
                      <div className="w-14 h-14 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                        <HomeIcon size={18} className="text-muted-foreground" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-foreground truncate">
                          {insp.listing?.title ?? 'Property no longer available'}
                        </p>
                        <p className="text-[11px] text-muted-foreground shrink-0">
                          {new Date(insp.inspected_at).toLocaleDateString()}
                        </p>
                      </div>
                      {insp.listing?.location_text && (
                        <p className="text-xs text-muted-foreground truncate">{insp.listing.location_text}</p>
                      )}
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{summarize(insp)}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {loadingListing && <p className="text-muted-foreground text-sm">Loading property...</p>}

      {listing && (
        <>
          {/* Selected listing summary */}
          <div className="bg-card border border-border rounded-lg p-4 mb-6 flex items-center gap-3">
            {listing.photos?.[0] ? (
              <img src={listing.photos[0]} className="w-16 h-16 object-cover rounded-lg shrink-0" />
            ) : (
              <div className="w-16 h-16 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                <HomeIcon size={20} className="text-muted-foreground" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground truncate">{listing.title ?? 'Untitled listing'}</p>
              <p className="text-xs text-muted-foreground truncate">{listing.location_text}</p>
            </div>
            <button
              onClick={() => router.push('/admin/inspections')}
              className="text-xs text-primary font-medium hover:underline shrink-0"
            >
              Change
            </button>
          </div>

          {submitted && (
            <div className="bg-emerald-50 border border-emerald-300 text-emerald-800 text-sm font-medium rounded-lg p-3 mb-6">
              Inspection saved.
            </div>
          )}

          {/* Category-by-category form */}
          <div className="space-y-4 mb-6">
            {CATEGORIES.map((cat) => (
              <div key={cat.key} className="bg-card border border-border rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-foreground">{cat.label}</h3>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => updateField(cat.matchesField, true)}
                      className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                        form[cat.matchesField] === true
                          ? 'bg-emerald-50 border-emerald-400 text-emerald-700'
                          : 'border-border text-muted-foreground'
                      }`}
                    >
                      <CheckCircle2 size={13} /> Matches
                    </button>
                    <button
                      type="button"
                      onClick={() => updateField(cat.matchesField, false)}
                      className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                        form[cat.matchesField] === false
                          ? 'bg-red-50 border-red-400 text-red-700'
                          : 'border-border text-muted-foreground'
                      }`}
                    >
                      <XCircle size={13} /> Doesn't match
                    </button>
                  </div>
                </div>
                <textarea
                  value={form[cat.notesField] ?? ''}
                  onChange={(e) => updateField(cat.notesField, e.target.value)}
                  rows={2}
                  placeholder={cat.placeholder}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
                />
              </div>
            ))}

            <div className="bg-card border border-border rounded-lg p-4">
              <h3 className="text-sm font-semibold text-foreground mb-2">Neighborhood</h3>
              <input
                value={neighborhoodType}
                onChange={(e) => setNeighborhoodType(e.target.value)}
                placeholder="e.g. quiet residential, busy commercial strip"
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm mb-2"
              />
              <textarea
                value={nearbyLandmarks}
                onChange={(e) => setNearbyLandmarks(e.target.value)}
                rows={2}
                placeholder="Nearby landmarks — e.g. 5 min walk to Abakaliki main market; 10 min to General Hospital"
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
              />
            </div>

            <div className="bg-card border border-border rounded-lg p-4">
              <h3 className="text-sm font-semibold text-foreground mb-2">Photos</h3>
              <input
                value={photosInput}
                onChange={(e) => setPhotosInput(e.target.value)}
                placeholder="Paste photo URLs, comma-separated (upload elsewhere for now)"
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Backlog: hook this to a proper upload flow later, same as property listing photos.
              </p>
            </div>

            <div className="bg-card border border-border rounded-lg p-4">
              <h3 className="text-sm font-semibold text-foreground mb-2">Overall Notes</h3>
              <textarea
                value={overallNotes}
                onChange={(e) => setOverallNotes(e.target.value)}
                rows={3}
                placeholder="Anything else worth recording"
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
              />
            </div>
          </div>

          <Button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full font-semibold flex items-center justify-center gap-2 mb-8"
          >
            <ClipboardCheck size={16} /> Save Inspection
          </Button>

          {/* Past inspections for this listing */}
          {pastInspections.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-3">Past Inspections</h3>
              <div className="space-y-2">
                {pastInspections.map((insp) => (
                  <div key={insp.id} className="bg-card border border-border rounded-lg p-3 text-xs text-muted-foreground">
                    <p className="font-medium text-foreground">
                      {new Date(insp.inspected_at).toLocaleString()}
                    </p>
                    <p className="mt-1">{summarize(insp)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default function InspectionsPage() {
  return (
    <Suspense fallback={<div className="max-w-4xl mx-auto px-4 py-6 text-muted-foreground">Loading...</div>}>
      <InspectionsPageInner />
    </Suspense>
  )
}