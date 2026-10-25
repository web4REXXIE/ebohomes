// Pure helpers that decide which payments are DONE, from the saved payment records only.
// A payment counts as verified only when status = 'confirmed' AND verified_by is set (see lib/payment-status).
// A browser redirect, a button click or any client-side state is never an input here.
import { getPaymentState } from './payment-status'

export type Purpose = 'rent' | 'deposit' | 'fees'
export const ONE_OFF: Purpose[] = ['deposit', 'fees']
export const PURPOSE_NAME: Record<Purpose, string> = { rent: 'Rent', deposit: 'Deposit', fees: 'Fees' }

export type PayRow = {
  id: string
  amount: number | string | null
  type?: string | null
  status?: string | null
  verified_by?: string | null
  receipt_code?: string | null
  created_at?: string | null
  reference?: string | null
}
// Evidence a tenant uploaded for a bank transfer (payment_submissions). Evidence is NOT a payment record.
export type Proof = { payment_type?: string | null; amount_paid?: number | string | null; status?: string | null }
export type Agreed = { rent?: number | string | null; deposit?: number | string | null; fees?: number | string | null }

// verified: EboHomes checked it. awaiting: recorded or evidence sent, not verified yet. partial: less than agreed.
export type ChargeState = 'verified' | 'awaiting' | 'partial' | 'none'
export type ChargeInfo = { state: ChargeState; latest: PayRow | null }

export type PaymentSummary = {
  charges: Record<Purpose, ChargeInfo>
  verified: PayRow[]
  latestVerified: PayRow | null
  anyAwaiting: boolean
  // One-off charges (deposit, fees) that are in the agreement and still need paying.
  openOneOff: Purpose[]
}

const cents = (v: unknown): number => {
  const n = typeof v === 'string' ? Number(v.replace(/,/g, '')) : v
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0
}
const time = (iso?: string | null) => { const t = iso ? new Date(iso).getTime() : 0; return Number.isFinite(t) ? t : 0 }

// payments.type uses 'fee' (singular). Our purpose uses 'fees'.
export function purposeOf(type: string | null | undefined): Purpose | null {
  if (type === 'rent') return 'rent'
  if (type === 'deposit') return 'deposit'
  if (type === 'fee' || type === 'fees') return 'fees'
  return null
}

const OPEN_PROOF = ['submitted', 'under_review']

export function summarisePayments(payments: PayRow[], opts: { agreed?: Agreed | null; proofs?: Proof[] } = {}): PaymentSummary {
  const agreed = opts.agreed ?? {}
  const proofs = opts.proofs ?? []
  const charges = {} as Record<Purpose, ChargeInfo>
  for (const p of ['rent', 'deposit', 'fees'] as Purpose[]) {
    let verifiedC = 0
    let awaitingC = 0
    let latest: PayRow | null = null
    for (const row of payments) {
      if (purposeOf(row.type) !== p) continue
      const st = getPaymentState(row)
      if (st === 'verified') verifiedC += cents(row.amount)
      else if (st === 'awaiting_verification' || st === 'legacy_confirmed') awaitingC += cents(row.amount)
      else continue
      if (!latest || time(row.created_at) > time(latest.created_at)) latest = row
    }
    for (const pr of proofs) {
      if (purposeOf(pr.payment_type) === p && OPEN_PROOF.includes(pr.status ?? '')) awaitingC += cents(pr.amount_paid)
    }
    const target = cents(agreed[p])
    const total = verifiedC + awaitingC
    let state: ChargeState
    if (total === 0) state = 'none'
    else if (target > 0 && verifiedC >= target) state = 'verified'
    else if (target > 0 && total >= target) state = 'awaiting'
    else if (target > 0) state = 'partial'
    else state = verifiedC > 0 ? 'verified' : 'awaiting'
    charges[p] = { state, latest }
  }
  const verified = payments
    .filter((r) => getPaymentState(r) === 'verified')
    .sort((a, b) => time(b.created_at) - time(a.created_at))
  return {
    charges,
    verified,
    latestVerified: verified[0] ?? null,
    anyAwaiting: (['rent', 'deposit', 'fees'] as Purpose[]).some((p) => charges[p].state === 'awaiting')
      || payments.some((r) => ['awaiting_verification', 'legacy_confirmed'].includes(getPaymentState(r)))
      || proofs.some((pr) => OPEN_PROOF.includes(pr.status ?? '')),
    openOneOff: ONE_OFF.filter((p) => cents(agreed[p]) > 0 && (charges[p].state === 'none' || charges[p].state === 'partial')),
  }
}

// Can the tenant start another payment for this item?
// Deposit and fees are paid once, so they close when verified or waiting for verification.
// Rent repeats every period and EboHomes has no due-date schedule, so rent stays open. The panel warns instead.
export function canPay(purpose: Purpose, s: PaymentSummary): boolean {
  if (purpose === 'rent') return true
  const st = s.charges[purpose].state
  return st === 'none' || st === 'partial'
}

const naira = (n: number) => '₦' + n.toLocaleString('en-NG', { maximumFractionDigits: 2 })

export const CHARGE_LABEL: Record<Exclude<ChargeState, 'none'>, string> = {
  verified: 'Paid and verified',
  awaiting: 'Recorded, awaiting verification',
  partial: 'Part payment recorded',
}

// Shown before a second rent payment. Nothing here invents a due date.
export function rentRepeatNote(s: PaymentSummary): string | null {
  const c = s.charges.rent
  if (c.state === 'none' || !c.latest) return null
  const amt = naira(Number(c.latest.amount) || 0)
  const status = c.state === 'verified' ? 'verified by EboHomes' : 'waiting for EboHomes to verify it'
  return `A rent payment of ${amt} is already on record (${status}). Pay rent again only for a new rental period.`
}

type PanelLike = { heading: string; happened: string; means: string; next: string; action: string }

// When the agreement is recorded and a payment is verified, the journey headline says so instead of "pay what is due".
// Only the wording changes. The journey stage itself still comes from the saved tenancy and terms.
export function paymentPanelOverride<T extends PanelLike>(panel: T, phase: string, s: PaymentSummary): T {
  if (phase !== 'terms_signed') return panel
  const open = s.openOneOff.map((p) => PURPOSE_NAME[p].toLowerCase())
  if (s.latestVerified) {
    return {
      ...panel,
      heading: 'Payment verified. Your agreement is recorded',
      happened: 'EboHomes verified your payment and recorded your signed agreement.',
      means: 'Your payment is confirmed. Your tenancy shows as active only when its status becomes active.',
      next: 'Keep your receipt. Your tenancy appears as active here as soon as its status becomes active.',
      action: open.length ? `Pay the remaining ${open.join(' and ')} in the payment section.` : 'Nothing more to pay right now.',
    }
  }
  if (s.anyAwaiting) {
    return {
      ...panel,
      heading: 'Your payment is recorded. EboHomes is checking it',
      means: 'A payment is on record, but it is not verified until EboHomes has checked it.',
      next: 'EboHomes will verify the payment. Your receipt appears here once it is verified.',
      action: 'You do not need to pay it again.',
    }
  }
  return panel
}

// Server use: is this one-off charge already paid, or waiting for EboHomes to verify it?
// Reads saved payment records, plus bank-transfer proof that EboHomes has not decided on yet.
export function settledByPayments(payments: PayRow[], purpose: Purpose, agreedAmount: number | string | null | undefined, proofs: Proof[] = []): boolean {
  if (purpose === 'rent') return false
  const s = summarisePayments(payments, { agreed: { [purpose]: agreedAmount }, proofs })
  const st = s.charges[purpose].state
  return st === 'verified' || st === 'awaiting'
}