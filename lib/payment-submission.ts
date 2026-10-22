// Pure helpers for tenant payment-evidence submissions. No imports, so the client, the server and tests share them.
// A submission is EVIDENCE only. It never means the payment is verified.

export const EVIDENCE_BUCKET = 'payment-evidence'
export const EVIDENCE_MAX_BYTES = 8 * 1024 * 1024
export const EVIDENCE_MIME_EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' }
export const EVIDENCE_ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf'

export const PAYMENT_TYPES = ['rent', 'deposit', 'fees'] as const
export type SubmissionType = (typeof PAYMENT_TYPES)[number]
export const TYPE_LABEL: Record<SubmissionType, string> = { rent: 'Rent', deposit: 'Deposit', fees: 'Fees' }

export const PAYMENT_METHODS = [
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'mobile_app_transfer', label: 'Mobile app or wallet transfer' },
  { value: 'ussd', label: 'USSD transfer' },
  { value: 'cash_deposit', label: 'Cash deposit at a bank' },
] as const

export const NG_BANKS = ['Access Bank', 'Citibank', 'Ecobank', 'Fidelity Bank', 'First Bank', 'FCMB', 'GTBank', 'Heritage Bank', 'Keystone Bank', 'Kuda', 'Moniepoint', 'Opay', 'Palmpay', 'Polaris Bank', 'Providus Bank', 'Stanbic IBTC', 'Standard Chartered', 'Sterling Bank', 'Union Bank', 'UBA', 'Unity Bank', 'Wema Bank', 'Zenith Bank']

export type SubmissionStatus = 'submitted' | 'under_review' | 'needs_info' | 'rejected' | 'superseded' | 'verified'

export const SUBMISSION_LABEL: Record<SubmissionStatus, string> = {
  submitted: 'Submitted, not verified yet',
  under_review: 'EboHomes is checking',
  needs_info: 'More information needed',
  rejected: 'Not accepted',
  superseded: 'Replaced by a newer submission',
  verified: 'Verified by EboHomes',
}
export const SUBMISSION_NOTE: Record<SubmissionStatus, string> = {
  submitted: 'We received your evidence. EboHomes has not confirmed that the money arrived.',
  under_review: 'An EboHomes administrator is comparing your evidence with the bank account.',
  needs_info: 'EboHomes needs something more from you. Read the note and send a corrected submission.',
  rejected: 'EboHomes could not match this to a bank transaction. Read the reason and send a corrected submission if you did pay.',
  superseded: 'You sent a corrected submission, so this one is closed.',
  verified: 'An EboHomes administrator confirmed the money was received.',
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function validateEvidenceMeta(mime: unknown, bytes: unknown): string | null {
  if (typeof mime !== 'string' || !EVIDENCE_MIME_EXT[mime]) return 'Upload a JPG, PNG, WEBP or PDF.'
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes <= 0) return 'The selected file is empty.'
  if (bytes > EVIDENCE_MAX_BYTES) return 'The file is too large. The maximum is 8MB.'
  return null
}

export function referenceKey(ref: string): string {
  return ref.trim().replace(/\s+/g, '').toLowerCase()
}

export type CleanSubmission = {
  payment_type: SubmissionType
  amount_paid: number
  payer_name: string
  payer_bank: string
  transaction_reference: string
  paid_at: string // ISO
  payment_method: (typeof PAYMENT_METHODS)[number]['value']
  notes: string | null
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '')

export function validateSubmission(raw: Record<string, unknown>, now: Date = new Date()):
  { ok: true; value: CleanSubmission } | { ok: false; errors: Record<string, string> } {
  const e: Record<string, string> = {}
  const type = str(raw.payment_type)
  if (!(PAYMENT_TYPES as readonly string[]).includes(type)) e.payment_type = 'Choose what you paid for.'

  const amt = typeof raw.amount_paid === 'string' ? Number(raw.amount_paid.replace(/,/g, '')) : raw.amount_paid
  if (typeof amt !== 'number' || !Number.isFinite(amt) || amt <= 0) e.amount_paid = 'Enter the amount you paid.'
  else if (amt > 100_000_000_000) e.amount_paid = 'That amount is too large.'

  const name = str(raw.payer_name)
  if (name.length < 2 || name.length > 120) e.payer_name = 'Enter the full name on the account you paid from.'
  const bank = str(raw.payer_bank)
  if (bank.length < 2 || bank.length > 80) e.payer_bank = 'Enter the bank you paid from.'
  const ref = str(raw.transaction_reference)
  if (ref.length < 4 || ref.length > 80) e.transaction_reference = 'Enter the transaction reference or session ID from your bank.'

  const method = str(raw.payment_method)
  if (!PAYMENT_METHODS.some((m) => m.value === method)) e.payment_method = 'Choose how you paid.'

  const when = typeof raw.paid_at === 'string' ? new Date(raw.paid_at) : null
  if (!when || Number.isNaN(when.getTime())) e.paid_at = 'Enter the date and time of the transfer.'
  else if (when.getTime() > now.getTime() + 10 * 60_000) e.paid_at = 'The transfer time cannot be in the future.'
  else if (when.getTime() < now.getTime() - 366 * 86_400_000) e.paid_at = 'That date is too long ago. Contact EboHomes.'

  const notes = typeof raw.notes === 'string' ? raw.notes.trim() : ''
  if (notes.length > 500) e.notes = 'Keep notes under 500 characters.'

  if (Object.keys(e).length) return { ok: false, errors: e }
  return {
    ok: true,
    value: {
      payment_type: type as SubmissionType, amount_paid: amt as number, payer_name: name, payer_bank: bank,
      transaction_reference: ref, paid_at: (when as Date).toISOString(), payment_method: method as CleanSubmission['payment_method'],
      notes: notes || null,
    },
  }
}

// Evidence lives at {tenantId}/{tenancyId}/{random-uuid}.{ext}. The server picks the name. The client never does.
export function evidencePathFor(tenantId: string, tenancyId: string, mime: string, uuid: string): string {
  return `${tenantId}/${tenancyId}/${uuid}.${EVIDENCE_MIME_EXT[mime] ?? 'bin'}`
}

export function isValidEvidencePath(path: unknown, tenantId: string, tenancyId: string): path is string {
  if (typeof path !== 'string' || path.length > 200) return false
  const parts = path.split('/')
  if (parts.length !== 3 || parts[0] !== tenantId || parts[1] !== tenancyId) return false
  return /^[0-9a-f-]{36}\.(jpg|png|webp|pdf)$/i.test(parts[2])
}

export type TimelineStep = { key: string; label: string; state: 'done' | 'current' | 'todo' | 'bad' }

export function timelineSteps(status: SubmissionStatus): TimelineStep[] {
  const reviewing = status === 'under_review'
  const decided = status === 'verified' || status === 'rejected' || status === 'needs_info'
  const last: TimelineStep =
    status === 'verified' ? { key: 'result', label: 'Verified by EboHomes', state: 'done' }
    : status === 'rejected' ? { key: 'result', label: 'Not accepted', state: 'bad' }
    : status === 'needs_info' ? { key: 'result', label: 'More information needed', state: 'bad' }
    : { key: 'result', label: 'EboHomes verifies the bank transfer', state: 'todo' }
  return [
    { key: 'sent', label: 'Evidence submitted', state: 'done' },
    { key: 'review', label: 'EboHomes checks the bank account', state: decided ? 'done' : reviewing ? 'current' : 'current' },
    last,
  ]
}