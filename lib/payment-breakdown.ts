// Pure helpers for the itemised "what you are paying" list on the Pay page. No imports, so they can be unit tested.
// Every amount comes from the SIGNED agreement. The agreement stores the fees as one total (fees_amount), while the
// accepted offer keeps each fee with its name. We only show the named items when they add up exactly to the signed
// total. If they do not, or the offer cannot be read, the Pay page keeps showing the single "Fees" line.
// Nothing here creates, changes or adds a charge.

export type NamedCharge = { label: string; amount: number }

const toNumber = (v: unknown): number => {
  if (typeof v === 'number') return v
  if (typeof v === 'string') {
    const t = v.replace(/,/g, '').trim()
    return t === '' ? NaN : Number(t)
  }
  return NaN
}

export function readCharges(raw: unknown): NamedCharge[] {
  if (!Array.isArray(raw)) return []
  const out: NamedCharge[] = []
  for (const row of raw) {
    const label = typeof (row as any)?.label === 'string' ? (row as any).label.trim().replace(/\s+/g, ' ') : ''
    const amount = toNumber((row as any)?.amount)
    if (label && Number.isFinite(amount) && amount > 0) out.push({ label, amount })
  }
  return out
}

// Returns the named fees only when they add up to the signed total (within one kobo-level rounding of 0.01).
export function itemisedFees(charges: unknown, signedFeesTotal: unknown): NamedCharge[] | null {
  const items = readCharges(charges)
  const signed = toNumber(signedFeesTotal)
  if (items.length === 0 || !Number.isFinite(signed) || signed <= 0) return null
  const sum = items.reduce((a, c) => a + c.amount, 0)
  return Math.abs(sum - signed) <= 0.01 ? items : null
}

// The deposit is shown to tenants as "Caution deposit", the name used on listings.
export function displayLabel(key: 'rent' | 'deposit' | 'fees', label: string): string {
  return key === 'deposit' ? 'Caution deposit' : label
}

export function totalDue(lines: { amount: number }[]): number {
  return lines.reduce((a, l) => a + (Number.isFinite(l.amount) ? l.amount : 0), 0)
}
