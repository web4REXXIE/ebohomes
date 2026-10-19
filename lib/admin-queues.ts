// Pure helpers for the admin "Needs attention" queues. No imports, so they can be unit tested directly.
// Every queue is built from rows that already exist (listings, viewings, applications, rental_terms, payments,
// tenancy_disputes, tenancy_settlements). Nothing new is stored and no status is invented.

export type QueueKey =
  | 'listings' | 'viewing_respond' | 'viewing_schedule' | 'interested' | 'applications'
  | 'terms' | 'payments' | 'disputes' | 'settlements'

export const QUEUE_ORDER: QueueKey[] = [
  'listings', 'viewing_respond', 'viewing_schedule', 'interested', 'applications',
  'terms', 'payments', 'disputes', 'settlements',
]

export type QueueMeta = { title: string; help: string; href: string; urgent: boolean }

export const QUEUE_META: Record<QueueKey, QueueMeta> = {
  listings: { title: 'Listings awaiting review', help: 'Landlords submitted these. Tenants cannot see them until you approve.', href: '/admin/property-review', urgent: false },
  viewing_respond: { title: 'Viewing requests to answer', help: 'Tenants asked to see these properties and are waiting for a reply.', href: '/admin/viewings', urgent: false },
  viewing_schedule: { title: 'Viewings that need a time', help: 'You approved these. Choose and confirm a date and time.', href: '/admin/viewings', urgent: false },
  interested: { title: 'Interested tenants', help: 'These tenants finished a viewing and want to continue. Nothing is reserved yet.', href: '/admin/applications', urgent: false },
  applications: { title: 'Applications to review', help: 'New applications, or tenants who replied to your request for information.', href: '/admin/applications', urgent: false },
  terms: { title: 'Agreed terms awaiting signed record', help: 'Tenant and landlord accepted the terms. Record the signed agreement once you have seen it.', href: '/admin/cases', urgent: false },
  payments: { title: 'Payments awaiting verification', help: 'A payment was recorded. It only counts once you verify it.', href: '/admin/payments', urgent: false },
  disputes: { title: 'Open disputes', help: 'A tenant or landlord raised a problem on a tenancy.', href: '/admin/cases', urgent: true },
  settlements: { title: 'Deposit settlements to review', help: 'A deposit settlement was agreed or disputed.', href: '/admin/cases', urgent: true },
}

export type QueueItem = {
  key: string
  listingId: string | null
  who: string | null
  ref: string | null
  status: string
  detail: string | null
  next: string
  href: string
  at: string | null
}

export type QueueInput = {
  listings: { id: string; created_at?: string | null }[]
  viewings: { id: string; listing_id: string; tenant_id?: string | null; application_id?: string | null; status: string; tenant_decision?: string | null; created_at?: string | null }[]
  applications: { id: string; case_ref?: string | null; status: string; listing_id: string; tenant_id?: string | null; tenant_reply?: string | null; created_at?: string | null }[]
  terms: { id: string; tenancy_id: string; version?: number | null; status: string; updated_at?: string | null }[]
  payments: { id: string; listing_id?: string | null; tenancy_id?: string | null; amount?: number | null; status?: string | null; type?: string | null; created_at?: string | null }[]
  disputes: { id: string; tenancy_id: string; category?: string | null; status: string; created_at?: string | null }[]
  settlements: { id: string; tenancy_id: string; status: string; updated_at?: string | null }[]
  // Application ids that already have a tenancy. Those tenants have moved past "interested".
  tenancyApplicationIds: string[]
  // tenancy id -> listing id, so tenancy-based items can show the right property.
  tenancyListing: Record<string, string>
  // profile id -> name
  names: Record<string, string>
}

export function formatNaira(n: number | null | undefined): string {
  const v = Math.round(Number(n) || 0)
  return '₦' + String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

function words(s: string | null | undefined): string {
  const t = (s ?? '').replace(/_/g, ' ').trim()
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : ''
}

function vref(id: string): string {
  return 'VW-' + String(id).slice(0, 8).toUpperCase()
}

function ms(iso: string | null | undefined): number {
  const t = iso ? new Date(iso).getTime() : 0
  return Number.isFinite(t) ? t : 0
}

// Oldest first, so the item that has waited longest is on top. Ties keep the input order.
function oldestFirst(list: QueueItem[]): QueueItem[] {
  return list
    .map((x, i) => ({ x, i }))
    .sort((a, b) => (ms(a.x.at) - ms(b.x.at)) || a.i - b.i)
    .map((o) => o.x)
}

export function buildQueues(inp: QueueInput): Record<QueueKey, QueueItem[]> {
  const out: Record<QueueKey, QueueItem[]> = {
    listings: [], viewing_respond: [], viewing_schedule: [], interested: [], applications: [],
    terms: [], payments: [], disputes: [], settlements: [],
  }
  const hasTenancy = new Set(inp.tenancyApplicationIds)
  const name = (id: string | null | undefined) => (id ? inp.names[id] ?? null : null)

  for (const l of inp.listings) {
    out.listings.push({
      key: 'l-' + l.id, listingId: l.id, who: null, ref: null,
      status: 'Waiting for review', detail: null,
      next: 'Check the photos and details, then approve or reject the listing.',
      href: QUEUE_META.listings.href, at: l.created_at ?? null,
    })
  }

  for (const v of inp.viewings) {
    if (v.status === 'requested') {
      out.viewing_respond.push({
        key: 'v-' + v.id, listingId: v.listing_id, who: name(v.tenant_id), ref: vref(v.id),
        status: 'Awaiting EboHomes response', detail: null,
        next: 'Approve with a time, propose another time, or reject with a reason.',
        href: QUEUE_META.viewing_respond.href, at: v.created_at ?? null,
      })
    } else if (v.status === 'approved') {
      out.viewing_schedule.push({
        key: 'v-' + v.id, listingId: v.listing_id, who: name(v.tenant_id), ref: vref(v.id),
        status: 'Approved — time not set', detail: null,
        next: 'Choose and confirm a date and time.',
        href: QUEUE_META.viewing_schedule.href, at: v.created_at ?? null,
      })
    } else if (v.status === 'completed' && v.tenant_decision === 'interested' && !(v.application_id && hasTenancy.has(v.application_id))) {
      out.interested.push({
        key: 'i-' + v.id, listingId: v.listing_id, who: name(v.tenant_id), ref: vref(v.id),
        status: 'Tenant wants to continue', detail: 'Nothing is approved or reserved yet.',
        next: 'Open the application. Confirm availability and rent with the landlord, then approve.',
        href: QUEUE_META.interested.href, at: v.created_at ?? null,
      })
    }
  }

  for (const a of inp.applications) {
    const replied = a.status === 'info_requested' && !!(a.tenant_reply ?? '').trim()
    if (a.status === 'pending' || replied) {
      out.applications.push({
        key: 'a-' + a.id, listingId: a.listing_id, who: name(a.tenant_id), ref: a.case_ref ?? null,
        status: replied ? 'Tenant replied with more information' : 'Waiting for review', detail: null,
        next: replied ? 'Read the reply, then approve, reject or ask again.' : 'Review the application, then approve, reject or ask for more information.',
        href: QUEUE_META.applications.href, at: a.created_at ?? null,
      })
    }
  }

  for (const t of inp.terms) {
    if (t.status !== 'accepted') continue
    out.terms.push({
      key: 't-' + t.id, listingId: inp.tenancyListing[t.tenancy_id] ?? null, who: null, ref: null,
      status: 'Accepted by tenant and landlord', detail: t.version ? 'Terms version ' + t.version : null,
      next: 'Check the signed agreement, then record it on the case.',
      href: QUEUE_META.terms.href, at: t.updated_at ?? null,
    })
  }

  for (const p of inp.payments) {
    if (p.status !== 'recorded' && p.status !== 'pending') continue
    out.payments.push({
      key: 'p-' + p.id, listingId: p.listing_id ?? (p.tenancy_id ? inp.tenancyListing[p.tenancy_id] ?? null : null),
      who: null, ref: null,
      status: 'Recorded — awaiting verification',
      detail: [formatNaira(p.amount), words(p.type)].filter(Boolean).join(' · '),
      next: 'Check the payment evidence, then verify or reject it.',
      href: QUEUE_META.payments.href, at: p.created_at ?? null,
    })
  }

  for (const d of inp.disputes) {
    if (d.status !== 'open' && d.status !== 'under_review') continue
    out.disputes.push({
      key: 'd-' + d.id, listingId: inp.tenancyListing[d.tenancy_id] ?? null, who: null, ref: null,
      status: d.status === 'open' ? 'Dispute opened' : 'Dispute under review', detail: words(d.category) || null,
      next: d.status === 'open' ? 'Start the review.' : 'Decide: resolve it or close it.',
      href: QUEUE_META.disputes.href, at: d.created_at ?? null,
    })
  }

  for (const s of inp.settlements) {
    if (s.status !== 'agreed' && s.status !== 'disputed') continue
    out.settlements.push({
      key: 's-' + s.id, listingId: inp.tenancyListing[s.tenancy_id] ?? null, who: null, ref: null,
      status: s.status === 'agreed' ? 'Settlement agreed' : 'Settlement disputed', detail: null,
      next: s.status === 'agreed' ? 'Review the record and approve it. No money moves through EboHomes.' : 'Review the disagreement.',
      href: QUEUE_META.settlements.href, at: s.updated_at ?? null,
    })
  }

  for (const k of QUEUE_ORDER) out[k] = oldestFirst(out[k])
  return out
}