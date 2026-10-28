// Pure helpers (no imports) for the landlord's "ready to set up" list.
// A tenancy can be created only from an application EboHomes approved AND the tenant confirmed (tenant_interest_at).
// The database guard (eb_tenancy_guard) is the real enforcement. This only decides what to SHOW, and says why when blocked.

export type SetupApp = { id: string; listing_id: string; tenant_id: string; status?: string | null; tenant_interest_at?: string | null; case_ref?: string | null; application_data?: any }
export type SetupTenancy = { application_id: string; listing_id: string; status?: string | null }
export type SetupListing = { id: string; title?: string | null; status?: string | null }

export type SetupRow<A extends SetupApp = SetupApp> = {
  app: A
  canCreate: boolean
  reason: string | null
}

export function buildSetupRows<A extends SetupApp>(apps: A[], tenancies: SetupTenancy[], listings: SetupListing[]): SetupRow<A>[] {
  const withTenancy = new Set(tenancies.map((t) => t.application_id))
  const busyListing = new Set(tenancies.filter((t) => (t.status ?? 'active') === 'active').map((t) => t.listing_id))
  const listingById = new Map(listings.map((l) => [l.id, l]))
  const rows: SetupRow<A>[] = []
  for (const app of apps) {
    if (app.status !== 'approved' || !app.tenant_interest_at) continue // not ready: EboHomes has not approved, or tenant has not confirmed
    if (withTenancy.has(app.id)) continue // already created: it lives in the tenancy list
    const l = listingById.get(app.listing_id)
    let reason: string | null = null
    if (!l) reason = 'We could not load this property. Refresh the page.'
    else if (l.status !== 'approved') reason = 'This property is not open for new tenants right now, so a tenancy cannot be created. Contact EboHomes if this looks wrong.'
    else if (busyListing.has(app.listing_id)) reason = 'Another tenancy already exists for this property. This applicant stays on the waiting list. EboHomes decides what happens next.'
    rows.push({ app, canCreate: reason === null, reason })
  }
  return rows
}