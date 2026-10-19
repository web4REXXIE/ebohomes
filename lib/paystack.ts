// Paystack helpers. Pure functions only (plus node:crypto), so they can be unit tested directly.
// SAFETY: online payments stay OFF unless PAYSTACK_ENABLED=true AND a secret key is set.
// A live key (sk_live_) is refused unless PAYSTACK_ALLOW_LIVE=true is ALSO set, so a live key cannot be used by accident.
import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto'

export type EnvLike = Record<string, string | undefined>
export type Purpose = 'rent' | 'deposit' | 'fees'
export const PURPOSES: Purpose[] = ['rent', 'deposit', 'fees']

export type PaystackConfig =
  | { ok: true; secret: string; live: boolean }
  | { ok: false; reason: 'disabled' | 'missing_key' | 'live_not_allowed' }

export function paystackConfig(env: EnvLike): PaystackConfig {
  if (env.PAYSTACK_ENABLED !== 'true') return { ok: false, reason: 'disabled' }
  const secret = (env.PAYSTACK_SECRET_KEY ?? '').trim()
  if (!secret) return { ok: false, reason: 'missing_key' }
  const live = secret.startsWith('sk_live_')
  if (live && env.PAYSTACK_ALLOW_LIVE !== 'true') return { ok: false, reason: 'live_not_allowed' }
  return { ok: true, secret, live }
}

// Naira -> kobo. Returns null for anything that is not a positive amount with at most 2 decimals.
export function toKobo(naira: unknown): number | null {
  const n = typeof naira === 'string' ? Number(naira) : naira
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return null
  const kobo = Math.round(n * 100)
  if (Math.abs(kobo / 100 - n) > 1e-9) return null
  return kobo
}

export function newReference(): string {
  return 'EBO-' + randomUUID().replace(/-/g, '').toUpperCase()
}

export type SignedTerms = { rent_amount?: number | null; deposit_amount?: number | null; fees_amount?: number | null }

// The amount ALWAYS comes from the signed rental terms on the server. The browser never sends an amount.
export function amountForPurpose(terms: SignedTerms, purpose: Purpose): number | null {
  const v = purpose === 'rent' ? terms.rent_amount : purpose === 'deposit' ? terms.deposit_amount : terms.fees_amount
  return toKobo(v ?? null)
}

export function isPurpose(x: unknown): x is Purpose {
  return typeof x === 'string' && (PURPOSES as string[]).includes(x)
}

// Paystack signs the RAW request body with HMAC-SHA512 using the secret key (header: x-paystack-signature).
export function signatureValid(rawBody: string, signature: string | null | undefined, secret: string): boolean {
  if (!signature || !secret) return false
  const expected = createHmac('sha512', secret).update(rawBody).digest('hex')
  const a = Buffer.from(expected)
  const b = Buffer.from(signature.trim().toLowerCase())
  return a.length === b.length && timingSafeEqual(a, b)
}

export type VerifyData = { status?: string; reference?: string; amount?: number; currency?: string }

// A charge counts only when Paystack's own verify call says success, with the same reference, amount and currency we stored.
export function chargeMatches(data: VerifyData | null | undefined, row: { reference: string; amount_kobo: number; currency: string }): boolean {
  return !!data && data.status === 'success' && data.reference === row.reference
    && data.amount === row.amount_kobo && data.currency === row.currency
}

// ---------- Settlement rules (pure) ----------
export type TxStatus = 'initiated' | 'paid' | 'mismatch' | 'failed' | 'abandoned'
export type Settlement = 'paid' | 'mismatch' | 'failed' | 'abandoned' | 'pending'

// What Paystack's own verify call says about a charge, mapped to what we do. The browser redirect is never an input.
//   success + same reference/amount/currency -> paid        success but anything differs -> mismatch (manual review)
//   failed, reversed -> failed                              abandoned (customer cancelled / closed the page) -> abandoned
//   ongoing, pending, processing, queued, unknown -> pending (no change yet)
export function decideSettlement(row: { reference: string; amount_kobo: number; currency: string }, data: VerifyData | null | undefined): Settlement {
  if (!data || typeof data.status !== 'string') return 'pending'
  switch (data.status) {
    case 'success': return chargeMatches(data, row) ? 'paid' : 'mismatch'
    case 'failed':
    case 'reversed': return 'failed'
    case 'abandoned': return 'abandoned'
    default: return 'pending'
  }
}

// The only allowed moves. 'paid' and 'mismatch' are final, so a duplicate webhook, a second redirect or a late
// "failed" can never undo or repeat a payment. An abandoned or failed attempt may still become paid if Paystack says so.
export function nextStatus(current: TxStatus, decision: Settlement): TxStatus | null {
  if (current === 'paid' || current === 'mismatch') return null
  if (decision === 'pending') return null
  return decision === current ? null : decision
}

export const PURPOSE_LABEL: Record<Purpose, string> = { rent: 'Rent', deposit: 'Deposit', fees: 'Fees' }
// payments.type uses 'fee' (singular); our purpose uses 'fees'.
export function paymentTypeFor(purpose: Purpose): 'rent' | 'deposit' | 'fee' {
  return purpose === 'fees' ? 'fee' : purpose
}