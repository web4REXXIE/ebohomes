// Pure helper (no imports). Picks the listing the landlord should confirm next on Landlord home.
// The 14-day rule matches the database (eb_sweep_listing_freshness): a live listing not confirmed for
// 14 days is paused. A listing the landlord paused on purpose is never asked about.

export const FRESH_DAYS = 14
const DAY_MS = 24 * 60 * 60 * 1000

export type CheckListing = {
  id: string
  title?: string | null
  status?: string | null
  availability_confirmed_at?: string | null
  freshness_paused_at?: string | null
}

export type CheckPick = {
  listing: CheckListing
  // Days left before the listing pauses. 0 or less means it is already overdue or paused.
  daysLeft: number
  // True when the 14-day check already paused it.
  pausedByCheck: boolean
  // How many OTHER listings need an answer within 4 days.
  others: number
}

function daysLeftOf(l: CheckListing, nowMs: number): number {
  const t = l.availability_confirmed_at ? new Date(l.availability_confirmed_at).getTime() : NaN
  // No readable date: treat as overdue so the landlord is asked, never as "fine".
  if (!Number.isFinite(t)) return 0
  return FRESH_DAYS - Math.floor((nowMs - t) / DAY_MS)
}

export function pickListingToConfirm(listings: CheckListing[], nowMs: number = Date.now()): CheckPick | null {
  const candidates = listings
    .filter((l) => l.status === 'approved' || (l.status === 'paused' && !!l.freshness_paused_at))
    .map((l) => ({ l, left: daysLeftOf(l, nowMs) }))
    .sort((a, b) => a.left - b.left)
  if (candidates.length === 0) return null
  const first = candidates[0]
  return {
    listing: first.l,
    daysLeft: first.left,
    pausedByCheck: first.l.status === 'paused',
    others: candidates.slice(1).filter((c) => c.left <= 4).length,
  }
}
