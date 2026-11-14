'use client'

import { useMemo, useState } from 'react'
import { CheckCircle2, Clock, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { displayTitle } from '@/lib/property-display'
import { pickListingToConfirm, type CheckListing } from '@/lib/availability-check'

// Landlord home: "Is this property still available?" for the listing closest to the 14-day limit.
// Yes -> confirm_listing_available (existing). It's rented -> mark_listing_rented (new, owner only).
// The database decides what is allowed. This card only asks and shows the answer.
export function StillAvailableCard({ listings, onChanged }: { listings: CheckListing[]; onChanged: () => void }) {
  const pick = useMemo(() => pickListingToConfirm(listings), [listings])
  const [busy, setBusy] = useState<'yes' | 'rented' | null>(null)
  const [askRented, setAskRented] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  if (!pick) return msg ? <Notice msg={msg} /> : null

  const name = displayTitle(pick.listing as any)
  const overdue = pick.daysLeft <= 0
  const when = pick.pausedByCheck
    ? 'It was paused because it was not confirmed in time. Confirm to put it back on the market.'
    : overdue
      ? 'Please confirm today or the listing pauses.'
      : `Answer within ${pick.daysLeft} ${pick.daysLeft === 1 ? 'day' : 'days'} or the listing pauses.`

  const yes = async () => {
    setBusy('yes')
    setMsg(null)
    const { error } = await supabase.rpc('confirm_listing_available', { p_listing: pick.listing.id })
    setBusy(null)
    if (error) return setMsg({ ok: false, text: error.message || 'Could not confirm. Try again.' })
    setMsg({ ok: true, text: `Thank you. ${name} stays on the market.` })
    onChanged()
  }

  const rented = async () => {
    setBusy('rented')
    setMsg(null)
    const { data, error } = await supabase.rpc('mark_listing_rented', { p_listing: pick.listing.id })
    setBusy(null)
    setAskRented(false)
    if (error) return setMsg({ ok: false, text: error.message || 'Could not update the property. Try again.' })
    const n = Number((data as { applicants_notified?: number } | null)?.applicants_notified ?? 0)
    setMsg({
      ok: true,
      text: n > 0 ? `${name} is marked rented. ${n} ${n === 1 ? 'applicant was' : 'applicants were'} told.` : `${name} is marked rented.`,
    })
    onChanged()
  }

  return (
    <section
      aria-labelledby="still-available"
      className={`mb-6 rounded-card border-2 bg-card p-4 shadow-rest sm:p-5 ${overdue ? 'border-warning' : 'border-primary'}`}
    >
      <h2 id="still-available" className="flex items-center gap-2 text-base font-bold text-foreground">
        {overdue ? <Clock size={18} className="text-warning" aria-hidden /> : <CheckCircle2 size={18} className="text-primary" aria-hidden />}
        Is {name} still available?
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{when}</p>
      {pick.others > 0 && (
        <p className="mt-1 text-xs text-muted-foreground">
          {pick.others} more {pick.others === 1 ? 'property needs' : 'properties need'} an answer soon. Find them in My Properties.
        </p>
      )}

      {!askRented ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={yes}
            disabled={busy !== null}
            className="focus-ring inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-button bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-50"
          >
            {busy === 'yes' && <Loader2 size={14} className="animate-spin" aria-hidden />} Yes, still available
          </button>
          <button
            type="button"
            onClick={() => setAskRented(true)}
            disabled={busy !== null}
            className="focus-ring inline-flex min-h-11 flex-1 items-center justify-center rounded-button border border-border bg-card px-4 text-sm font-semibold text-foreground disabled:opacity-50"
          >
            It&apos;s rented
          </button>
        </div>
      ) : (
        <div className="mt-3 rounded-lg border border-border bg-secondary p-3" role="group" aria-label="Confirm it is rented">
          <p className="text-sm text-foreground">
            This closes the listing. Anyone with an open application is told it is no longer available. Use it only if the
            property is really rented.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => setAskRented(false)}
              disabled={busy !== null}
              className="focus-ring min-h-11 flex-1 rounded-button border border-border bg-card px-4 text-sm font-semibold text-foreground disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={rented}
              disabled={busy !== null}
              className="focus-ring inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-button bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-50"
            >
              {busy === 'rented' && <Loader2 size={14} className="animate-spin" aria-hidden />} Yes, it is rented
            </button>
          </div>
        </div>
      )}

      {msg && <Notice msg={msg} />}
    </section>
  )
}

function Notice({ msg }: { msg: { ok: boolean; text: string } }) {
  return (
    <p
      role="status"
      className={`mt-3 rounded-card border p-3 text-sm ${msg.ok ? 'border-success bg-success-soft text-success' : 'border-danger bg-danger-soft text-danger'}`}
    >
      {msg.text}
    </p>
  )
}
