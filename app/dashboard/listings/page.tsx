'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Home, Star, MapPin, Bed, Pause, Play, Pencil, Trash2, Plus, Eye, ShieldCheck } from 'lucide-react'
import { supabase } from '@/lib/supabase'

const STATUS_STYLES: Record<string, string> = {
  approved: 'bg-emerald-50 text-emerald-600',
  pending: 'bg-amber-50 text-amber-600',
  rejected: 'bg-red-50 text-red-600',
  paused: 'bg-gray-100 text-gray-600',
}

const STATUS_LABELS: Record<string, string> = {
  approved: 'Live',
  pending: 'Pending Review',
  rejected: 'Rejected',
  paused: 'Paused',
}

export default function MyListingsPage() {
  const router = useRouter()
  const [listings, setListings] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [actioningId, setActioningId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const loadListings = async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setLoading(false)
      return
    }

    const { data, error } = await supabase
      .from('listings')
      .select('*')
      .eq('landlord_id', user.id)
      .order('created_at', { ascending: false })

    if (!error) setListings(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    loadListings()
  }, [])

  const handleTogglePause = async (listing: any) => {
    setActioningId(listing.id)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setActioningId(null)
      return
    }

    const nextStatus = listing.status === 'paused' ? 'approved' : 'paused'

    const { error } = await supabase
      .from('listings')
      .update({ status: nextStatus })
      .eq('id', listing.id)
      .eq('landlord_id', user.id)

    if (!error) {
      setListings((prev) =>
        prev.map((l) => (l.id === listing.id ? { ...l, status: nextStatus } : l))
      )
    } else {
      alert('Failed to update listing: ' + error.message)
    }
    setActioningId(null)
  }

  const handleDelete = async (listingId: string) => {
    setActioningId(listingId)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setActioningId(null)
      return
    }

    const { error } = await supabase
      .from('listings')
      .delete()
      .eq('id', listingId)
      .eq('landlord_id', user.id)

    if (!error) {
      setListings((prev) => prev.filter((l) => l.id !== listingId))
    } else {
      alert('Failed to delete listing: ' + error.message)
    }
    setConfirmDeleteId(null)
    setActioningId(null)
  }

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-40 bg-card rounded-2xl border border-border animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground mb-1">My Properties</h1>
          <p className="text-sm text-muted-foreground">Manage the properties you've listed on EboHomes.</p>
        </div>
        <button
          onClick={() => router.push('/list-property')}
          className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-full px-5 py-2.5 flex items-center gap-2 text-sm"
        >
          <Plus size={16} /> Add New Property
        </button>
      </div>

      {listings.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl p-10 text-center">
          <Home size={32} className="mx-auto text-muted-foreground mb-3" />
          <p className="font-semibold text-foreground mb-1">No properties yet</p>
          <p className="text-sm text-muted-foreground mb-5">You haven't listed any properties. Add your first one to get started.</p>
          <button
            onClick={() => router.push('/list-property')}
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-full px-6 py-2.5 text-sm"
          >
            Add New Property
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {listings.map((listing) => (
            <div key={listing.id} className="bg-card border border-border rounded-2xl overflow-hidden flex">
              <img
                src={listing.photos?.[0] ?? '/placeholder.jpg'}
                alt={listing.property_type}
                className="w-32 h-full object-cover shrink-0"
              />

              <div className="flex-1 p-4 min-w-0">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <p className="font-semibold text-foreground text-sm truncate flex items-center gap-1.5">
                    {listing.property_type}
                    {listing.verified && <ShieldCheck size={13} className="text-emerald-600 shrink-0" />}
                  </p>
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full shrink-0 ${STATUS_STYLES[listing.status] ?? 'bg-gray-100 text-gray-600'}`}>
                    {STATUS_LABELS[listing.status] ?? listing.status}
                  </span>
                </div>

                <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1 truncate">
                  <MapPin size={12} /> {listing.location_text}
                </p>

                <div className="flex items-center gap-3 text-xs text-muted-foreground mb-2">
                  <span className="flex items-center gap-1"><Bed size={12} /> {listing.bedrooms} Beds</span>
                  {listing.featured && (
                    <span className="flex items-center gap-1 text-amber-500"><Star size={12} /> Featured</span>
                  )}
                </div>

                <p className="text-sm font-bold text-primary mb-3">
                  ₦{listing.price_monthly?.toLocaleString()}<span className="text-xs font-medium text-muted-foreground">/month</span>
                </p>

                {listing.status === 'rejected' && listing.rejection_reason && (
                  <p className="text-xs text-destructive mb-3 bg-red-50 rounded-lg px-2.5 py-1.5">
                    <span className="font-semibold">Reason:</span> {listing.rejection_reason}
                  </p>
                )}

                <div className="flex items-center gap-2 flex-wrap">
                  <Link
                    href={`/listing/${listing.id}`}
                    className="flex items-center gap-1 text-xs font-semibold text-foreground border border-border rounded-full px-3 py-1.5 hover:bg-secondary"
                  >
                    <Eye size={12} /> View
                  </Link>

                  <button
                    onClick={() => router.push(`/dashboard/edit/${listing.id}`)}
                    className="flex items-center gap-1 text-xs font-semibold text-primary border border-primary/30 rounded-full px-3 py-1.5 hover:bg-primary/5"
                  >
                    <Pencil size={12} /> Edit
                  </button>

                  <button
                    onClick={() => handleTogglePause(listing)}
                    disabled={actioningId === listing.id || listing.status === 'pending' || listing.status === 'rejected'}
                    className="flex items-center gap-1 text-xs font-semibold text-foreground border border-border rounded-full px-3 py-1.5 hover:bg-secondary disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {listing.status === 'paused' ? <Play size={12} /> : <Pause size={12} />}
                    {listing.status === 'paused' ? 'Resume' : 'Pause'}
                  </button>

                  {!listing.featured && listing.status === 'approved' && (
                    <Link
                      href={`/listing/${listing.id}/feature`}
                      className="flex items-center gap-1 text-xs font-semibold text-amber-600 bg-amber-50 rounded-full px-3 py-1.5 hover:bg-amber-100"
                    >
                      <Star size={12} /> Feature
                    </Link>
                  )}

                  {confirmDeleteId === listing.id ? (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleDelete(listing.id)}
                        disabled={actioningId === listing.id}
                        className="text-xs font-bold text-white bg-red-600 rounded-full px-3 py-1.5"
                      >
                        Confirm Delete
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="text-xs font-semibold text-muted-foreground px-2 py-1.5"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDeleteId(listing.id)}
                      className="flex items-center gap-1 text-xs font-semibold text-red-600 border border-red-200 rounded-full px-3 py-1.5 hover:bg-red-50"
                    >
                      <Trash2 size={12} /> Delete
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}