// Pure helper for the admin queue "Tenant confirmed, tenancy not created yet". No runtime imports, so it can be unit tested directly.
// Built from existing application rows only: status = approved and the tenant set tenant_interest_at.
import type { QueueItem } from './admin-queues'

export type ReadyInput = {
  applications: { id: string; case_ref?: string | null; status: string; listing_id: string; tenant_id?: string | null; tenant_interest_at?: string | null }[]
  // Application ids that already have a tenancy.
  tenancyApplicationIds: string[]
  names: Record<string, string>
}

export function readyForTenancy(inp: ReadyInput): QueueItem[] {
  const has = new Set(inp.tenancyApplicationIds)
  return inp.applications
    .filter((a) => a.status === 'approved' && !!a.tenant_interest_at && !has.has(a.id))
    .map((a) => ({
      key: 'r-' + a.id,
      listingId: a.listing_id,
      who: a.tenant_id ? inp.names[a.tenant_id] ?? null : null,
      ref: a.case_ref ?? null,
      status: 'Tenant confirmed — tenancy not created yet',
      detail: 'Approved by EboHomes and confirmed by the tenant. Nothing is reserved until the landlord creates the tenancy.',
      next: 'Check the landlord is setting up the tenancy and rental terms. Contact the landlord if it takes too long.',
      href: '/admin/applications',
      at: a.tenant_interest_at ?? null,
    }))
    .sort((x, y) => new Date(x.at ?? 0).getTime() - new Date(y.at ?? 0).getTime())
}