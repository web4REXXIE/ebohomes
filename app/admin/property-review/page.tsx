'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Check, X, FileEdit, Home as HomeIcon, ShieldCheck, ClipboardCheck } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { getOwnershipSignedUrl } from '@/lib/ownership-docs'
import { Button } from '@/components/ui/button'
import { authorityStatusInfo, isAuthorityReviewed } from '@/lib/listing-authority'
import { AdminLocationPanel } from '@/components/admin-location-panel'
import { useConfirm } from '@/components/confirm-dialog'

const CHECKLIST = [
  'Property photos are clear and real',
  'Property details are accurate',
  'Price is reasonable for the location',
  'No duplicate or misleading info',
  'Follows EboHomes listing guidelines',
]

export default function PropertyReviewPage() {
  const { confirm, dialog } = useConfirm()
  const [listings, setListings] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'pending' | 'inspection_required' | 'approved' | 'suspended' | 'rejected'>('pending')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [ownershipDocUrl, setOwnershipDocUrl] = useState('')
  const [rejectReason, setRejectReason] = useState('')
  const [actionError, setActionError] = useState('')
  const [updating, setUpdating] = useState(false)
  const [flags, setFlags] = useState<any[]>([])
  const [risk, setRisk] = useState<any>(null)
  const [suspendReason, setSuspendReason] = useState('')
  // Listings recorded at the authority cutover that are still unresolved. The database gate lets these return to approved.
  const [legacyOpen, setLegacyOpen] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetchListings()
  }, [])

  const fetchListings = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('listings')
      // Explicit columns on purpose: the exact pin (lat, lng) is not readable from the table. The location panel gets it from an admin function.
      .select('id, landlord_id, title, description, location_text, price_monthly, property_type, bedrooms, bathrooms, furnished, photos, status, created_at, availability_date, featured, reviewed_at, rejection_reason, suspension_reason, ownership_doc_url, authority_status')
      .order('created_at', { ascending: false })
    setListings(data ?? [])
    const { data: legacy } = await supabase.from('listing_authority_legacy').select('listing_id').is('resolved_at', null)
    setLegacyOpen(new Set((legacy ?? []).map((r: any) => r.listing_id as string)))
    setLoading(false)
  }

  const filtered = listings.filter((l) => (l.status ?? 'pending') === tab)
  const selected = listings.find((l) => l.id === selectedId) ?? filtered[0]
  // The database only lets a listing awaiting review be approved or rejected here.
  const awaitingReview = ['pending', 'inspection_required'].includes(selected?.status ?? 'pending')

  useEffect(() => {
    if (filtered.length > 0 && !filtered.find((l) => l.id === selectedId)) {
      setSelectedId(filtered[0].id)
    }
    if (filtered.length === 0) setSelectedId(null)
    setRejectReason('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, listings])

  useEffect(() => {
    setRejectReason('')
  }, [selected?.id])

  // ---- generate a signed URL for the ownership document whenever the selected listing changes ----
  useEffect(() => {
    const loadDocUrl = async () => {
      setOwnershipDocUrl('')
      if (!selected?.ownership_doc_url) return

      const signedUrl = await getOwnershipSignedUrl(selected.ownership_doc_url, selected.landlord_id)
      if (signedUrl) setOwnershipDocUrl(signedUrl)
    }
    loadDocUrl()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id])

  const loadFlags = async (listingId: string) => {
    const { data } = await supabase
      .from('risk_flags')
      .select('id, flag_type, severity, detail, status, related:listings!risk_flags_related_listing_id_fkey(id, title, location_text, status)')
      .eq('listing_id', listingId)
      .eq('status', 'open')
      .order('created_at', { ascending: false })
    setFlags(data ?? [])
    const { data: riskRow } = await supabase
      .from('listing_risk')
      .select('score, level, reasons')
      .eq('listing_id', listingId)
      .maybeSingle()
    setRisk(riskRow ?? null)
  }

  const resolveFlag = async (flagId: string, status: 'dismissed' | 'confirmed') => {
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase
      .from('risk_flags')
      .update({ status, reviewed_by: user?.id ?? null, reviewed_at: new Date().toISOString() })
      .eq('id', flagId)
    if (!error && selected?.id) loadFlags(selected.id)
  }

  useEffect(() => {
    setFlags([])
    setRisk(null)
    setActionError('')
    if (selected?.id) loadFlags(selected.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id])

  const handleToggleFeatured = async (id: string, current: boolean) => {
    const { error } = await supabase.from('listings').update({ featured: !current }).eq('id', id)
    if (!error) {
      setListings((prev) => prev.map((l) => (l.id === id ? { ...l, featured: !current } : l)))
    }
  }

  // Every publication decision goes through one database function that locks the listing,
  // refuses stale or self-review decisions, requires reasons and records who decided.
  const reviewListing = async (
    listing: any,
    action: 'approve' | 'reject' | 'suspend' | 'reinstate',
    reason: string | null
  ): Promise<string | null> => {
    setActionError('')
    setUpdating(true)
    const { data, error } = await supabase.rpc('admin_review_listing', {
      p_listing: listing.id,
      p_action: action,
      p_reason: reason,
      p_expected_status: listing.status ?? 'pending',
    })
    setUpdating(false)
    if (error) {
      setActionError(`Could not ${action} this listing: ${error.message}`)
      if (error.code === '40001') fetchListings()
      return null
    }
    const newStatus = String(data)
    const nowIso = new Date().toISOString()
    setListings((prev) =>
      prev.map((l) =>
        l.id !== listing.id
          ? l
          : {
              ...l,
              status: newStatus,
              ...(action === 'approve' ? { reviewed_at: nowIso, rejection_reason: null } : {}),
              ...(action === 'reject' ? { reviewed_at: nowIso, rejection_reason: reason } : {}),
              ...(action === 'suspend' ? { suspension_reason: reason, suspended_at: nowIso } : {}),
              ...(action === 'reinstate' ? { suspension_reason: null, suspended_at: null } : {}),
            }
      )
    )
    return newStatus
  }

  const handleApprove = async (id: string) => {
    const l = listings.find((x) => x.id === id)
    if (l) await reviewListing(l, 'approve', null)
  }

  const handleReject = async (id: string) => {
    const reason = rejectReason.trim()
    if (reason.length < 5) {
      setActionError('Please enter a rejection reason (at least 5 characters).')
      return
    }
    const l = listings.find((x) => x.id === id)
    if (l && (await reviewListing(l, 'reject', reason))) setRejectReason('')
  }

  const handleSuspend = async (id: string) => {
    const reason = suspendReason.trim()
    if (reason.length < 5) {
      setActionError('Enter the reason for suspending this listing (at least 5 characters).')
      return
    }
    const l = listings.find((x) => x.id === id)
    if (l && (await reviewListing(l, 'suspend', reason))) setSuspendReason('')
  }

  const handleReinstate = async (id: string) => {
    if (!(await confirm({ title: 'Reinstate listing?', message: 'Reinstate this listing and put it back in review?', confirmLabel: 'Reinstate' }))) return
    const l = listings.find((x) => x.id === id)
    if (l) await reviewListing(l, 'reinstate', null)
  }

  const counts = {
    pending: listings.filter((l) => (l.status ?? 'pending') === 'pending').length,
    approved: listings.filter((l) => l.status === 'approved').length,
    rejected: listings.filter((l) => l.status === 'rejected').length,
    inspection_required: listings.filter((l) => l.status === 'inspection_required').length,
    suspended: listings.filter((l) => l.status === 'suspended').length,
  }

  const canApprove = !!selected && (isAuthorityReviewed(selected.authority_status) || legacyOpen.has(selected.id))
  const authInfo = authorityStatusInfo(selected?.authority_status)

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <h1 className="text-2xl font-bold text-foreground mb-1">Property Review / Approval</h1>
      <p className="text-sm text-muted-foreground mb-6">Review property details and approve or reject listings.</p>

      <div className="flex gap-2 mb-6">
        {(['pending', 'inspection_required', 'approved', 'suspended', 'rejected'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold capitalize transition-colors ${
              tab === t ? 'bg-primary text-primary-foreground' : 'bg-card border border-border text-muted-foreground hover:bg-secondary'
            }`}
          >
            {t.replace('_', ' ')} ({counts[t]})
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : filtered.length === 0 ? (
        <div className="bg-card border border-border rounded-lg p-12 text-center text-muted-foreground">
          No {tab.replace('_', ' ')} listings.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* List */}
          <div className="space-y-3 max-h-[75vh] overflow-y-auto pr-1">
            {filtered.map((l) => (
              <button
                key={l.id}
                onClick={() => setSelectedId(l.id)}
                className={`w-full text-left bg-card border rounded-lg p-3 flex gap-3 transition-colors ${
                  selected?.id === l.id ? 'border-primary bg-primary/5' : 'border-border hover:bg-secondary'
                }`}
              >
                {l.photos?.[0] ? (
                  <img src={l.photos[0]} className="w-16 h-16 object-cover rounded-lg bg-secondary shrink-0" />
                ) : (
                  <div className="w-16 h-16 rounded-lg bg-secondary shrink-0 flex items-center justify-center">
                    <HomeIcon size={20} className="text-muted-foreground" />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate flex items-center gap-1">
                    {l.title ?? 'Untitled listing'}
                    {isAuthorityReviewed(l.authority_status) && <ShieldCheck size={13} className="text-emerald-600 shrink-0" aria-label="Authority reviewed" />}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">{l.location_text}</p>
                  <p className="text-xs text-muted-foreground">
                    Submitted {l.created_at ? new Date(l.created_at).toLocaleDateString() : ''}
                  </p>
                </div>
              </button>
            ))}
          </div>

          {/* Detail */}
          {selected && (
            <div className="lg:col-span-2 space-y-4">
              <div className="bg-card border border-border rounded-lg overflow-hidden">
                {selected.photos?.[0] ? (
                  <img src={selected.photos[0]} className="w-full h-72 object-cover" />
                ) : (
                  <div className="w-full h-72 bg-secondary flex items-center justify-center text-muted-foreground">
                    No Photo
                  </div>
                )}
                {selected.photos?.length > 1 && (
                  <div className="flex gap-2 p-3 overflow-x-auto">
                    {selected.photos.slice(1, 6).map((p: string, i: number) => (
                      <img key={i} src={p} className="w-16 h-16 object-cover rounded-md shrink-0" />
                    ))}
                    {selected.photos.length > 6 && (
                      <div className="w-16 h-16 rounded-md bg-secondary flex items-center justify-center text-xs text-muted-foreground shrink-0">
                        +{selected.photos.length - 6} More
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="bg-card border border-border rounded-lg p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
                      {selected.title ?? 'Untitled listing'}
                      {isAuthorityReviewed(selected.authority_status) && (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                          <ShieldCheck size={12} /> Authority reviewed
                        </span>
                      )}
                    </h2>
                    <p className="text-sm text-muted-foreground">{selected.location_text}</p>
                  </div>
                  <p className="text-lg font-bold text-primary">₦{selected.price_monthly?.toLocaleString()}/mo</p>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4 text-xs">
                  <div className="bg-secondary rounded-lg p-2 text-center">
                    <p className="font-semibold text-foreground">{selected.bedrooms ?? '—'}</p>
                    <p className="text-muted-foreground">Bedrooms</p>
                  </div>
                  <div className="bg-secondary rounded-lg p-2 text-center">
                    <p className="font-semibold text-foreground">{selected.bathrooms ?? '—'}</p>
                    <p className="text-muted-foreground">Bathrooms</p>
                  </div>
                  <div className="bg-secondary rounded-lg p-2 text-center">
                    <p className="font-semibold text-foreground">{selected.property_type ?? '—'}</p>
                    <p className="text-muted-foreground">Type</p>
                  </div>
                  <div className="bg-secondary rounded-lg p-2 text-center">
                    <p className="font-semibold text-foreground">{selected.furnished ? 'Yes' : 'No'}</p>
                    <p className="text-muted-foreground">Furnished</p>
                  </div>
                </div>

                {selected.description && (
                  <p className="text-sm text-muted-foreground mb-4">{selected.description}</p>
                )}

                <div className="grid grid-cols-2 gap-2 text-xs mb-4 border-t border-border pt-3">
                  <p><span className="text-muted-foreground">Property ID:</span> <span className="font-medium text-foreground">{selected.id?.slice(0, 8)}</span></p>
                  <p><span className="text-muted-foreground">Status:</span> <span className="font-medium text-foreground capitalize">{selected.status ?? 'pending'}</span></p>
                  <p><span className="text-muted-foreground">Listed On:</span> <span className="font-medium text-foreground">{selected.created_at ? new Date(selected.created_at).toLocaleDateString() : '—'}</span></p>
                  <p><span className="text-muted-foreground">Available:</span> <span className="font-medium text-foreground">{selected.availability_date ?? 'Immediately'}</span></p>
                </div>

                {(selected.status === 'approved' || selected.status === 'rejected') && selected.reviewed_at && (
                  <p className="text-xs text-muted-foreground mb-1 border-t border-border pt-3">
                    {selected.status === 'approved' ? 'Approved' : 'Rejected'} on {new Date(selected.reviewed_at).toLocaleString()}
                  </p>
                )}
                {selected.status === 'rejected' && selected.rejection_reason && (
                  <p className="text-xs text-destructive mb-1">
                    <span className="font-semibold">Reason:</span> {selected.rejection_reason}
                  </p>
                )}
                {selected.ownership_doc_url && (
                  ownershipDocUrl ? (
                    <a
                      href={ownershipDocUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm text-primary font-medium hover:underline"
                    >
                      <FileEdit size={14} /> View ownership document
                    </a>
                  ) : (
                    <p className="text-sm text-destructive">Document unavailable: invalid path.</p>
                  )
                )}
              </div>

              {risk && (
                <div className="bg-card border border-border rounded-lg p-5">
                  <h3 className="font-semibold text-foreground mb-1">
                    Risk score: {risk.score} ({risk.level})
                  </h3>
                  <p className="text-xs text-muted-foreground mb-2">
                    A guide for the reviewer. It does not approve or reject anything.
                  </p>
                  <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-1">
                    {(risk.reasons ?? []).map((reason: string) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                </div>
              )}

              {flags.length > 0 && (
                <div className="bg-card border-2 border-destructive/40 rounded-lg p-5">
                  <h3 className="font-semibold text-destructive mb-1">⚠ Possible duplicate or conflict</h3>
                  <p className="text-xs text-muted-foreground mb-3">
                    This is a warning, not proof of fraud. Check it before approving.
                  </p>
                  <div className="space-y-3">
                    {flags.map((f) => (
                      <div key={f.id} className="rounded-lg border border-border p-3 text-sm">
                        <p className="font-medium text-foreground">
                          {f.detail} <span className="text-xs text-muted-foreground">({f.severity})</span>
                        </p>
                        {f.related && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Other listing: {f.related.title ?? 'Untitled'} · {f.related.location_text} · {f.related.status}
                          </p>
                        )}
                        <div className="flex gap-2 mt-2">
                          <Button size="sm" variant="outline" onClick={() => resolveFlag(f.id, 'dismissed')}>
                            Not a problem
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => resolveFlag(f.id, 'confirmed')}>
                            Confirmed conflict
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Location and surroundings: pin review, inspector comparison, history, surroundings facts */}
              <AdminLocationPanel listingId={selected.id} />

              {/* Review checklist + actions */}
              <div className="bg-card border border-border rounded-lg p-5">
                <h3 className="font-semibold text-foreground mb-3">Check before approving</h3>
                <ul className="space-y-2 mb-5">
                  {CHECKLIST.map((item) => (
                    <li key={item} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Check size={14} className="text-primary" /> {item}
                    </li>
                  ))}
                </ul>

                {selected.status !== 'rejected' && (
                  <label className="block mb-3">
                    <span className="text-xs font-medium text-muted-foreground">Rejection reason (required to reject)</span>
                    <textarea
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      rows={2}
                      placeholder="e.g. Photos don't match the description"
                      className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
                    />
                  </label>
                )}

                {!canApprove && selected.status !== 'approved' && (
                  <p className="mb-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                    Approval is blocked until the property authority is accepted. Review it on the Listing Authority page.
                  </p>
                )}

                {actionError && (
                  <p role="alert" className="mb-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm font-medium text-destructive">
                    {actionError}
                  </p>
                )}

                <div className="flex flex-col sm:flex-row gap-3">
                  <Button
                    onClick={() => handleApprove(selected.id)}
                    disabled={updating || !awaitingReview || !canApprove}
                    className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold flex items-center justify-center gap-2"
                  >
                    <Check size={16} /> Approve Property
                  </Button>
                  <Button
                    onClick={() => handleReject(selected.id)}
                    disabled={updating || !awaitingReview || rejectReason.trim().length < 5}
                    variant="outline"
                    className="flex-1 border-destructive text-destructive hover:bg-destructive/10 font-semibold flex items-center justify-center gap-2"
                  >
                    <X size={16} /> Reject Property
                  </Button>
                  <Button
                    onClick={() => handleToggleFeatured(selected.id, selected.featured)}
                    variant="outline"
                    className={`flex-1 font-semibold flex items-center justify-center gap-2 ${
                      selected.featured ? 'border-amber-500 text-amber-600 bg-amber-50' : 'border-border text-muted-foreground'
                    }`}
                  >
                    ⭐️ {selected.featured ? 'Unfeature' : 'Feature'} Property
                  </Button>
                </div>
              </div>

              {/* Suspend / reinstate (listing freeze) */}
              <div className="bg-card border border-border rounded-lg p-5">
                <h3 className="font-semibold text-foreground mb-1">Listing freeze</h3>
                {selected.status === 'suspended' ? (
                  <>
                    <p className="text-xs text-muted-foreground mb-3">
                      Suspended{selected.suspension_reason ? `: ${selected.suspension_reason}` : ''}. It is hidden from tenants and cannot be applied to.
                    </p>
                    <Button onClick={() => handleReinstate(selected.id)} disabled={updating} variant="outline" className="w-full font-semibold">
                      Reinstate and send back to review
                    </Button>
                  </>
                ) : (
                  <>
                    <p className="text-xs text-muted-foreground mb-3">
                      Use when a serious risk is found. The listing disappears from the public site straight away.
                    </p>
                    <textarea
                      value={suspendReason}
                      onChange={(e) => setSuspendReason(e.target.value)}
                      rows={2}
                      placeholder="Reason (required)"
                      className="mb-3 w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
                    />
                    <Button
                      onClick={() => handleSuspend(selected.id)}
                      disabled={updating || suspendReason.trim().length < 5}
                      variant="outline"
                      className="w-full border-destructive text-destructive hover:bg-destructive/10 font-semibold"
                    >
                      Suspend listing
                    </Button>
                  </>
                )}
              </div>

              {/* Property authority: reviewed separately. This replaces the old "Property verified" toggle. */}
              <div className="bg-card border border-border rounded-lg p-5">
                <h3 className="font-semibold text-foreground mb-1">Property authority</h3>
                <p className="text-xs text-muted-foreground mb-3">
                  Whether the lister may list this property. It is reviewed on its own page, and it is separate from identity checks and inspection.
                </p>
                <p className="text-sm font-semibold text-foreground">{authInfo.label}</p>
                <p className="text-xs text-muted-foreground mb-1">{authInfo.detail}</p>
                {legacyOpen.has(selected.id) && !isAuthorityReviewed(selected.authority_status) && (
                  <p className="text-xs text-amber-800 mb-3">An existing listing from before authority review. It may stay live during the transition.</p>
                )}
                <Link
                  href={`/admin/listing-authority?listing=${selected.id}`}
                  className="mt-2 w-full inline-flex items-center justify-center gap-2 font-semibold border border-border rounded-lg px-4 py-2.5 text-sm hover:bg-secondary transition-colors"
                >
                  <ShieldCheck size={16} /> Open this listing in Listing Authority
                </Link>
              </div>

              {/* Inspection — separate action, feeds Phase 6 property intelligence */}
              <div className="bg-card border border-border rounded-lg p-5">
                <h3 className="font-semibold text-foreground mb-1">Property Inspection</h3>
                <p className="text-xs text-muted-foreground mb-4">
                  Inspectors submit evidence, and a different reviewer approves it. Manage requests on the Inspections page.
                </p>
                <Link
                  href="/admin/inspections"
                  className="w-full inline-flex items-center justify-center gap-2 font-semibold border border-border rounded-lg px-4 py-2.5 text-sm hover:bg-secondary transition-colors"
                >
                  <ClipboardCheck size={16} /> Request or review inspections
                </Link>
              </div>
            </div>
          )}
        </div>
      )}
      {dialog}
    </div>
  )
}
