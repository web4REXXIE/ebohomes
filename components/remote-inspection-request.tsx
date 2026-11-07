'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { AlertCircle, ArrowLeft, CheckCircle2, Loader2, ShieldCheck } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { isValidListingId } from '@/lib/listing-id'
import { displayTitle } from '@/lib/property-display'
import {
  NOTE_MAX,
  checkPreferredWindow,
  decideEntry,
  friendlyError,
  isOpen,
  localToIso,
  type RequestRow,
} from '@/lib/remote-inspection'

const inputCls =
  'w-full min-h-12 px-3 py-3 text-base border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary'

// The request screen. One property, one free request. It does not create an application and does not reserve
// the property. The database decides eligibility and limits. This screen only explains and collects.
export function RemoteInspectionRequest({ listingId }: { listingId: string }) {
  const [loading, setLoading] = useState(true)
  const [listing, setListing] = useState<any>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [onHold, setOnHold] = useState(false)
  const [open, setOpen] = useState<RequestRow | null>(null)
  const [loadError, setLoadError] = useState('')

  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const submittingRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!isValidListingId(listingId)) {
        setLoadError('Property not found.')
        setLoading(false)
        return
      }
      const { data: auth } = await supabase.auth.getUser()
      const uid = auth.user?.id ?? null
      const { data: l, error: le } = await supabase
        .from('listings')
        .select('id, title, location_text, status, landlord_id, property_type, bedrooms')
        .eq('id', listingId)
        .maybeSingle()
      if (cancelled) return
      if (le || !l) {
        setLoadError('Property not found.')
        setLoading(false)
        return
      }
      setListing(l)
      setUserId(uid)

      const { data: held } = await supabase.rpc('listing_on_hold', { p_listing: listingId })
      if (!cancelled) setOnHold(held === true)

      if (uid) {
        const { data: mine } = await supabase.rpc('my_remote_inspection_requests')
        const rows: RequestRow[] = Array.isArray(mine) ? mine : []
        if (!cancelled) setOpen(rows.find((r) => r.listing_id === listingId && isOpen(r.status)) ?? null)
      }
      if (!cancelled) setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [listingId])

  const submit = async () => {
    if (submittingRef.current) return
    const windowError = checkPreferredWindow(from, to)
    if (windowError) {
      setError(windowError)
      return
    }
    submittingRef.current = true
    setSubmitting(true)
    setError('')
    const { error: e } = await supabase.rpc('tenant_request_remote_inspection', {
      p_listing: listingId,
      p_from: localToIso(from),
      p_to: localToIso(to),
      p_note: note.trim() || null,
    })
    submittingRef.current = false
    setSubmitting(false)
    if (e) {
      setError(friendlyError(e.message))
      return
    }
    setDone(true)
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20" role="status" aria-label="Loading">
        <Loader2 className="animate-spin text-muted-foreground" />
      </div>
    )
  }

  const back = (
    <Link href={`/listing/${listingId}`} className="mb-4 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-primary">
      <ArrowLeft size={16} aria-hidden /> Back to the property
    </Link>
  )

  if (loadError || !listing) {
    return (
      <div className="mx-auto max-w-xl px-4 py-8">
        {back}
        <p className="rounded-lg border border-border bg-card p-4 text-sm text-foreground">{loadError || 'Property not found.'}</p>
      </div>
    )
  }

  const entry = decideEntry({
    listingId,
    listingStatus: listing.status,
    signedIn: !!userId,
    isOwner: !!userId && listing.landlord_id === userId,
    onHold,
    openRequest: open ? { id: open.id, status: open.status } : null,
  })

  if (done) {
    return (
      <div className="mx-auto max-w-xl px-4 py-8">
        <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-5 text-emerald-950" role="status">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 shrink-0" size={22} aria-hidden />
            <div>
              <h1 className="text-lg font-extrabold">Request sent</h1>
              <p className="mt-1 text-sm leading-relaxed">
                EboHomes asked the owner to allow access. No inspector is sent until the owner agrees. This is not scheduled yet. You will be notified at each step.
              </p>
            </div>
          </div>
        </div>
        <Link href="/inspections" className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground">
          See my inspection requests
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-6 pb-28">
      {back}
      <h1 className="text-2xl font-extrabold text-foreground">Request a remote inspection</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {displayTitle(listing)}
        {listing.location_text ? `, ${listing.location_text}` : ''}
      </p>

      <section className="mt-5 rounded-xl border border-border bg-card p-4 text-sm leading-relaxed text-foreground" aria-label="How it works">
        <p className="font-semibold">An EboHomes inspector visits for you, so you can decide before you travel.</p>
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          <li>It is free. No payment is taken.</li>
          <li>The owner must agree to give access first. No inspector is sent before that.</li>
          <li>You get a private report. The owner and other tenants cannot read it.</li>
          <li>It does not apply for the property and does not reserve it.</li>
          <li>It does not give the property an EboHomes Inspected badge.</li>
        </ul>
      </section>

      {entry.kind === 'hidden' && (
        <p className="mt-5 rounded-lg border border-border bg-secondary p-3 text-sm" role="note">
          This is your listing, so you cannot request an inspection of it.
        </p>
      )}

      {entry.kind === 'disabled' && (
        <p className="mt-5 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950" role="note">
          <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden />
          {entry.line}
        </p>
      )}

      {entry.kind === 'link' && !userId && (
        <Link href={entry.href} className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground">
          {entry.label}
        </Link>
      )}

      {entry.kind === 'link' && userId && open && (
        <div className="mt-5 rounded-lg border border-border bg-card p-4 text-sm" role="note">
          <p className="font-semibold text-foreground">You already have an open request for this property.</p>
          <Link href="/inspections" className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground">
            {entry.label}
          </Link>
        </div>
      )}

      {entry.kind === 'link' && userId && !open && (
        <div className="mt-5 space-y-4">
          <fieldset>
            <legend className="text-sm font-semibold text-foreground">When suits you? (optional)</legend>
            <p className="mb-2 text-xs text-muted-foreground">The owner makes the final choice of time. Leave both empty if any time works.</p>
            <label className="block text-xs font-medium text-muted-foreground" htmlFor="ri-from">From</label>
            <input id="ri-from" type="datetime-local" value={from} onChange={(e) => { setFrom(e.target.value); setError('') }} className={inputCls} />
            <label className="mt-2 block text-xs font-medium text-muted-foreground" htmlFor="ri-to">Until</label>
            <input id="ri-to" type="datetime-local" value={to} onChange={(e) => { setTo(e.target.value); setError('') }} className={inputCls} />
          </fieldset>

          <div>
            <label htmlFor="ri-note" className="text-sm font-semibold text-foreground">What do you most want checked? (optional)</label>
            <textarea
              id="ri-note"
              value={note}
              maxLength={NOTE_MAX}
              rows={4}
              onChange={(e) => setNote(e.target.value)}
              placeholder="For example: water supply, the road at night, damp in the bedroom."
              className={`${inputCls} mt-1 min-h-28`}
            />
            <p className="mt-1 text-right text-xs text-muted-foreground">{note.length}/{NOTE_MAX}</p>
          </div>

          <p className="flex items-start gap-2 text-xs leading-snug text-muted-foreground">
            <ShieldCheck size={14} className="mt-0.5 shrink-0 text-primary" aria-hidden />
            The owner is told that someone wants an inspection. Your name and your note are not shared with the owner.
          </p>

          {error && (
            <p role="alert" className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">
              <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden />
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {submitting && <Loader2 size={16} className="animate-spin" aria-hidden />}
            {submitting ? 'Sending…' : 'Send request'}
          </button>
        </div>
      )}
    </div>
  )
}
