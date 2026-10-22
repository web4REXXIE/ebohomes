// Pure helpers for admin review of payment submissions. Shared by the admin page, the API route and tests.
import type { SubmissionStatus } from '@/lib/payment-submission'

export const REVIEW_ACTIONS = ['start_review', 'request_info', 'reject', 'verify'] as const
export type ReviewAction = (typeof REVIEW_ACTIONS)[number]

export type QueueFilter = 'awaiting' | 'info' | 'verified' | 'rejected' | 'all'
export const QUEUE_FILTERS: { key: QueueFilter; label: string }[] = [
  { key: 'awaiting', label: 'Awaiting review' },
  { key: 'info', label: 'Info requested' },
  { key: 'verified', label: 'Bank verified' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'all', label: 'All' },
]

export function filterStatuses(f: QueueFilter): SubmissionStatus[] | null {
  if (f === 'awaiting') return ['submitted', 'under_review']
  if (f === 'info') return ['needs_info']
  if (f === 'verified') return ['verified']
  if (f === 'rejected') return ['rejected', 'superseded']
  return null
}

// Maps the Phase 1 statuses to admin wording. No second status system.
export function adminStatusLabel(status: SubmissionStatus, replacesId?: string | null): string {
  if (status === 'submitted') return replacesId ? 'Resubmitted, awaiting review' : 'Awaiting review'
  if (status === 'under_review') return 'Being reviewed'
  if (status === 'needs_info') return 'Information requested'
  if (status === 'rejected') return 'Rejected'
  if (status === 'superseded') return 'Replaced by a correction'
  return 'Bank verified, awaiting tenant confirmation' // Phase 2B adds "Confirmed" and expiry
}

export function amountMismatch(expected: number | null | undefined, paid: number): boolean {
  return expected != null && Number(expected) !== Number(paid)
}

export type Attestation = {
  checked_bank_account: boolean
  correct_tenant_and_property: boolean
  amount_received: string
  bank_reference: string
  mismatch_acknowledged: boolean
}

export function validateReview(
  action: unknown, note: unknown, attest: Partial<Attestation> | null | undefined,
  sub: { amount_paid: number; expected_amount: number | null; transaction_reference: string },
): { ok: true; note: string | null } | { ok: false; error: string } {
  if (!(REVIEW_ACTIONS as readonly string[]).includes(action as string)) return { ok: false, error: 'Unknown action.' }
  const n = typeof note === 'string' ? note.trim() : ''
  if (n.length > 1000) return { ok: false, error: 'Keep the note under 1000 characters.' }
  if ((action === 'request_info' || action === 'reject') && n.length < 5) return { ok: false, error: 'Write a clear message for the tenant.' }
  if (action === 'verify') {
    if (!attest?.checked_bank_account || !attest?.correct_tenant_and_property) return { ok: false, error: 'Tick both boxes to confirm you checked the bank account.' }
    const got = Number(String(attest.amount_received ?? '').replace(/,/g, ''))
    if (!Number.isFinite(got) || got !== Number(sub.amount_paid)) return { ok: false, error: 'The amount you saw in the bank must equal the amount the tenant submitted. Otherwise request more information or reject.' }
    const norm = (s: string) => s.trim().replace(/\s+/g, '').toLowerCase()
    if (!attest.bank_reference || norm(attest.bank_reference) !== norm(sub.transaction_reference)) return { ok: false, error: 'Type the reference exactly as it appears in the bank. It must match the tenant\'s reference.' }
    if (amountMismatch(sub.expected_amount, sub.amount_paid) && (!attest.mismatch_acknowledged || n.length < 10)) return { ok: false, error: 'The amount differs from the signed agreement. Acknowledge it and explain in the note.' }
  }
  return { ok: true, note: n || null }
}