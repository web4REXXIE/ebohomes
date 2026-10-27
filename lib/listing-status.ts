// Pure helpers for how a landlord sees listing statuses. No imports, so they can be unit tested directly.
// Uses only the statuses that already exist on listings: pending, inspection_required, approved, paused, rented, rejected, suspended.
// "Live" means status = 'approved'. That is the same rule search, home and the public listing page use.

export type ListingGroup = 'attention' | 'review' | 'live' | 'other'
export type ListingTone = 'green' | 'blue' | 'amber' | 'red' | 'grey'

export const GROUP_ORDER: ListingGroup[] = ['attention', 'review', 'live', 'other']

export const GROUP_TITLE: Record<ListingGroup, string> = {
  attention: 'Needs your attention',
  review: 'Under review',
  live: 'Approved & live',
  other: 'Other listings',
}

export const GROUP_HELP: Record<ListingGroup, string> = {
  attention: 'EboHomes did not approve these, or has hidden them. Read the reason on each one.',
  review: 'EboHomes is checking these. Tenants cannot see them yet.',
  live: 'EboHomes approved these. Tenants can find them, request viewings and apply.',
  other: 'Not visible to tenants right now.',
}

export function listingGroup(status: string | null | undefined): ListingGroup {
  switch (status ?? 'pending') {
    case 'rejected':
    case 'suspended':
      return 'attention'
    case 'pending':
    case 'inspection_required':
      return 'review'
    case 'approved':
      return 'live'
    default:
      return 'other'
  }
}

export type ListingStatusInfo = { label: string; tone: ListingTone; meaning: string; next: string }

export function listingStatusInfo(status: string | null | undefined): ListingStatusInfo {
  switch (status ?? 'pending') {
    case 'pending':
      return {
        label: 'Waiting for EboHomes review',
        tone: 'amber',
        meaning: 'You submitted this listing. EboHomes has not decided yet. Tenants cannot see it.',
        next: 'Nothing to do now. The result will show on this page.',
      }
    case 'inspection_required':
      return {
        label: 'Inspection needed',
        tone: 'amber',
        meaning: 'EboHomes has marked this property as needing an inspection before it can go live.',
        next: 'Wait for EboHomes. Keep your phone available.',
      }
    case 'approved':
      return {
        label: 'Approved & live',
        tone: 'green',
        meaning: 'EboHomes approved this listing. Tenants can now find it, request viewings and apply.',
        next: 'When a tenant asks to view it, the request appears under Viewings.',
      }
    case 'paused':
      return {
        label: 'Paused by you',
        tone: 'grey',
        meaning: 'You paused this listing. Tenants cannot see it.',
        next: 'Tap Resume when you want it live again.',
      }
    case 'rented':
      return {
        label: 'Rented',
        tone: 'blue',
        meaning: 'This property is rented. EboHomes marks a listing as rented only after the required payment is verified and the key handover is confirmed. Tenants cannot see it.',
        next: 'Nothing to do. If this looks wrong, contact EboHomes.',
      }
    case 'rejected':
      return {
        label: 'Not approved — action required',
        tone: 'red',
        meaning: 'EboHomes did not approve this listing. Tenants cannot see it.',
        next: 'Read the reason, update the listing, then contact EboHomes to ask for a new review.',
      }
    case 'suspended':
      return {
        label: 'Hidden by EboHomes',
        tone: 'red',
        meaning: 'EboHomes has hidden this listing. Tenants cannot see it or apply.',
        next: 'Read the reason and contact EboHomes.',
      }
    default:
      return {
        label: (status ?? '').replace(/_/g, ' '),
        tone: 'grey',
        meaning: 'This listing is not visible to tenants.',
        next: 'Contact EboHomes if you are not sure why.',
      }
  }
}

// True when EboHomes approved the listing after `sinceMs` and it is still live.
export function isNewlyApproved(l: { status?: string | null; reviewed_at?: string | null }, sinceMs: number): boolean {
  if (l.status !== 'approved' || !l.reviewed_at) return false
  const t = new Date(l.reviewed_at).getTime()
  return Number.isFinite(t) && t > sinceMs
}

type Sortable = { status?: string | null; reviewed_at?: string | null; created_at?: string | null }

function ms(iso: string | null | undefined): number {
  const t = iso ? new Date(iso).getTime() : 0
  return Number.isFinite(t) ? t : 0
}

// Fixed, predictable order. Live listings: newest approval first. Everything else: newest submission first.
export function groupListings<T extends Sortable>(list: T[]): Record<ListingGroup, T[]> {
  const out: Record<ListingGroup, T[]> = { attention: [], review: [], live: [], other: [] }
  for (const l of list) out[listingGroup(l.status)].push(l)
  out.live.sort((a, b) => ms(b.reviewed_at) - ms(a.reviewed_at) || ms(b.created_at) - ms(a.created_at))
  for (const g of ['attention', 'review', 'other'] as const) out[g].sort((a, b) => ms(b.created_at) - ms(a.created_at))
  return out
}