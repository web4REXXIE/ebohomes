// Pure helpers for renewals. No imports, so the page, the tests and the panel share one source of truth.

export type RenewalRole = 'tenant' | 'landlord'
export type RenewalStage =
  | 'offered' | 'declined' | 'awaiting_payment' | 'payment_review' | 'payment_problem'
  | 'confirm_code' | 'ready_for_admin' | 'applied'

export type StepState = 'done' | 'current' | 'todo' | 'bad'
export type RenewalStep = { key: string; label: string; state: StepState }

const LABELS = [
  'Renewal offered',
  'Tenant accepted',
  'Renewal payment verified by EboHomes',
  'Tenant confirmed the payment',
  'Renewal applied to the tenancy',
]

const STATES: Record<RenewalStage, StepState[]> = {
  offered: ['current', 'todo', 'todo', 'todo', 'todo'],
  declined: ['done', 'bad', 'todo', 'todo', 'todo'],
  awaiting_payment: ['done', 'done', 'current', 'todo', 'todo'],
  payment_review: ['done', 'done', 'current', 'todo', 'todo'],
  payment_problem: ['done', 'done', 'bad', 'todo', 'todo'],
  confirm_code: ['done', 'done', 'done', 'current', 'todo'],
  ready_for_admin: ['done', 'done', 'done', 'done', 'current'],
  applied: ['done', 'done', 'done', 'done', 'done'],
}

export function isRenewalStage(s: unknown): s is RenewalStage {
  return typeof s === 'string' && Object.prototype.hasOwnProperty.call(STATES, s)
}

export function renewalSteps(stage: RenewalStage): RenewalStep[] {
  return LABELS.map((label, i) => ({ key: String(i), label, state: STATES[stage][i] }))
}

export type StageInfo = {
  tone: 'amber' | 'green' | 'red' | 'neutral'
  heading: string
  text: string
  action: 'respond' | 'pay' | 'fix' | 'confirm' | null
}

export function stageInfo(stage: RenewalStage, role: RenewalRole): StageInfo {
  const t = role === 'tenant'
  switch (stage) {
    case 'offered':
      return t
        ? { tone: 'amber', heading: 'You have a renewal offer', text: 'Accepting does not charge you. After you accept, you send proof of the renewal payment. EboHomes checks the bank account before the renewal is applied.', action: 'respond' }
        : { tone: 'neutral', heading: 'Renewal offer sent', text: 'Waiting for the tenant to accept or decline.', action: null }
    case 'declined':
      return { tone: 'neutral', heading: 'Renewal declined', text: t ? 'You declined this offer.' : 'The tenant declined this offer. You can send a new offer.', action: null }
    case 'awaiting_payment':
      return t
        ? { tone: 'amber', heading: 'Next: pay the renewal', text: 'Pay the renewal rent, then send your bank receipt. The renewal is not applied until EboHomes verifies the payment.', action: 'pay' }
        : { tone: 'neutral', heading: 'Accepted, waiting for payment', text: 'The tenant accepted. They still need to pay and send proof.', action: null }
    case 'payment_review':
      return { tone: 'neutral', heading: 'Payment proof received', text: t ? 'EboHomes is checking the bank account. Your payment is not verified yet.' : 'EboHomes is checking the tenant\'s payment.', action: null }
    case 'payment_problem':
      return t
        ? { tone: 'red', heading: 'EboHomes needs a correction', text: 'Open your payment page, read the message and send a correction.', action: 'fix' }
        : { tone: 'neutral', heading: 'Payment needs a correction', text: 'EboHomes asked the tenant to correct their payment proof.', action: null }
    case 'confirm_code':
      return t
        ? { tone: 'amber', heading: 'Enter your confirmation code', text: 'EboHomes verified the payment. Enter the code from your email to confirm it.', action: 'confirm' }
        : { tone: 'neutral', heading: 'Payment verified', text: 'EboHomes verified the payment. Waiting for the tenant to confirm it.', action: null }
    case 'ready_for_admin':
      return { tone: 'neutral', heading: 'Waiting for EboHomes to apply the renewal', text: 'The payment is verified and confirmed. EboHomes will update the rent and end date.', action: null }
    case 'applied':
      return { tone: 'green', heading: 'Tenancy renewed', text: 'The new rent and end date are on the tenancy page.', action: null }
  }
}

// Checks a new renewal offer before it is sent. Returns an error message or null. The database checks again.
export function validateOffer(
  input: { rent: unknown; endDate: unknown; currentEnd?: string | null; note?: unknown },
  today: Date = new Date(),
): string | null {
  const rent = Number(String(input.rent ?? '').replace(/,/g, ''))
  if (!Number.isFinite(rent) || rent <= 0) return 'Enter the new rent as a number above zero.'
  if (rent > 100000000000) return 'That rent is too large.'
  const end = typeof input.endDate === 'string' ? input.endDate : ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(end) || Number.isNaN(Date.parse(end))) return 'Choose the new end date.'
  const todayIso = today.toISOString().slice(0, 10)
  if (end <= todayIso) return 'The new end date must be in the future.'
  if (input.currentEnd && /^\d{4}-\d{2}-\d{2}/.test(input.currentEnd) && end <= input.currentEnd.slice(0, 10)) {
    return 'The new end date must be after the current end date.'
  }
  if (typeof input.note === 'string' && input.note.length > 500) return 'Keep the note under 500 characters.'
  return null
}