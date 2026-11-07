// Pure helpers for rental offers. No imports, so the client and tests share them.
// These mirror the database rules in 20261206_05_rental_offers.sql. The database is the real gate.

export type OfferStatus = 'offered' | 'countered' | 'accepted' | 'declined' | 'expired' | 'withdrawn' | 'superseded'

export const OFFER_LIVE: readonly OfferStatus[] = ['offered', 'countered', 'accepted']
export const OFFER_PERIODS = ['monthly', 'yearly'] as const
export const MAX_CHARGES = 8
export const MAX_VERSIONS = 6
export const OFFER_MIN_HOURS = 24
export const OFFER_MAX_HOURS = 336
export const OFFER_DEFAULT_HOURS = 72

export type Charge = { label: string; amount: number }

export const OFFER_STATUS_LABEL: Record<OfferStatus, string> = {
  offered: 'Offer open',
  countered: 'Counter-offer sent',
  accepted: 'Offer accepted',
  declined: 'Offer declined',
  expired: 'Offer expired',
  withdrawn: 'Offer withdrawn',
  superseded: 'Replaced by a newer version',
}

const toNumber = (v: unknown): number => {
  if (typeof v === 'number') return v
  if (typeof v === 'string') {
    const t = v.replace(/,/g, '').trim()
    return t === '' ? NaN : Number(t)
  }
  return NaN
}

const clean = (v: unknown) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '')

export function todayIso(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10)
}

export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

function isRealDate(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false
  const [y, m, d] = iso.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d))
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d
}

export function chargesTotal(charges: unknown): number {
  if (!Array.isArray(charges)) return 0
  return charges.reduce((sum, c) => {
    const n = toNumber((c as any)?.amount)
    return sum + (Number.isFinite(n) && n > 0 ? n : 0)
  }, 0)
}

export function isOfferExpired(expiresAt: string | null | undefined, now: Date = new Date()): boolean {
  if (!expiresAt) return false
  const t = new Date(expiresAt).getTime()
  return Number.isFinite(t) && t <= now.getTime()
}

export function offerTimeLeft(expiresAt: string | null | undefined, now: Date = new Date()): string {
  if (!expiresAt) return ''
  const ms = new Date(expiresAt).getTime() - now.getTime()
  if (!Number.isFinite(ms)) return ''
  if (ms <= 0) return 'Expired'
  const hours = Math.floor(ms / 3_600_000)
  if (hours >= 48) return `${Math.floor(hours / 24)} days left`
  if (hours >= 1) return `${hours} hour${hours === 1 ? '' : 's'} left`
  return `${Math.max(1, Math.floor(ms / 60_000))} minutes left`
}

export type OfferInput = {
  rent_amount: number
  rent_period: (typeof OFFER_PERIODS)[number]
  duration_months: number
  start_date: string
  deposit_amount: number
  charges: Charge[]
  payment_schedule: string | null
  notice_days: number | null
  house_rules: string | null
  note: string | null
  hours: number
}

// Raw values come from form fields, so numbers may be strings.
export function validateOfferInput(
  raw: Record<string, unknown>,
  now: Date = new Date()
): { ok: true; value: OfferInput } | { ok: false; errors: Record<string, string> } {
  const e: Record<string, string> = {}

  const rent = toNumber(raw.rent_amount)
  if (!Number.isFinite(rent) || rent <= 0) e.rent_amount = 'Enter the rent.'
  else if (rent > 100_000_000_000) e.rent_amount = 'That rent is too large.'

  const period = clean(raw.rent_period)
  if (!(OFFER_PERIODS as readonly string[]).includes(period)) e.rent_period = 'Choose monthly or yearly.'

  const dur = toNumber(raw.duration_months)
  if (!Number.isInteger(dur) || dur < 1 || dur > 60) e.duration_months = 'Rental length must be 1 to 60 months.'

  const start = clean(raw.start_date)
  const today = todayIso(now)
  if (!isRealDate(start)) e.start_date = 'Choose a start date.'
  else if (start < today) e.start_date = 'The start date cannot be in the past.'
  else if (start > addDaysIso(today, 180)) e.start_date = 'Choose a start date within the next 180 days.'

  const depRaw = raw.deposit_amount
  const dep = depRaw === '' || depRaw == null ? 0 : toNumber(depRaw)
  if (!Number.isFinite(dep) || dep < 0 || dep > 100_000_000_000) e.deposit_amount = 'Enter a valid deposit, or 0.'

  const charges: Charge[] = []
  const rows = Array.isArray(raw.charges) ? raw.charges : []
  for (const row of rows) {
    const label = clean((row as any)?.label)
    const amountRaw = (row as any)?.amount
    const blank = label === '' && (amountRaw === '' || amountRaw == null)
    if (blank) continue
    const amount = toNumber(amountRaw)
    if (label.length < 2 || label.length > 60) { e.charges = 'Each charge needs a name of 2 to 60 characters.'; break }
    if (!Number.isFinite(amount) || amount <= 0 || amount > 100_000_000_000) { e.charges = 'Each charge needs an amount above zero.'; break }
    charges.push({ label, amount })
  }
  if (!e.charges && charges.length > MAX_CHARGES) e.charges = `You can list up to ${MAX_CHARGES} charges.`

  const schedule = clean(raw.payment_schedule)
  if (schedule.length > 300) e.payment_schedule = 'Keep the payment schedule under 300 characters.'

  let notice: number | null = null
  if (raw.notice_days !== '' && raw.notice_days != null) {
    const n = toNumber(raw.notice_days)
    if (!Number.isInteger(n) || n < 0 || n > 365) e.notice_days = 'Notice must be 0 to 365 days.'
    else notice = n
  }

  const rules = typeof raw.house_rules === 'string' ? raw.house_rules.trim() : ''
  if (rules.length > 2000) e.house_rules = 'Keep the house rules under 2000 characters.'

  const note = clean(raw.note)
  if (note.length > 600) e.note = 'Keep the note under 600 characters.'

  const hours = raw.hours === '' || raw.hours == null ? OFFER_DEFAULT_HOURS : toNumber(raw.hours)
  if (!Number.isInteger(hours) || hours < OFFER_MIN_HOURS || hours > OFFER_MAX_HOURS) {
    e.hours = 'An offer must stay open for 24 hours to 14 days (24 to 336 hours).'
  }

  if (Object.keys(e).length) return { ok: false, errors: e }
  return {
    ok: true,
    value: {
      rent_amount: rent,
      rent_period: period as OfferInput['rent_period'],
      duration_months: dur,
      start_date: start,
      deposit_amount: dep,
      charges,
      payment_schedule: schedule || null,
      notice_days: notice,
      house_rules: rules || null,
      note: note || null,
      hours,
    },
  }
}

export type CounterInput = { rent_amount: number; deposit_amount: number; start_date: string; duration_months: number }

export function validateCounter(
  raw: Record<string, unknown>,
  offer: { rent_amount: number; deposit_amount: number; start_date: string; duration_months: number },
  note: unknown,
  now: Date = new Date()
): { ok: true; value: CounterInput; note: string } | { ok: false; errors: Record<string, string> } {
  const e: Record<string, string> = {}
  const rent = toNumber(raw.rent_amount)
  if (!Number.isFinite(rent) || rent <= 0 || rent > 100_000_000_000) e.rent_amount = 'Enter the rent you propose.'
  const depRaw = raw.deposit_amount
  const dep = depRaw === '' || depRaw == null ? 0 : toNumber(depRaw)
  if (!Number.isFinite(dep) || dep < 0 || dep > 100_000_000_000) e.deposit_amount = 'Enter a valid deposit, or 0.'
  const dur = toNumber(raw.duration_months)
  if (!Number.isInteger(dur) || dur < 1 || dur > 60) e.duration_months = 'Length must be 1 to 60 months.'
  const start = clean(raw.start_date)
  const today = todayIso(now)
  if (!isRealDate(start)) e.start_date = 'Choose a start date.'
  else if (start < today) e.start_date = 'The start date cannot be in the past.'
  else if (start > addDaysIso(today, 180)) e.start_date = 'Choose a start date within the next 180 days.'
  const text = clean(note)
  if (text.length < 10) e.note = 'Explain your counter-offer in at least 10 characters.'
  else if (text.length > 600) e.note = 'Keep your note under 600 characters.'

  if (Object.keys(e).length === 0 &&
      rent === Number(offer.rent_amount) && dep === Number(offer.deposit_amount) &&
      start === offer.start_date && dur === Number(offer.duration_months)) {
    e.form = 'Change at least one term, or accept the offer as it is.'
  }
  if (Object.keys(e).length) return { ok: false, errors: e }
  return { ok: true, value: { rent_amount: rent, deposit_amount: dep, start_date: start, duration_months: dur }, note: text }
}

// Same test the database uses to decide if the landlord must confirm.
export function offerMatchesListing(
  o: { rent_period: string; rent_amount: number; deposit_amount: number; charges: unknown },
  l: { price_monthly: number | null; caution_deposit: number | null; service_charge: number | null }
): boolean {
  return (
    o.rent_period === 'monthly' &&
    l.price_monthly != null &&
    Number(o.rent_amount) === Number(l.price_monthly) &&
    Number(o.deposit_amount) <= Number(l.caution_deposit ?? 0) &&
    chargesTotal(o.charges) <= Number(l.service_charge ?? 0)
  )
}

export type OfferLike = { status: OfferStatus; offered_by_role: 'admin' | 'tenant'; landlord_confirmed_at: string | null; expires_at: string }

// Who has to act next on a live offer.
export function offerWaitingOn(o: OfferLike, now: Date = new Date()): 'landlord' | 'tenant' | 'admin' | 'none' {
  if (o.status === 'accepted') return 'admin'
  if (o.status === 'countered') return 'admin'
  if (o.status !== 'offered') return 'none'
  if (isOfferExpired(o.expires_at, now)) return 'none'
  return o.landlord_confirmed_at ? 'tenant' : 'landlord'
                             }
