// Pure helpers for the 48-hour reservation. Mirrors 20261207_01_offer_tenancies.sql. The database is the real gate.

export const RESERVATION_HOURS = 48
export const EXTEND_MIN_HOURS = 1
export const EXTEND_MAX_HOURS = 168
export const REASON_MIN = 10
export const REASON_MAX = 600

export function reservationTimeLeft(reservedUntil: string | null | undefined, now: Date = new Date()): string {
  if (!reservedUntil) return ''
  const ms = new Date(reservedUntil).getTime() - now.getTime()
  if (!Number.isFinite(ms)) return ''
  if (ms <= 0) return 'Overdue'
  const hours = Math.floor(ms / 3_600_000)
  if (hours >= 48) return `${Math.floor(hours / 24)} days left`
  if (hours >= 1) return `${hours} hour${hours === 1 ? '' : 's'} left`
  return `${Math.max(1, Math.floor(ms / 60_000))} minutes left`
}

export function isReservationOverdue(reservedUntil: string | null | undefined, now: Date = new Date()): boolean {
  if (!reservedUntil) return false
  const t = new Date(reservedUntil).getTime()
  return Number.isFinite(t) && t <= now.getTime()
}

export function validateReason(text: unknown): { ok: true; value: string } | { ok: false; error: string } {
  const v = typeof text === 'string' ? text.trim().replace(/\s+/g, ' ') : ''
  if (v.length < REASON_MIN) return { ok: false, error: `Write a clear reason (at least ${REASON_MIN} characters).` }
  if (v.length > REASON_MAX) return { ok: false, error: `Keep the reason under ${REASON_MAX} characters.` }
  return { ok: true, value: v }
}

export function validateExtendHours(raw: unknown): { ok: true; value: number } | { ok: false; error: string } {
  const n = typeof raw === 'number' ? raw : Number(String(raw ?? '').trim())
  if (!Number.isInteger(n) || n < EXTEND_MIN_HOURS || n > EXTEND_MAX_HOURS) {
    return { ok: false, error: `Extend by ${EXTEND_MIN_HOURS} to ${EXTEND_MAX_HOURS} hours.` }
  }
  return { ok: true, value: n }
}

export const PENDING_STATUSES = ['pending', 'awaiting_payment'] as const
export const PENDING_LABEL: Record<string, string> = {
  pending: 'Pending: agreement and payment needed',
  awaiting_payment: 'Agreement signed: payment needed',
}
