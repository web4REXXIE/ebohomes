// Single source of truth for payment wording in EboHomes.
// A payment is VERIFIED only when status = 'confirmed' AND verified_by is set.

export type PaymentLike = {
  status?: string | null
  verified_by?: string | null
}

export type PaymentState =
  | 'verified'
  | 'legacy_confirmed'
  | 'awaiting_verification'
  | 'pending'
  | 'rejected'
  | 'other'

export function isVerified(p: PaymentLike): boolean {
  return p.status === 'confirmed' && !!p.verified_by
}

export function getPaymentState(p: PaymentLike): PaymentState {
  if (isVerified(p)) return 'verified'
  if (p.status === 'confirmed') return 'legacy_confirmed'
  if (p.status === 'recorded') return 'awaiting_verification'
  if (p.status === 'pending') return 'pending'
  if (p.status === 'rejected') return 'rejected'
  return 'other'
}

export const PAYMENT_STATE_LABEL: Record<PaymentState, string> = {
  verified: 'Verified by EboHomes',
  legacy_confirmed: 'Recorded (not verified by EboHomes)',
  awaiting_verification: 'Recorded, awaiting EboHomes verification',
  pending: 'Pending',
  rejected: 'Rejected by EboHomes',
  other: 'Not verified',
}

export const PAYMENT_STATE_NOTE: Record<PaymentState, string> = {
  verified: 'An EboHomes administrator checked and verified this payment record.',
  legacy_confirmed:
    'This is an older record marked confirmed, but no EboHomes administrator is recorded as having verified it.',
  awaiting_verification:
    'This payment was recorded by the landlord. EboHomes has not verified it yet.',
  pending: 'This payment record has not been completed.',
  rejected: 'An EboHomes administrator reviewed this payment record and rejected it.',
  other: 'EboHomes has not verified this payment.',
}

export function paymentLabel(p: PaymentLike): string {
  return PAYMENT_STATE_LABEL[getPaymentState(p)]
}