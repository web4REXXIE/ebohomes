'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  ShieldCheck, Clock, XCircle, Users, Search, FileText,
  Loader2, Check, X, Phone, MapPin, Building2, Landmark,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'

type Landlord = {
  id: string
  full_name: string | null
  phone: string | null
  location: string | null
  business_name: string | null
  business_address: string | null
  cac_number: string | null
  bank_name: string | null
  bank_account_name: string | null
  bank_account_number: string | null
  ownership_doc_url: string | null
  verification_status: string | null
  verified: boolean | null
  badge: string | null
  avatar_url: string | null
  created_at: string
}

type Tab = 'pending' | 'verified' | 'rejected'

export default function VerifyLandlordsPage() {
  const [landlords, setLandlords] = useState<Landlord[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('pending')
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [updating, setUpdating] = useState(false)

  const fetchLandlords = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'landlord')
      .order('created_at', { ascending: false })

    if (!error) setLandlords(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchLandlords() }, [fetchLandlords])

  function statusOf(l: Landlord): Tab {
    if (l.verification_status === 'verified' || l.verified === true) return 'verified'
    if (l.verification_status === 'rejected') return 'rejected'
    return 'pending' // covers null, 'pending', or anything unrecognized
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, landlords, search])

  const counts = {
    pending: landlords.filter((l) => statusOf(l) === 'pending').length,
    verified: landlords.filter((l) => statusOf(l) === 'verified').length,
    rejected: landlords.filter((l) => statusOf(l) === 'rejected').length,
  }

  async function handleVerify(id: string) {
    setUpdating(true)
    const { error } = await supabase
      .from('profiles')
      .update({ verification_status: 'verified', verified: true })
      .eq('id', id)
    if (!error) {
      setLandlords((prev) => prev.map((l) => (l.id === id ? { ...l, verification_status: 'verified', verified: true } : l)))
    }
    setUpdating(false)
  }

  async function handleReject(id: string) {
    setUpdating(true)
    const { error } = await supabase
      .from('profiles')
      .update({ verification_status: 'rejected', verified: false })
      .eq('id', id)
    if (!error) {
      setLandlords((prev) => prev.map((l) => (l.id === id ? { ...l, verification_status: 'rejected', verified: false } : l)))
    }
    setUpdating(false)
  }

  const cards = [
    { label: 'Pending Review', value: counts.pending, icon: Clock, tint: 'text-amber-600 bg-amber-50' },
    { label: 'Verified Landlords', value: counts.verified, icon: ShieldCheck, tint: 'text-emerald-600 bg-emerald-50' },
    { label: 'Rejected', value: counts.rejected, icon: XCircle, tint: 'text-red-600 bg-red-50' },
    { label: 'Total Landlords', value: landlords.length, icon: Users, tint: 'text-primary bg-primary/10' },
  ]

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold text-foreground mb-1">Verify Landlords</h1>
      <p className="text-sm text-muted-foreground mb-6">Review and verify landlord registrations and documents.</p>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
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

      {/* Search */}
      <div className="relative mb-4">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, phone or business name..."
          className="w-full h-10 pl-9 pr-3 rounded-lg border border-border bg-background text-sm"
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {(['pending', 'verified', 'rejected'] as const).map((t) => (
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
        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-primary" size={24} /></div>
      ) : filtered.length === 0 ? (
        <div className="bg-card border border-border rounded-lg p-12 text-center text-muted-foreground">
          No {tab} landlords.
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
                {l.avatar_url ? (
                  <img src={l.avatar_url} className="w-12 h-12 rounded-full object-cover bg-secondary shrink-0" />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold shrink-0">
                    {l.full_name?.[0]?.toUpperCase() ?? '?'}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{l.full_name ?? 'Unnamed landlord'}</p>
                  <p className="text-xs text-muted-foreground truncate">{l.business_name ?? l.phone ?? ''}</p>
                  <p className="text-[11px] text-muted-foreground">
                    Joined {new Date(l.created_at).toLocaleDateString()}
                  </p>
                </div>
              </button>
            ))}
          </div>

          {/* Detail */}
          {selected && (
            <div className="lg:col-span-2 space-y-4">
              <div className="bg-card border border-border rounded-lg p-5">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    {selected.avatar_url ? (
                      <img src={selected.avatar_url} className="w-14 h-14 rounded-full object-cover" />
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
                    {statusOf(selected)}
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
                  {selected.cac_number && (
                    <p><span className="text-muted-foreground">CAC Number:</span> <span className="font-medium text-foreground">{selected.cac_number}</span></p>
                  )}
                  {selected.badge && (
                    <p><span className="text-muted-foreground">Badge:</span> <span className="font-medium text-foreground">{selected.badge}</span></p>
                  )}
                </div>
              </div>

              {/* Bank details */}
              {(selected.bank_name || selected.bank_account_name || selected.bank_account_number) && (
                <div className="bg-card border border-border rounded-lg p-5">
                  <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                    <Landmark size={16} className="text-primary" /> Bank Details
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                    <p><span className="text-muted-foreground block text-xs">Bank</span> {selected.bank_name ?? '—'}</p>
                    <p><span className="text-muted-foreground block text-xs">Account Name</span> {selected.bank_account_name ?? '—'}</p>
                    <p><span className="text-muted-foreground block text-xs">Account Number</span> {selected.bank_account_number ?? '—'}</p>
                  </div>
                </div>
              )}

              {/* Documents */}
              <div className="bg-card border border-border rounded-lg p-5">
                <h3 className="font-semibold text-foreground mb-3">Documents</h3>
                {selected.ownership_doc_url ? (
                  <a
                    href={selected.ownership_doc_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 text-sm text-primary font-medium hover:underline border border-border rounded-lg px-3 py-2"
                  >
                    <FileText size={15} /> View submitted document
                  </a>
                ) : (
                  <p className="text-sm text-muted-foreground">No document uploaded yet.</p>
                )}
              </div>

              {/* Actions */}
              <div className="bg-card border border-border rounded-lg p-5">
                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    onClick={() => handleVerify(selected.id)}
                    disabled={updating || statusOf(selected) === 'verified'}
                    className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-lg py-2.5 flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <Check size={16} /> Verify Landlord
                  </button>
                  <button
                    onClick={() => handleReject(selected.id)}
                    disabled={updating || statusOf(selected) === 'rejected'}
                    className="flex-1 border border-destructive text-destructive hover:bg-destructive/10 font-semibold rounded-lg py-2.5 flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <X size={16} /> Reject
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}