// Pure helper for the landlord's "Needs you" list. No imports, so it can be unit tested directly.
// It only turns records the dashboard already reads into rows. Nothing new is stored and no status is invented.
// Not in this list on purpose:
//   - Viewings: EboHomes answers them, so there is nothing for the landlord to do.
//   - Key handover: the landlord's confirmation is optional and never holds up the payout.
//   - Still available?: it has its own card with Yes / It's rented buttons, shown inside the list.

export type NeedsItem = {
  key: string
  // Lower number = more urgent. Under 20 means "reply by a deadline" and is shown first, above the still-available card.
  priority: number
  title: string
  text: string
  href: string
  cta: string
  optional?: boolean
}

export type NeedsInput = {
  now: number
  // False when the listings could not be loaded. Listing-based rows are then skipped and the list is marked partial.
  listingsLoaded: boolean
  listingCount: number
  // Listings EboHomes did not approve or has hidden.
  attention: { id: string; title: string; status: string; reason: string | null }[]
  // Offers waiting for the landlord to confirm. null = could not be loaded.
  offers: { id: string; title: string; expires_at: string | null }[] | null
  verification: { needsAction: boolean; rejected: boolean; detail: string; actionLabel: string }
  // null = could not be loaded.
  openApplications: number | null
  // Tenancies whose rental terms are proposed and still waiting for THIS landlord to accept. Optional, so older callers keep working.
  // null = could not be loaded. Each id is the tenancy id.
  termsToAccept?: { id: string; title: string }[] | null
}

export const OFFER_ROW_LIMIT = 20

function timeLeft(expiresAt: string | null, now: number): string | null {
  if (!expiresAt) return ''
  const t = new Date(expiresAt).getTime()
  if (!Number.isFinite(t)) return ''
  const ms = t - now
  if (ms <= 0) return null // expired: the offer no longer needs the landlord
  const hours = Math.floor(ms / 3_600_000)
  if (hours >= 48) return `${Math.floor(hours / 24)} days left`
  if (hours >= 1) return `${hours} ${hours === 1 ? 'hour' : 'hours'} left`
  return 'less than an hour left'
}

export function buildNeedsYou(inp: NeedsInput): { items: NeedsItem[]; partial: boolean } {
  const items: NeedsItem[] = []
  let partial = !inp.listingsLoaded || inp.offers === null || inp.openApplications === null || inp.termsToAccept === null

  // 1. Offers waiting for the landlord. The tenant cannot see them until the landlord confirms.
  const offers = (inp.offers ?? [])
    .map((o) => ({ o, left: timeLeft(o.expires_at, inp.now) }))
    .filter((x) => x.left !== null)
    .sort((a, b) => new Date(a.o.expires_at ?? 0).getTime() - new Date(b.o.expires_at ?? 0).getTime())
    .slice(0, OFFER_ROW_LIMIT)
  offers.forEach((x, i) => {
    items.push({
      key: 'offer-' + x.o.id,
      priority: 10 + i / 100,
      title: `Confirm the rent terms for ${x.o.title}`,
      text:
        'EboHomes proposed terms that differ from your listing. The tenant sees them only after you confirm.' +
        (x.left ? ` ${x.left}.` : ''),
      // Offers sit on approved applications, so they are under "Decided and closed" on that page. ?tab=closed opens that tab.
      href: '/dashboard/applications?tab=closed',
      cta: 'Review the terms',
    })
  })

  // 1b. Rental terms waiting for this landlord. The agreement is recorded only after the tenant AND the landlord accept.
  ;(inp.termsToAccept ?? []).forEach((t, i) => {
    items.push({
      key: 'terms-' + t.id,
      priority: 12 + i / 100,
      title: `Accept the rental terms for ${t.title}`,
      text: 'The tenancy is set up with the rent, deposit, fees and dates. The tenant and you must both accept before EboHomes records the signed agreement.',
      href: `/dashboard/tenancies/${t.id}`,
      cta: 'Review and accept the terms',
    })
  })

  // 2. Properties EboHomes did not approve or has hidden. One row each up to three, then one summary row.
  if (inp.listingsLoaded) {
    const a = inp.attention
    if (a.length > 0 && a.length <= 3) {
      a.forEach((l, i) => {
        const hidden = l.status === 'suspended'
        const reason = (l.reason ?? '').trim()
        items.push({
          key: 'fix-' + l.id,
          priority: 40 + i / 100,
          title: hidden ? `${l.title} is hidden by EboHomes` : `${l.title} was not approved`,
          text: reason ? `Reason from EboHomes: ${reason}` : 'Open the property to read the reason and what to fix.',
          href: `/dashboard/listings#listing-${l.id}`,
          cta: 'Open this property',
        })
      })
    } else if (a.length > 3) {
      items.push({
        key: 'fix-many',
        priority: 40,
        title: `${a.length} properties need your attention`,
        text: 'EboHomes did not approve or has hidden these. Read the reason on each one.',
        href: '/dashboard/listings#group-attention',
        cta: 'See what to fix',
      })
    }
    if (inp.listingCount === 0) {
      items.push({
        key: 'first-property',
        priority: 45,
        title: 'Add your first property',
        text: 'Tenants can only find a property after you list it and EboHomes approves it.',
        href: '/dashboard/estates',
        cta: 'Add new property',
      })
    }
  }

  // 3. Verification.
  if (inp.verification.needsAction) {
    items.push({
      key: 'verify',
      priority: 50,
      title: inp.verification.rejected ? 'Update your verification details' : 'Complete your verification',
      text: inp.verification.rejected
        ? 'EboHomes did not approve your last submission. The reason is on the Get Verified page.'
        : inp.verification.detail,
      href: '/dashboard/verify',
      cta: inp.verification.actionLabel,
    })
  }

  // 4. Open applications. EboHomes decides each one, so this is optional.
  if (inp.openApplications !== null && inp.openApplications > 0) {
    const n = inp.openApplications
    items.push({
      key: 'applications',
      priority: 60,
      title: `${n} open ${n === 1 ? 'application' : 'applications'}`,
      text: 'Tenants have applied. EboHomes decides each one, and you can add your recommendation.',
      href: '/dashboard/applications',
      cta: 'Open applications',
      optional: true,
    })
  }

  items.sort((x, y) => x.priority - y.priority)
  return { items, partial }
}
