// Pure helpers (safe for client and server). No imports.
export type PayoutStatus = 'pending' | 'approved' | 'paid' | 'confirmed' | 'disputed' | 'cancelled'

export const ADMIN_STATUS_LABEL: Record<PayoutStatus, string> = {
  pending: 'Prepared, awaiting a second admin',
  approved: 'Approved, ready to pay',
  paid: 'Paid, awaiting landlord confirmation',
  confirmed: 'Confirmed by landlord',
  disputed: 'DISPUTED by landlord',
  cancelled: 'Cancelled',
}
export const LANDLORD_STATUS_LABEL: Record<PayoutStatus, string> = {
  pending: 'Being prepared by EboHomes',
  approved: 'Being processed by EboHomes',
  paid: 'Sent. Please check your bank and confirm',
  confirmed: 'Received and confirmed',
  disputed: 'Dispute sent to EboHomes',
  cancelled: 'Cancelled',
}

export const PROOF_MIME = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const
export const PROOF_MAX_BYTES = 8 * 1024 * 1024
export const PROOF_BUCKET = 'payout-proof'
export const PROOF_ACCEPT = PROOF_MIME.join(',')

export function validateProofMeta(mime: unknown, bytes: unknown): string | null {
  if (typeof mime !== 'string' || !(PROOF_MIME as readonly string[]).includes(mime)) return 'Upload a JPG, PNG, WEBP or PDF.'
  const n = Number(bytes)
  if (!Number.isFinite(n) || n <= 0) return 'The file looks empty.'
  if (n > PROOF_MAX_BYTES) return 'The file is bigger than 8MB.'
  return null
}

export function proofPathOk(path: unknown, payoutId: string): boolean {
  return typeof path === 'string' && path.length <= 200 && !path.includes('..') && path.startsWith(`payouts/${payoutId}/`)
}

export function parseAmount(x: unknown): number {
  return Number(String(x ?? '').replace(/,/g, '').trim())
}

export function validatePrepare(i: { amount: unknown; note: unknown; key: unknown }, paymentAmount: number):
  { ok: true; amount: number; note: string | null } | { ok: false; error: string } {
  const amount = parseAmount(i.amount)
  const note = typeof i.note === 'string' ? i.note.trim() : ''
  if (typeof i.key !== 'string' || i.key.length < 16 || i.key.length > 80) return { ok: false, error: 'Invalid request. Reload the page and try again.' }
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: 'Enter the payout amount.' }
  if (amount > paymentAmount) return { ok: false, error: 'The payout cannot be more than the payment.' }
  if (note.length > 1000) return { ok: false, error: 'Keep the note under 1000 characters.' }
  if (amount !== paymentAmount && note.length < 10) return { ok: false, error: 'The amount differs from the payment. Explain why in the note.' }
  return { ok: true, amount, note: note || null }
}

export function validatePaid(
  i: { reference: unknown; proof_path: unknown; attest: { transferred_to_shown_account?: boolean; amount_sent?: unknown } | null | undefined },
  payoutId: string, amount: number,
): { ok: true; reference: string } | { ok: false; error: string } {
  const ref = typeof i.reference === 'string' ? i.reference.trim() : ''
  if (ref.length < 4 || ref.length > 100) return { ok: false, error: 'Enter the transfer reference from the bank.' }
  if (!proofPathOk(i.proof_path, payoutId)) return { ok: false, error: 'Upload the proof of transfer first.' }
  if (!i.attest?.transferred_to_shown_account) return { ok: false, error: 'Tick the box to confirm you sent the money to the account shown.' }
  if (parseAmount(i.attest?.amount_sent) !== Number(amount)) return { ok: false, error: 'The amount sent must equal the payout amount.' }
  return { ok: true, reference: ref }
}

export function validateRespond(action: unknown, note: unknown): { ok: true; note: string | null } | { ok: false; error: string } {
  if (action !== 'confirm' && action !== 'dispute') return { ok: false, error: 'Unknown action.' }
  const n = typeof note === 'string' ? note.trim() : ''
  if (n.length > 1000) return { ok: false, error: 'Keep the note under 1000 characters.' }
  if (action === 'dispute' && n.length < 10) return { ok: false, error: 'Tell EboHomes what is wrong (at least 10 characters).' }
  return { ok: true, note: n || null }
}