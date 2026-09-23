'use client'

import { useEffect, useState } from 'react'
import { Check, X, FileEdit, Home as HomeIcon, ShieldCheck, ShieldOff } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'

const CHECKLIST = [
  'Property photos are clear and real',
  'Property details are accurate',
  'Price is reasonable for the location',
  'No duplicate or misleading info',
  'Follows EboHomes listing guidelines',
]

export default function PropertyReviewPage() {
  const [listings, setListings] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'pending' | 'approved' | 'rejected'>('pending')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [ownershipDocUrl, setOwnershipDocUrl] = useState('')
  const [rejectReason, setRejectReason] = useState('')
  const [updating, setUpdating] = useState(false)

  useEffect(() => {
    fetchListings()
  }, [])

  const fetchListings = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('listings')
      .select('*')
      .order('created_at', { ascending: false })
    setListings(data ?? [])
    setLoading(false)
  }

  const filtered = listings.filter((l) => (l.status ?? 'pending') === tab)
  const selected = listings.find((l) => l.id === selectedId) ?? filtered[0]

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

      // old data may still hold a full public URL — use it as-is for now
      if (selected.ownership_doc_url.startsWith('http')) {
        setOwnershipDocUrl(selected.ownership_doc_url)
        return
      }

      // otherwise treat it as a storage path and generate a signed URL
      const { data } = await supabase.storage
        .from('ownership-docs')
        .createSignedUrl(selected.ownership_doc_url, 60 * 5)
      if (data?.signedUrl) setOwnershipDocUrl(data.signedUrl)
    }
    loadDocUrl()
  }, [selected?.id])

  const handleToggleFeatured = async (id: string, current: boolean) => {
    const { error } = await supabase.from('listings').update({ featured: !current }).eq('id', id)
    if (!error) {
      setListings((prev) => prev.map((l) => (l.id === id ? { ...l, featured: !current } : l)))
    }
  }

  const handleApprove = async (id: string) => {
    setUpdating(true)
    const { data: { user } } = await supabase.auth.getUser()
    const nowIso = new Date().toISOString()

    const { error } = await supabase
      .from('listings')
      .update({
        status: 'approved',
        reviewed_by: user?.id ?? null,
        reviewed_at: nowIso,
        rejection_reason: null,
      })
      .eq('id', id)

    if (!error) {
      setListings((prev) => prev.map((l) =>
        l.id === id ? { ...l, status: 'approved', reviewed_at: nowIso, rejection_reason: null } : l
      ))
    } else {
      alert('Failed to approve: ' + error.message)
    }
    setUpdating(false)
  }

  const handleReject = async (id: string) => {
    if (!rejectReason.trim()) {
      alert('Please enter a rejection reason before rejecting.')
      return
    }
    setUpdating(true)
    const { data: { user } } = await supabase.auth.getUser()
    const nowIso = new Date().toISOString()
    const reason = rejectReason.trim()

    const { error } = await supabase
      .from('listings')
      .update({
        status: 'rejected',
        reviewed_by: user?.id ?? null,
        reviewed_at: nowIso,
        rejection_reason: reason,
      })
      .eq('id', id)

    if (!error) {
      setListings((prev) => prev.map((l) =>
        l.id === id ? { ...l, status: 'rejected', reviewed_at: nowIso, rejection_reason: reason } : l
      ))
      setRejectReason('')
    } else {
      alert('Failed to reject: ' + error.message)
    }
    setUpdating(false)
  }

  const handleToggleVerified = async (id: string, current: boolean) => {
    const confirmMsg = current
      ? 'Remove the EboHomes Verified badge from this property?'
      : 'Mark this property as EboHomes Verified? This tells tenants EboHomes has confirmed real-world facts about it — only do this if you actually have grounds to back that claim.'
    if (!window.confirm(confirmMsg)) return

    setUpdating(true)
    const { data: { user } } = await supabase.auth.getUser()
    const nowIso = new Date().toISOString()

    const { error } = await supabase
      .from('listings')
      .update({
        verified: !current,
        verified_by: !current ? (user?.id ?? null) : null,
        verified_at: !current ? nowIso : null,
      })
      .eq('id', id)

    if (!error) {
      setListings((prev) => prev.map((l) =>
        l.id === id ? { ...l, verified: !current, verified_at: !current ? nowIso : null } : l
      ))
    } else {
      alert('Failed to update verification: ' + error.message)
    }
    setUpdating(false)
  }

  const counts = {
    pending: listings.filter((l) => (l.status ?? 'pending') === 'pending').length,
    approved: listings.filter((l) => l.status === 'approved').length,
    rejected: listings.filter((l) => l.status === 'rejected').length,
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <h1 className="text-2xl font-bold text-foreground mb-1">Property Review / Approval</h1>
      <p className="text-sm text-muted-foreground mb-6">Review property details and approve or reject listings.</p>

      <div className="flex gap-2 mb-6">
        {(['pending', 'approved', 'rejected'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold capitalize transition-colors ${
              tab === t ? 'bg-primary text-primary-foreground' : 'bg-card border border-border text-muted-foreground hover:bg-secondary'
            }`}
          >
            {t} ({counts[t]})
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : filtered.length === 0 ? (
        <div className="bg-card border border-border rounded-lg p-12 text-center text-muted-foreground">
          No {tab} listings.
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
                    {l.verified && <ShieldCheck size={13} className="text-emerald-600 shrink-0" />}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">{l.location_text}</p>
                  <p className="text-[11px] text-muted-foreground">
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
                      {selected.verified && (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                          <ShieldCheck size={12} /> EboHomes Verified
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
                {selected.verified && selected.verified_at && (
                  <p className="text-xs text-emerald-700 mb-3">
                    <ShieldCheck size={12} className="inline mr-1" />
                    Verified on {new Date(selected.verified_at).toLocaleString()}
                  </p>
                )}

                {selected.ownership_doc_url && (
                  <a
                    href={ownershipDocUrl || '#'}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-primary font-medium hover:underline"
                  >
                    <FileEdit size={14} /> View ownership document
                  </a>
                )}
              </div>

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

                <div className="flex flex-col sm:flex-row gap-3">
                  <Button
                    onClick={() => handleApprove(selected.id)}
                    disabled={updating || selected.status === 'approved'}
                    className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold flex items-center justify-center gap-2"
                  >
                    <Check size={16} /> Approve Property
                  </Button>
                  <Button
                    onClick={() => handleReject(selected.id)}
                    disabled={updating || selected.status === 'rejected' || !rejectReason.trim()}
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

              {/* Verification — separate from approval */}
              <div className="bg-card border border-border rounded-lg p-5">
                <h3 className="font-semibold text-foreground mb-1">EboHomes Verification</h3>
                <p className="text-xs text-muted-foreground mb-4">
                  A distinct trust claim from approval — only mark this once you have real grounds (inspection, confirmed ownership, etc.) to back it.
                </p>
                <Button
                  onClick={() => handleToggleVerified(selected.id, !!selected.verified)}
                  disabled={updating}
                  variant="outline"
                  className={`w-full font-semibold flex items-center justify-center gap-2 ${
                    selected.verified ? 'border-emerald-500 text-emerald-700 bg-emerald-50' : 'border-border text-muted-foreground'
                  }`}
                >
                  {selected.verified ? <ShieldOff size={16} /> : <ShieldCheck size={16} />}
                  {selected.verified ? 'Remove Verified Badge' : 'Mark as EboHomes Verified'}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}