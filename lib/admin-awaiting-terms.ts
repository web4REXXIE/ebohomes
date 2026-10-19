// Pure helper for the admin queue "Tenancy created, rental terms not agreed". No runtime imports, so it can be unit tested directly.
// A tenancy record alone no longer rents a property. It stays open until the signed agreement is recorded.
// Built from existing rows only (tenancies, rental_terms). No status is invented.
import type { QueueItem } from './admin-queues'

// Tenancy statuses that mean the tenancy is over. UNVERIFIED GUESS: confirm against the read-only Q1 result.
export const ENDED_TENANCY_STATUSES = ['ended', 'terminated', 'cancelled', 'canceled', 'completed', 'expired']

export type AwaitingInput = {
  tenancies: { id: string; listing_id: string; tenant_id?: string | null; status?: string | null; created_at?: string | null }[]
  terms: { tenancy_id: string; status: string }[]
  names: Record<string, string>
}

export function tenanciesAwaitingTerms(inp: AwaitingInput): QueueItem[] {
  const agreed = new Set(inp.terms.filter((t) => t.status === 'accepted' || t.status === 'signed').map((t) => t.tenancy_id))
  const proposed = new Set(inp.terms.filter((t) => t.status === 'proposed').map((t) => t.tenancy_id))
  return inp.tenancies
    .filter((t) => !agreed.has(t.id) && !ENDED_TENANCY_STATUSES.includes((t.status ?? '').toLowerCase()))
    .map((t) => {
      const hasProposal = proposed.has(t.id)
      return {
        key: 't-' + t.id,
        listingId: t.listing_id,
        who: t.tenant_id ? inp.names[t.tenant_id] ?? null : null,
        ref: null,
        status: hasProposal ? 'Rental terms proposed, waiting for acceptance' : 'Tenancy created, no rental terms yet',
        detail: 'The property stays open to other tenants until the signed agreement is recorded.',
        next: hasProposal
          ? 'Wait for the tenant and landlord to accept, then record the signed agreement.'
          : 'Check the landlord is proposing rental terms. Contact them if it takes too long.',
        href: '/admin/cases',
        at: t.created_at ?? null,
      }
    })
    .sort((x, y) => new Date(x.at ?? 0).getTime() - new Date(y.at ?? 0).getTime())
}