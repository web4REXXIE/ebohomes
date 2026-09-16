'use client'

import { useEffect, useState } from 'react'
import { Check, X, FileEdit, Home as HomeIcon } from 'lucide-react'
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, listings])

  const handleToggleFeatured = async (id: string, current: boolean) => {
    const { error } = await supabase.from('listings').update({ featured: !current }).eq('id', id)
    if (!error) {
      setListings((prev) => prev.map((l) => (l.id === id ? { ...l, featured: !current } : l)))
    }
  }

  const handleApprove = async (id: string) => {
    const { error } = await supabase.from('listings').update({ status: 'approved' }).eq('id', id)
    if (!error) setListings((prev) => prev.map((l) => (l.id === id ? { ...l, status: 'approved' } : l)))
  }

  const handleReject = async (id: string) => {
    const { error } = await supabase.from('listings').update({ status: 'rejected' }).eq('id', id)
    if (!error) setListings((prev) => prev.map((l) => (l.id === id ? { ...l, status: 'rejected' } : l)))
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
                  <p className="text-sm font-semibold text-foreground truncate">{l.title ?? 'Untitled listing'}</p>
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
                    <h2 className="text-xl font-bold text-foreground">{selected.title ?? 'Untitled listing'}</h2>
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

                {selected.ownership_doc_url && (
                  <a
                    href={selected.ownership_doc_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-primary font-medium hover:underline mb-4"
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

                <div className="flex flex-col sm:flex-row gap-3">
                  <Button
                    onClick={() => handleApprove(selected.id)}
                    disabled={selected.status === 'approved'}
                    className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold flex items-center justify-center gap-2"
                  >
                    <Check size={16} /> Approve Property
                  </Button>
                  <Button
                    onClick={() => handleReject(selected.id)}
                    disabled={selected.status === 'rejected'}
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
            </div>
          )}
        </div>
      )}
    </div>
  )
}