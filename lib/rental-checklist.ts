// Pure helpers (no imports) for the final-rental checklist shown in the tenant journey.
// EVERYTHING is derived from records that already exist. Nothing is stored and nothing is marked done unless its
// own record says so:
//   Agreement recorded      -> rental_terms.status = 'signed'
//   Required payment verified -> payments.status = 'confirmed' AND verified_by set, OR payment_submissions.status = 'verified'
//                               (the same rule the handover SQL uses). Uploaded evidence alone is never "verified".
//   Key handover confirmed  -> tenancy_handovers.status = 'completed'
//   Rental completed        -> all three above are true. A listing label or tenancy status is NOT an input.

export type ChecklistState = 'done' | 'current' | 'upcoming' | 'blocked'

export type ChecklistTerms = { status?: string | null } | null | undefined
export type ChecklistPayment = { status?: string | null; verified_by?: string | null }
export type ChecklistSubmission = { status?: string | null }
export type ChecklistHandover = { status?: string | null } | null | undefined

export type ChecklistInput = {
  terms: ChecklistTerms
  payments?: ChecklistPayment[] | null
  submissions?: ChecklistSubmission[] | null
  handover?: ChecklistHandover
  // Only used to flag a mismatch. It never makes a step complete.
  listingStatus?: string | null
}

export type ChecklistKey = 'agreement' | 'payment' | 'handover' | 'completed'

export type ChecklistItem = {
  key: ChecklistKey
  title: string
  state: ChecklistState
  label: string
  detail: string
}

// The single, plain-language stage the tenant is in, from signed agreement onwards.
export type RentalStage =
  | 'agreement_pending'
  | 'agreement_recorded'
  | 'payment_pending'
  | 'payment_awaiting_check'
  | 'payment_needs_attention'
  | 'payment_verified'
  | 'handover_pending'
  | 'handover_disputed'
  | 'rental_completed'

export type Checklist = {
  stage: RentalStage
  items: ChecklistItem[]
  agreementRecorded: boolean
  paymentVerified: boolean
  handoverConfirmed: boolean
  rentalCompleted: boolean
  // True when the listing says 'rented' but the records above do not support it (needs EboHomes review).
  listingMismatch: boolean
}

const OPEN_SUB = ['submitted', 'under_review']
const ATTENTION_SUB = ['needs_info', 'rejected']

export function isVerifiedPayment(p: ChecklistPayment): boolean {
  return p.status === 'confirmed' && !!p.verified_by
}

export function buildChecklist(inp: ChecklistInput): Checklist {
  const agreementRecorded = inp.terms?.status === 'signed'
  const payments = inp.payments ?? []
  const subs = inp.submissions ?? []
  const paymentVerified = payments.some(isVerifiedPayment) || subs.some((s) => s.status === 'verified')
  const awaiting = subs.some((s) => OPEN_SUB.includes(s.status ?? ''))
  const attention = !awaiting && subs.some((s) => ATTENTION_SUB.includes(s.status ?? ''))
  const hs = inp.handover?.status ?? null
  const handoverConfirmed = hs === 'completed'
  const disputed = hs === 'disputed'
  // Payment and handover only count once the step before them is real.
  const rentalCompleted = agreementRecorded && paymentVerified && handoverConfirmed
  const listingMismatch = inp.listingStatus === 'rented' && !rentalCompleted

  let stage: RentalStage
  if (!agreementRecorded) stage = 'agreement_pending'
  else if (rentalCompleted) stage = 'rental_completed'
  else if (!paymentVerified) stage = awaiting ? 'payment_awaiting_check' : attention ? 'payment_needs_attention' : inp.submissions && subs.length === 0 && payments.length === 0 ? 'agreement_recorded' : 'payment_pending'
  else if (disputed) stage = 'handover_disputed'
  else if (hs === 'open' || hs === null) stage = 'handover_pending'
  else stage = 'payment_verified'

  const agreement: ChecklistItem = agreementRecorded
    ? { key: 'agreement', title: 'Agreement recorded', state: 'done', label: 'Recorded', detail: 'EboHomes recorded your signed agreement. A signed agreement alone does not make this property rented.' }
    : { key: 'agreement', title: 'Agreement recorded', state: 'current', label: 'Not recorded yet', detail: 'EboHomes records the signed agreement after both sides accept the terms.' }

  let payment: ChecklistItem
  if (!agreementRecorded) payment = { key: 'payment', title: 'Required payment verified', state: 'upcoming', label: 'Not started', detail: 'Payment opens after your signed agreement is recorded.' }
  else if (paymentVerified) payment = { key: 'payment', title: 'Required payment verified', state: 'done', label: 'Verified by EboHomes', detail: 'EboHomes checked the bank account and verified your payment.' }
  else if (awaiting) payment = { key: 'payment', title: 'Required payment verified', state: 'current', label: 'Waiting for EboHomes to check', detail: 'You sent evidence. It is NOT verified yet. A receipt or screenshot is not proof the money arrived.' }
  else if (attention) payment = { key: 'payment', title: 'Required payment verified', state: 'blocked', label: 'Action needed', detail: 'EboHomes asked for more information or did not accept your evidence. Open the payment page and send a correction.' }
  else payment = { key: 'payment', title: 'Required payment verified', state: 'current', label: 'Payment due', detail: 'Pay the amount in your signed agreement, then send your evidence.' }

  let handover: ChecklistItem
  if (!paymentVerified) handover = { key: 'handover', title: 'Key handover confirmed', state: 'upcoming', label: 'Not started', detail: 'Handover can be confirmed after EboHomes verifies your payment.' }
  else if (handoverConfirmed) handover = { key: 'handover', title: 'Key handover confirmed', state: 'done', label: 'Both confirmed', detail: 'You and the landlord both confirmed the key handover.' }
  else if (disputed) handover = { key: 'handover', title: 'Key handover confirmed', state: 'blocked', label: 'Disputed', detail: 'EboHomes is reviewing a handover concern. Wait for the outcome.' }
  else handover = { key: 'handover', title: 'Key handover confirmed', state: 'current', label: 'Waiting for confirmation', detail: 'Confirm once you have received the keys. The landlord confirms their side too.' }

  const completed: ChecklistItem = rentalCompleted
    ? { key: 'completed', title: 'Rental completed', state: 'done', label: 'Completed', detail: 'Agreement recorded, payment verified and key handover confirmed.' }
    : { key: 'completed', title: 'Rental completed', state: 'upcoming', label: 'Not completed', detail: 'The rental is complete only after all three steps above are done.' }

  return { stage, items: [agreement, payment, handover, completed], agreementRecorded, paymentVerified, handoverConfirmed, rentalCompleted, listingMismatch }
}