// Decides which notifications are sent by EMAIL. No imports, so it can be unit tested directly.
// WHY: the free email plan allows about 100 emails a day. Everything is still shown in the app and by push.
// Email is only for the urgent events: payments and handover, offers and rental terms, a hidden or paused listing,
// and security / verification results.
// Everything else (messages, viewings, reminders, new applications, general updates) stays in the app and push only.

export type EmailCandidate = {
  type: string | null
  title: string | null
  message: string | null
}

// Always emailed, same rule as in-app delivery.
export const ALWAYS_EMAIL_TYPES = new Set(['security', 'verification'])

export function isUrgentEmail(n: EmailCandidate): boolean {
  const type = n.type ?? 'general'
  const title = (n.title ?? '').toLowerCase()
  const text = `${title} ${(n.message ?? '').toLowerCase()}`

  if (ALWAYS_EMAIL_TYPES.has(type)) return true

  // Payments and key handover (the handover notices are sent with the "payment" type).
  if (type === 'payment') return true

  // Tenancy notices: terms to accept, reservation ending, handover reminders.
  if (type === 'tenancy') return true

  // A listing that EboHomes hid, paused, suspended or did not approve.
  if (type === 'listing') {
    return /\b(suspended|paused|hidden|rejected|not approved)\b/.test(text)
  }

  // Offers and rental terms. Other application notices (new application, viewing, reminders) are not emailed.
  if (type === 'application') {
    return /\b(offer|offered|rent terms|rental terms)\b/.test(title)
  }

  return false
}
