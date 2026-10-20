// Pure helpers for the tenant payment section. No imports, so they can be unit tested directly.

// Where tenants send bank transfers. Shown read-only on the tenant's tenancy page after sign-in.
// SAFETY: change these only through a reviewed code change (commit). There is deliberately no form or database
// field that edits them, so nobody can swap the account number from inside the app.
export const BANK_TRANSFER = {
  bankName: 'Opay',
  accountName: 'EboHomes',
  accountNumber: '9048569619',
} as const

export type SignedTermsLike = {
  rent_amount?: number | string | null
  deposit_amount?: number | string | null
  fees_amount?: number | string | null
}

export type AmountLine = { key: 'rent' | 'deposit' | 'fees'; label: string; amount: number }

function positive(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null
}

// The amounts a tenant agreed to, from the SIGNED rental terms only. Zero, empty or invalid items are left out.
export function amountLines(terms: SignedTermsLike | null | undefined, period?: string | null): AmountLine[] {
  if (!terms) return []
  const out: AmountLine[] = []
  const rent = positive(terms.rent_amount)
  const deposit = positive(terms.deposit_amount)
  const fees = positive(terms.fees_amount)
  if (rent) out.push({ key: 'rent', label: period ? `Rent (${period})` : 'Rent', amount: rent })
  if (deposit) out.push({ key: 'deposit', label: 'Deposit', amount: deposit })
  if (fees) out.push({ key: 'fees', label: 'Fees', amount: fees })
  return out
}

// The text the tenant puts in the transfer description so EboHomes can match the payment to the tenancy.
export function transferReference(tenancyCode: string | null | undefined): string | null {
  const c = (tenancyCode ?? '').trim()
  return c.length > 0 ? c : null
}