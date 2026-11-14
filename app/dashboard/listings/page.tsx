'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { Home, Star, Pause, Play, Pencil, Trash2, Plus, Eye, CheckCircle2, X, MessageCircle, ShieldCheck, Search, CalendarCheck } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useInspectedIds } from '@/lib/use-inspected-ids'
import { PropertySummary, type PropertyLite } from '@/components/property-summary'
import { displayTitle, listingIsLive } from '@/lib/property-display'
import {
  GROUP_HELP, GROUP_ORDER, GROUP_TITLE, groupListings, isNewlyApproved, listingGroup, listingStatusInfo,
  type ListingGroup,
} from '@/lib/listing-status'
import { TONE_CLASS } from '@/lib/viewing-status'
import { OWNER_LISTING_COLUMNS } from '@/lib/listing-columns'
import { authorityStatusInfo } from '@/lib/listing-authority'

const AUTHORITY_TONE: Record<string, string> = {
  neutral: 'border-slate-300 bg-slate-50 text-slate-800',
  good: 'border-emerald-300 bg-emerald-50 text-emerald-900',
  warn: 'border-amber-300 bg-amber-50 text-amber-900',
  bad: 'border-red-300 bg-red-50 text-red-900',
}

const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000
const ONE_DAY = 24 * 60 * 60 * 1000
const FRESH_DAYS = 14

const actionBtn =
  'inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40'

// How long ago the landlord last said "still available". null if the date could not be read.
function freshnessOf(listing: any): { left: number; date: string } | null {
  const t = listing?.availability_confirmed_at ? new Date(listing.availability_confirmed_at).getTime() : NaN
  if (!Number.isFinite(t)) return null
  const days = Math.floor((Date.now() - t) / ONE_DAY)
  const date = new Date(t).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })
  return { left: FRESH_DAYS - days, date }
}

export default function MyListingsPage() {
  const [listings, setListings] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [actioningId, setActioningId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [seenMs, setSeenMs] = useState<number>(Date.now() - SEVEN_DAYS)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  // Search and filter only change what is shown. They never change the data or any listing.
  const [query, setQuery] = useState('')
  const [groupFilter, setGroupFilter] = useState<'all' | ListingGroup>('all')
  const inspected = useInspectedIds(listings.map((l) => l.id))

  const loadListings = async () => {
    setLoading(true)
    setLoadError(false)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setLoading(false)
      return
    }
    setUserId(user.id)
    try {
      const saved = window.localStorage.getItem(`eb_listings_seen:${user.id}`)
      const n = saved ? Number(saved) : NaN
      if (Number.isFinite(n)) setSeenMs(n)
    } catch {
      // Storage can be blocked. The banner then shows approvals from the last 7 days.
    }

    const { data, error } = await supabase
      .from('listings')
      .select(`${OWNER_LISTING_COLUMNS}, properties(public_id)`)
      .eq('landlord_id', user.id)
      .order('created_at', { ascending: false })

    if (error) setLoadError(true)
    else setListings(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    loadListings()
    // Coming back from the authority page after sending evidence
    const params = new URLSearchParams(window.location.search)
    if (params.get('sent') === 'authority') {
      setMsg({ ok: true, text: 'Sent to EboHomes for review. We will notify you when there is a decision. Your listing goes live once it is accepted.' })
      window.history.replaceState(null, '', '/dashboard/listings')
    }
  }, [])

  const handleTogglePause = async (listing: any) => {
    setActioningId(listing.id)
    setMsg(null)
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
      const nowIso = new Date().toISOString()
      setListings((prev) =>
        prev.map((l) =>
          l.id === listing.id
            ? nextStatus === 'approved'
              // Going live again counts as a fresh confirmation (the database does the same).
              ? { ...l, status: nextStatus, availability_confirmed_at: nowIso, freshness_paused_at: null }
              : { ...l, status: nextStatus }
            : l
        )
      )
      const name = displayTitle(listing)
      setMsg({
        ok: true,
        text:
          nextStatus === 'paused'
            ? `"${name}" is paused. Tenants cannot see it until you resume it.`
            : `"${name}" is live again. Tenants can see it.`,
      })
    } else {
      setMsg({ ok: false, text: 'Could not update the property: ' + error.message })
    }
    setActioningId(null)
  }

  // "Yes, still available". The database checks the listing is really yours.
  // It also puts a listing back live if the 14-day check paused it.
  const handleConfirmAvailable = async (listing: any) => {
    setActioningId(listing.id)
    setMsg(null)
    const { data, error } = await supabase.rpc('confirm_listing_available', { p_listing: listing.id })
    if (error) {
      setMsg({ ok: false, text: 'Could not confirm: ' + error.message })
    } else {
      const when = typeof data === 'string' ? data : new Date().toISOString()
      setListings((prev) =>
        prev.map((l) =>
          l.id === listing.id
            ? { ...l, status: 'approved', availability_confirmed_at: when, freshness_paused_at: null }
            : l
        )
      )
      setMsg({ ok: true, text: `Thank you. "${displayTitle(listing)}" is confirmed as available and stays live.` })
    }
    setActioningId(null)
  }

  const handleDelete = async (listingId: string) => {
    setActioningId(listingId)
    setMsg(null)
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
      setMsg({ ok: true, text: 'The property was deleted.' })
    } else if (error.code === '23503') {
      setMsg({ ok: false, text: 'This property has authority evidence on record, so it cannot be deleted. You can pause it instead, or contact EboHomes.' })
    } else {
      setMsg({ ok: false, text: 'Could not delete the property: ' + error.message })
    }
    setConfirmDeleteId(null)
    setActioningId(null)
  }

  const dismissBanner = () => {
    const now = Date.now()
    setSeenMs(now)
    try {
      if (userId) window.localStorage.setItem(`eb_listings_seen:${userId}`, String(now))
    } catch {
      // Ignore blocked storage.
    }
  }

  const visibleListings = useMemo(() => {
    const q = query.trim().toLowerCase()
    return listings.filter((l) => {
      if (groupFilter !== 'all' && listingGroup(l.status) !== groupFilter) return false
      if (!q) return true
      return `${displayTitle(l)} ${l.location_text ?? ''}`.toLowerCase().includes(q)
    })
  }, [listings, query, groupFilter])
  const groups = useMemo(() => groupListings(visibleListings), [visibleListings])
  const filtering = query.trim() !== '' || groupFilter !== 'all'
  const newlyApproved = useMemo(() => listings.filter((l) => isNewlyApproved(l, seenMs)), [listings, seenMs])
  const newIds = useMemo(() => new Set(newlyApproved.map((l) => l.id)), [newlyApproved])

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8" aria-busy="true" aria-label="Loading your properties">
        <div className="mb-6 h-8 w-48 animate-pulse rounded bg-secondary" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="animate-pulse space-y-3 rounded-2xl border border-border bg-card p-4">
              <div className="h-5 w-28 rounded-full bg-secondary" />
              <div className="flex gap-3">
                <div className="h-16 w-20 rounded-lg bg-secondary" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-2/3 rounded bg-secondary" />
                  <div className="h-3 w-1/2 rounded bg-secondary" />
                </div>
              </div>
              <div className="h-10 rounded-lg bg-secondary" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="mb-1 text-2xl font-bold text-foreground">My Properties</h1>
          <p className="text-sm text-muted-foreground">See which of your properties are live, waiting or need action.</p>
        </div>
        <Link
          href="/list-property"
          className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          <Plus size={16} aria-hidden /> Add new property
        </Link>
      </div>

      {loadError && (
        <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm font-medium text-red-900">
          <span>We could not load your properties. Your properties are not lost.</span>
          <button onClick={loadListings} className="focus-ring min-h-11 rounded-full border border-red-300 px-4 text-xs font-bold">
            Try again
          </button>
        </div>
      )}

      {msg && (
        <div
          role={msg.ok ? 'status' : 'alert'}
          className={`mb-4 flex items-start justify-between gap-3 rounded-lg border p-3 text-sm font-medium ${
            msg.ok ? 'border-blue-300 bg-blue-50 text-blue-900' : 'border-red-300 bg-red-50 text-red-900'
          }`}
        >
          <span>{msg.text}</span>
          <button onClick={() => setMsg(null)} aria-label="Close message" className="flex min-h-9 min-w-9 items-center justify-center">
            <X size={16} aria-hidden />
          </button>
        </div>
      )}

      {newlyApproved.length > 0 && (
        <div className="mb-5 rounded-xl border-2 border-emerald-400 bg-emerald-50 p-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-700" size={22} aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-base font-bold text-emerald-900">
                {newlyApproved.length === 1
                  ? 'Your property was approved and is now live'
                  : `${newlyApproved.length} of your properties were approved and are now live`}
              </p>
              <p className="mt-1 text-sm text-emerald-900">
                Approved means EboHomes checked the listing and tenants can now find it, request viewings and apply.
              </p>
              <ul className="mt-3 space-y-2">
                {newlyApproved.map((l) => (
                  <li key={l.id} className="rounded-lg border border-emerald-300 bg-white p-3">
                    <p className="truncate text-sm font-bold text-foreground">{displayTitle(l)}</p>
                    {l.location_text && <p className="truncate text-xs text-muted-foreground">{l.location_text}</p>}
                    <div className="mt-2 flex flex-wrap gap-2">
                      {listingIsLive(l.status) && (
                        <Link href={`/listing/${l.id}`} className="inline-flex min-h-11 items-center rounded-full bg-primary px-4 text-xs font-bold text-primary-foreground">
                          View live listing
                        </Link>
                      )}
                      <a href={`#listing-${l.id}`} className="inline-flex min-h-11 items-center rounded-full border border-emerald-400 px-4 text-xs font-bold text-emerald-900">
                        Find it below
                      </a>
                    </div>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-sm text-emerald-900">
                Next: when a tenant asks to see a property, the request appears under{' '}
                <Link href="/dashboard/viewings" className="font-bold underline">Viewings</Link>.
              </p>
              <button onClick={dismissBanner} className="mt-3 min-h-11 rounded-full border border-emerald-500 px-4 text-xs font-bold text-emerald-900">
                OK, got it
              </button>
            </div>
          </div>
        </div>
      )}

      {listings.length === 0 && !loadError ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
          <Home size={32} className="mx-auto mb-3 text-muted-foreground" aria-hidden />
          <p className="mb-1 font-semibold text-foreground">No properties yet</p>
          <p className="mb-5 text-sm text-muted-foreground">You haven&apos;t listed any properties. Add your first one to get started.</p>
          <Link
            href="/list-property"
            className="focus-ring inline-flex min-h-11 items-center rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Add new property
          </Link>
        </div>
      ) : (
        <>
          {listings.length > 0 && (
            <>
            <div role="search" className="mb-4 flex flex-col gap-2 sm:flex-row">
              <div className="relative min-w-0 flex-1">
                <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by title or location"
                  aria-label="Search your properties by title or location"
                  className="focus-ring h-11 w-full rounded-full border border-border bg-card pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground"
                />
              </div>
              <select
                value={groupFilter}
                onChange={(e) => setGroupFilter(e.target.value as 'all' | ListingGroup)}
                aria-label="Show properties by status"
                className="focus-ring h-11 rounded-full border border-border bg-card px-4 text-sm text-foreground"
              >
                <option value="all">All statuses</option>
                {GROUP_ORDER.map((g) => (
                  <option key={g} value={g}>{GROUP_TITLE[g]}</option>
                ))}
              </select>
            </div>
            <p className="sr-only" role="status" aria-live="polite">
              {filtering ? `${visibleListings.length} of ${listings.length} properties shown` : ''}
            </p>

            {visibleListings.length === 0 && (
              <div className="mb-8 rounded-2xl border border-dashed border-border bg-card p-8 text-center">
                <p className="mb-1 font-semibold text-foreground">No properties match</p>
                <p className="mb-4 text-sm text-muted-foreground">Try a different word or choose All statuses.</p>
                <button
                  onClick={() => { setQuery(''); setGroupFilter('all') }}
                  className="focus-ring min-h-11 rounded-full border border-border px-5 text-sm font-semibold text-foreground hover:bg-secondary"
                >
                  Clear search and filter
                </button>
              </div>
            )}
            </>
          )}

          <nav aria-label="Jump to a group" className="mb-6 flex flex-wrap gap-2">
            {GROUP_ORDER.filter((g) => groups[g].length > 0).map((g) => (
              <a key={g} href={`#group-${g}`} className="inline-flex min-h-11 items-center rounded-full border border-border bg-card px-4 text-xs font-bold text-foreground">
                {GROUP_TITLE[g]} ({groups[g].length})
              </a>
            ))}
          </nav>

          {GROUP_ORDER.filter((g) => groups[g].length > 0).map((g: ListingGroup) => (
            <section key={g} id={`group-${g}`} className="mb-8 scroll-mt-24">
              <h2 className="text-lg font-bold text-foreground">{GROUP_TITLE[g]} ({groups[g].length})</h2>
              <p className="mb-3 text-sm text-muted-foreground">{GROUP_HELP[g]}</p>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {groups[g].map((listing) => {
                  const info = listingStatusInfo(listing.status)
                  const isNew = newIds.has(listing.id)
                  const live = listingIsLive(listing.status)
                  const busy = actioningId === listing.id
                  const auth = authorityStatusInfo(listing.authority_status)
                  const authAction = listing.authority_status === 'accepted' ? 'Authority details' : listing.authority_status === 'needs_evidence' || listing.authority_status === 'rejected' ? 'Fix authority' : listing.authority_status === 'submitted' || listing.authority_status === 'on_hold' ? 'View authority' : 'Add authority evidence'
                  const fresh = freshnessOf(listing)
                  const pausedByCheck = listing.status === 'paused' && !!listing.freshness_paused_at
                  const showFreshness = pausedByCheck || (listing.status === 'approved' && !!fresh)
                  const dueSoon = !!fresh && fresh.left <= 4
                  return (
                    <div
                      key={listing.id}
                      id={`listing-${listing.id}`}
                      className={`scroll-mt-24 rounded-2xl border bg-card p-4 ${isNew ? 'border-2 border-emerald-400 ring-4 ring-emerald-100' : 'border-border'}`}
                    >
                      <div className="mb-3 flex flex-wrap items-center gap-2">
                        <span className={`inline-block rounded-full border px-2.5 py-1 text-xs font-bold ${TONE_CLASS[info.tone]}`}>
                          {info.label}
                        </span>
                        {isNew && (
                          <span className="inline-block rounded-full bg-emerald-700 px-2.5 py-1 text-xs font-bold text-white">Just approved</span>
                        )}
                        {listing.featured && (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700"><Star size={12} aria-hidden /> Featured</span>
                        )}
                      </div>

                      <PropertySummary
                        compact
                        listing={listing as PropertyLite}
                        inspected={inspected.has(listing.id)}
                        href={live ? `/listing/${listing.id}` : undefined}
                      />

                      {showFreshness && (
                        <div
                          className={`mt-3 rounded-lg border-2 px-3 py-3 text-sm ${
                            pausedByCheck || dueSoon ? 'border-amber-400 bg-amber-50 text-amber-950' : 'border-emerald-300 bg-emerald-50 text-emerald-950'
                          }`}
                        >
                          <p className="flex items-center gap-1.5 font-bold">
                            <CalendarCheck size={15} aria-hidden /> Is this property still available?
                          </p>
                          <p className="mt-1 text-xs">
                            {pausedByCheck
                              ? 'It was paused because you did not confirm in time. Confirm to put it back on the market.'
                              : fresh && fresh.left > 0
                                ? `Last confirmed on ${fresh.date}. Please confirm again within ${fresh.left} ${fresh.left === 1 ? 'day' : 'days'}, or it will be paused.`
                                : 'Your confirmation is overdue. The listing will be paused at the next check unless you confirm now.'}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <button
                              onClick={() => handleConfirmAvailable(listing)}
                              disabled={busy}
                              className="min-h-11 rounded-full bg-primary px-4 text-xs font-bold text-primary-foreground disabled:opacity-50"
                            >
                              {busy ? 'Please wait…' : 'Yes, still available'}
                            </button>
                            {listing.status === 'approved' && (
                              <button
                                onClick={() => handleTogglePause(listing)}
                                disabled={busy}
                                className="min-h-11 rounded-full border border-border bg-card px-4 text-xs font-bold text-foreground disabled:opacity-50"
                              >
                                No, it is taken
                              </button>
                            )}
                          </div>
                          {listing.status === 'approved' && (
                            <p className="mt-2 text-xs text-muted-foreground">
                              &quot;No, it is taken&quot; pauses the listing so tenants stop seeing it.
                            </p>
                          )}
                        </div>
                      )}

                      <div className={`mt-3 rounded-lg border px-3 py-2 text-xs ${AUTHORITY_TONE[auth.tone]}`}>
                        <p className="flex items-center gap-1.5 font-bold"><ShieldCheck size={13} aria-hidden /> {auth.label}</p>
                        <p className="mt-0.5">{auth.detail}</p>
                      </div>

                      <div className="mt-3 space-y-1 text-sm">
                        <p className="text-foreground">{info.meaning}</p>
                        <p className="font-semibold text-foreground">Next: <span className="font-normal">{info.next}</span></p>
                      </div>

                      {listing.status === 'rejected' && listing.rejection_reason && (
                        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-900">
                          <span className="font-semibold">Reason from EboHomes:</span> {listing.rejection_reason}
                        </p>
                      )}
                      {listing.status === 'suspended' && listing.suspension_reason && (
                        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-900">
                          <span className="font-semibold">Reason from EboHomes:</span> {listing.suspension_reason}
                        </p>
                      )}

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {live && (
                          <Link href={`/listing/${listing.id}`} className={`${actionBtn} border-border text-foreground hover:bg-secondary`}>
                            <Eye size={12} aria-hidden /> View live listing
                          </Link>
                        )}

                        <Link
                          href={`/dashboard/edit/${listing.id}`}
                          className={`${actionBtn} border-primary/30 text-primary hover:bg-primary/5`}
                        >
                          <Pencil size={12} aria-hidden /> Edit
                        </Link>

                        <Link
                          href={`/dashboard/authority/${listing.id}`}
                          className={`${actionBtn} ${listing.authority_status === 'accepted' ? 'border-border text-foreground hover:bg-secondary' : 'border-primary bg-primary/5 text-primary hover:bg-primary/10'}`}
                        >
                          <ShieldCheck size={12} aria-hidden /> {authAction}
                        </Link>

                        {(listing.status === 'rejected' || listing.status === 'suspended') && (
                          <Link href="/contact" className={`${actionBtn} border-border text-foreground hover:bg-secondary`}>
                            <MessageCircle size={12} aria-hidden /> Contact EboHomes
                          </Link>
                        )}

                        {(listing.status === 'approved' || listing.status === 'paused') && (
                          <button
                            onClick={() => handleTogglePause(listing)}
                            disabled={busy}
                            className={`${actionBtn} border-border text-foreground hover:bg-secondary`}
                          >
                            {listing.status === 'paused' ? <Play size={12} aria-hidden /> : <Pause size={12} aria-hidden />}
                            {listing.status === 'paused' ? 'Resume' : 'Pause'}
                          </button>
                        )}

                        {!listing.featured && listing.status === 'approved' && (
                          <Link href={`/listing/${listing.id}/feature`} className={`${actionBtn} border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100`}>
                            <Star size={12} aria-hidden /> Feature
                          </Link>
                        )}

                        {confirmDeleteId === listing.id ? (
                          <div role="group" aria-label={`Confirm deleting ${displayTitle(listing)}`} className="flex w-full flex-wrap items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-2">
                            <p className="w-full text-xs font-medium text-red-900">Delete this property? This cannot be undone.</p>
                            <button
                              onClick={() => handleDelete(listing.id)}
                              disabled={busy}
                              className="min-h-11 rounded-full bg-red-700 px-4 text-xs font-bold text-white disabled:opacity-50"
                            >
                              {busy ? 'Deleting…' : 'Yes, delete'}
                            </button>
                            <button
                              autoFocus
                              onClick={() => setConfirmDeleteId(null)}
                              className="focus-ring min-h-11 px-3 text-xs font-semibold text-muted-foreground"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmDeleteId(listing.id)}
                            className={`${actionBtn} border-red-200 text-red-700 hover:bg-red-50`}
                          >
                            <Trash2 size={12} aria-hidden /> Delete
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          ))}
        </>
      )}
    </div>
  )
}
