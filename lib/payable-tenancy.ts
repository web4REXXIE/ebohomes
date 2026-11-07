// Pure rule for which tenancies can take a payment. Mirrors eb_submit_payment_evidence (20261207_03). The database is the real gate.
// An offer-created tenancy is 'pending' or 'awaiting_payment' while the first payment is made. The signed agreement is checked separately.

export const RESERVED_STATUSES = ['pending', 'awaiting_payment'] as const

export function canTakePayment(status: string | null | undefined, offerId: string | null | undefined): boolean {
  if (status === 'active') return true
  if (status && (RESERVED_STATUSES as readonly string[]).includes(status)) return !!offerId
  return false
}
