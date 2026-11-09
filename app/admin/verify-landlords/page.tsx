'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  ShieldCheck, Clock, XCircle, Users, Search, FileText,
  Loader2, Check, X, Phone, MapPin, Building2, Landmark, AlertTriangle,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { getOwnershipSignedUrl } from '@/lib/ownership-docs'
import { verificationBucket, missingItems, type VerificationBucket } from '@/lib/landlord-verification'

type Landlord = {
  id: string
  full_name: string | null
  phone: string | null
  location: string | null
  business_name: string | null
  business_address: string | null
  cac_number: string | null
  account_type: string | null
  representative_name: string | null
  representative_role: string | null
  ownership_doc_url: string | null
  id_document_type: string | null
  id_document_url: string | null
  selfie_url: string | null
  verification_status: string | null
  verified: boolean | null
  badge: string | null
  avatar_url: string | null
  created_at: string
  verification_reviewed_at: string | null
  rejection_reason: string | null
}

type Tab = VerificationBucket

const TAB_LABEL: Record<Tab, string> = {
  pending: 'Pending',
  verified: 'Verified',
  rejected: 'Rejected',
  not_submitted: 'Not submitted',
}

export default function VerifyLandlordsPage() {
  const [landlords, setLandlords] = useState<Landlord[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('pending')
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [updating, setUpdating] = useState(false)
  const [docUrl, setDocUrl] = useState('')
  const [idUrl, setIdUrl] = useState('')
  const [selfieSignedUrl, setSelfieSignedUrl] = useState('')
  const [rejectReason, setRejectReason] = useState('')
  const [actionError, setActionError] = useState('')

  const fetchLandlords = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, phone, location, business_name, business_address, cac_number, account_type, representative_name, representative_role, ownership_doc_url, id_document_type, id_document_url, selfie_url, verification_status, verified, badge, avatar_url, created_at, verification_reviewed_at, rejection_reason')
      .eq('role', 'landlord')
      .order('created_at', { ascending: false })

    if (!error) setLandlords(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchLandlords() }, [fetchLandlords])

  function statusOf(l: Landlord): Tab {
    return verificationBucket(l)
  }

  const filtered = landlords.filter((l) => {
    if (statusOf(l) !== tab) return false
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      l.full_name?.toLowerCase().includes(q) ||
      l.phone?.toLowerCase().includes(q) ||
      l.business_name?.toLowerCase().includes(q)
    )
  })

  const selected = landlords.find((l) => l.id === selectedId) ?? filtered[0]

  useEffect(() => {
    if (filtered.length > 0 && !filtered.find((l) => l.id === selectedId)) {
      setSelectedId(filtered[0].id)
    }
    if (filtered.length === 0) setSelectedId(null)
    setRejectReason('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, landlords, search])

  useEffect(() => {
    setRejectReason('')
    setActionError('')
    const loadDocUrl = async () => {
      setDocUrl('')
      if (!selected?.ownership_doc_url) return

      const signedUrl = await getOwnershipSignedUrl(selected.ownership_doc_url, selected.id)
      if (signedUrl) setDocUrl(signedUrl)
    }
    loadDocUrl()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id])

  useEffect(() => {
    const loadIdUrls = async () => {
      setIdUrl('')
      setSelfieSignedUrl('')
      if (!selected) return
      if (selected.id_document_url) {
        const u = await getOwnershipSignedUrl(selected.id_document_url, selected.id)
        if (u) setIdUrl(u)
      }
      if (selected.selfie_url) {
        const u = await getOwnershipSignedUrl(selected.selfie_url, selected.id)
        if (u) setSelfieSignedUrl(u)
      }
    }
    loadIdUrls()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id])

  const counts = {
    pending: landlords.filter((l) => statusOf(l) === 'pending').length,
    verified: landlords.filter((l) => statusOf(l) === 'verified').length,
    rejected: landlords.filter((l) => statusOf(l) === 'rejected').length,
    not_submitted: landlords.filter((l) => statusOf(l) === 'not_submitted').length,
  }

  async function decide(id: string, decision: 'verify' | 'reject') {
    setActionError('')
    const target = landlords.find((l) => l.id === id)
    if (!target || missingItems(target).length > 0) {
      setActionError('This landlord has not submitted every required item.')
      return
    }
    const reason = rejectReason.trim()
    if (decision === 'reject' && !reason) {
      setActionError('Please enter a rejection reason before rejecting.')
      return
    }
    setUpdating(true)
    // Server-side decision: checks admin, state and required items, and records the reviewer.
    const { error } = await supabase.rpc('admin_decide_landlord_verification', {
      p_landlord: id,
      p_decision: decision,
      p_reason: decision === 'reject' ? reason : null,
    })
    if (error) {
      setActionError((decision === 'verify' ? 'Failed to verify: ' : 'Failed to reject: ') + error.message)
      setUpdating(false)
      return
    }
    const nowIso = new Date().toISOString()
    setLandlords((prev) => prev.map((l) =>
      l.id === id
        ? decision === 'verify'
          ? { ...l, verification_status: 'verified', verified: true, verification_reviewed_at: nowIso, rejection_reason: null }
          : { ...l, verification_status: 'rejected', verified: false, verification_reviewed_at: nowIso, rejection_reason: reason }
        : l
    ))
    if (decision === 'reject') setRejectReason('')
    setUpdating(false)
  }

  const handleVerify = (id: string) => decide(id, 'verify')
  const handleReject = (id: string) => decide(id, 'reject')

  const cards = [
    { label: 'Pending Review', value: counts.pending, icon: Clock, tint: 'text-amber-600 bg-amber-50' },
    { label: 'Verified Landlords', value: counts.verified, icon: ShieldCheck, tint: 'text-emerald-600 bg-emerald-50' },
    { label: 'Rejected', value: counts.rejected, icon: XCircle, tint: 'text-red-600 bg-red-50' },
    { label: 'Not submitted', value: counts.not_submitted, icon: AlertTriangle, tint: 'text-slate-600 bg-slate-100' },
    { label: 'Total Landlords', value: landlords.length, icon: Users, tint: 'text-primary bg-primary/10' },
  ]

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold text-foreground mb-1">Verify Landlords</h1>
      <p className="text-sm text-muted-foreground mb-6">Review and verify landlord registrations and documents.</p>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        {cards.map((c) => (
          <div key={c.label} className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${c.tint}`}>
              <c.icon size={18} />
            </div>
            <div>
              <p className="text-xl font-bold text-foreground">{c.value.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">{c.label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="relative mb-4">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, phone or business name..."
          className="w-full h-10 pl-9 pr-3 rounded-lg border border-border bg-background text-sm"
        />
      </div>

      <div className="flex gap-2 mb-6">
        {(['pending', 'verified', 'rejected', 'not_submitted'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              tab === t ? 'bg-primary text-primary-foreground' : 'bg-card border border-border text-muted-foreground hover:bg-secondary'
            }`}
          >
            {TAB_LABEL[t]} ({counts[t]})
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-primary" size={24} /></div>
      ) : filtered.length === 0 ? (
        <div className="bg-card border border-border rounded-lg p-12 text-center text-muted-foreground">
          No landlords in “{TAB_LABEL[tab]}”.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="space-y-3 max-h-[75vh] overflow-y-auto pr-1">
            {filtered.map((l) => (
              <button
                key={l.id}
                onClick={() => setSelectedId(l.id)}
                className={`w-full text-left bg-card border rounded-lg p-3 flex gap-3 transition-colors ${
                  selected?.id === l.id ? 'border-primary bg-primary/5' : 'border-border hover:bg-secondary'
                }`}
              >
                {l.avatar_url ? (
                  <img src={l.avatar_url} alt="" className="w-12 h-12 rounded-full object-cover bg-secondary shrink-0" />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold shrink-0">
                    {l.full_name?.[0]?.toUpperCase() ?? '?'}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{l.full_name ?? 'Unnamed landlord'}</p>
                  <p className="text-xs text-muted-foreground truncate">{l.business_name ?? l.phone ?? ''}</p>
                  <p className="text-xs text-muted-foreground">
                    Joined {new Date(l.created_at).toLocaleDateString()}
                  </p>
                </div>
              </button>
            ))}
          </div>

          {selected && (
            <div className="lg:col-span-2 space-y-4">
              <div className="bg-card border border-border rounded-lg p-5">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    {selected.avatar_url ? (
                      <img src={selected.avatar_url} alt="" className="w-14 h-14 rounded-full object-cover" />
                    ) : (
                      <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-lg">
                        {selected.full_name?.[0]?.toUpperCase() ?? '?'}
                      </div>
                    )}
                    <div>
                      <h2 className="text-lg font-bold text-foreground">{selected.full_name ?? 'Unnamed landlord'}</h2>
                      {selected.phone && (
                        <p className="text-sm text-muted-foreground flex items-center gap-1">
                          <Phone size={12} /> {selected.phone}
                        </p>
                      )}
                    </div>
                  </div>
                  <span className={`text-xs font-medium px-2 py-1 rounded-full capitalize shrink-0 ${
                    statusOf(selected) === 'verified' ? 'bg-emerald-50 text-emerald-700'
                    : statusOf(selected) === 'rejected' ? 'bg-red-50 text-red-700'
                    : 'bg-amber-50 text-amber-700'
                  }`}>
                    {TAB_LABEL[statusOf(selected)]}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  {selected.location && (
                    <p className="flex items-center gap-2 text-muted-foreground">
                      <MapPin size={14} className="text-primary shrink-0" /> {selected.location}
                    </p>
                  )}
                  {selected.business_name && (
                    <p className="flex items-center gap-2 text-muted-foreground">
                      <Building2 size={14} className="text-primary shrink-0" /> {selected.business_name}
                    </p>
                  )}
                  {selected.business_address && (
                    <p className="flex items-center gap-2 text-muted-foreground sm:col-span-2">
                      <MapPin size={14} className="text-primary shrink-0" /> {selected.business_address}
                    </p>
                  )}
                  {selected.account_type === 'company' && (
                    <p className="sm:col-span-2">
                      <span className="text-muted-foreground">Company. Representative:</span>{' '}
                      <span className="font-medium text-foreground">
                        {selected.representative_name ?? '—'} ({selected.representative_role ?? '—'})
                      </span>
                    </p>
                  )}
                  {selected.cac_number && (
                    <p><span className="text-muted-foreground">CAC Number:</span> <span className="font-medium text-foreground">{selected.cac_number}</span></p>
                  )}
                  {selected.badge && (
                    <p><span className="text-muted-foreground">Badge:</span> <span className="font-medium text-foreground">{selected.badge}</span></p>
                  )}
                </div>

                {(statusOf(selected) === 'verified' || statusOf(selected) === 'rejected') && selected.verification_reviewed_at && (
                  <p className="text-xs text-muted-foreground mt-3 pt-3 border-t border-border">
                    {statusOf(selected) === 'verified' ? 'Verified' : 'Rejected'} on {new Date(selected.verification_reviewed_at).toLocaleString()}
                  </p>
                )}
                {statusOf(selected) === 'rejected' && selected.rejection_reason && (
                  <p className="text-xs text-destructive mt-1">
                    <span className="font-semibold">Reason:</span> {selected.rejection_reason}
                  </p>
                )}
              </div>

              <div className="bg-card border border-border rounded-lg p-4 text-sm text-muted-foreground flex items-start gap-3">
                <Landmark size={16} className="text-primary mt-0.5 shrink-0" />
                <p>
                  Payout accounts are reviewed separately on the{' '}
                  <a href="/admin/payout-accounts" className="font-semibold text-primary underline">Payout accounts</a> page.
                  Check the account name matches this landlord&apos;s identity there.
                </p>
              </div>

              <div className="bg-card border border-border rounded-lg p-5">
                <h3 className="font-semibold text-foreground mb-3">Documents</h3>
                <div className="mb-4 space-y-2 text-sm">
                  <p>
                    <span className="text-muted-foreground block text-xs">ID type</span>
                    {selected.id_document_type ?? '—'}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {idUrl ? (
                      <a href={idUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm text-primary font-medium hover:underline border border-border rounded-lg px-3 py-2">
                        <FileText size={15} /> View government ID
                      </a>
                    ) : (
                      <span className="text-muted-foreground">No ID uploaded</span>
                    )}
                    {selfieSignedUrl ? (
                      <a href={selfieSignedUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm text-primary font-medium hover:underline border border-border rounded-lg px-3 py-2">
                        <FileText size={15} /> View selfie
                      </a>
                    ) : (
                      <span className="text-muted-foreground">No selfie uploaded</span>
                    )}
                  </div>
                </div>

                {docUrl ? (
                  <a href={docUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm text-primary font-medium hover:underline border border-border rounded-lg px-3 py-2">
                    <FileText size={15} /> View ownership document
                  </a>
                ) : (
                  <p className="text-sm text-muted-foreground">No ownership document uploaded</p>
                )}
              </div>

              {statusOf(selected) === 'not_submitted' && (
                <div className="bg-card border border-border rounded-lg p-5 text-sm">
                  <p className="font-semibold text-foreground mb-1">Not submitted yet</p>
                  <p className="text-muted-foreground">Still missing: {missingItems(selected).join(', ')}. This landlord cannot be verified until everything is submitted.</p>
                </div>
              )}

              {statusOf(selected) === 'pending' && (
                <div className="bg-card border border-border rounded-lg p-5 space-y-3">
                  <label className="block">
                    <span className="text-xs font-medium text-muted-foreground">Rejection reason (required to reject)</span>
                    <textarea
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      rows={2}
                      placeholder="e.g. CAC number doesn't match business name"
                      className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
                    />
                  </label>
                  {actionError && (
                    <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm font-medium text-destructive">
                      {actionError}
                    </p>
                  )}
                  <div className="flex flex-col sm:flex-row gap-3">
                    <button
                      onClick={() => handleVerify(selected.id)}
                      disabled={updating}
                      className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-lg py-2.5 flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {updating ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Verify Landlord
                    </button>
                    <button
                      onClick={() => handleReject(selected.id)}
                      disabled={updating || !rejectReason.trim()}
                      className="flex-1 border border-destructive text-destructive hover:bg-destructive/10 font-semibold rounded-lg py-2.5 flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      <X size={16} /> Reject
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
