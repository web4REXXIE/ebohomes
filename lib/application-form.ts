// Pure helpers for the rental application form. No React, no Supabase, so they can be unit tested.
// Database facts this relies on (all already used by the existing code):
//   applications.status      : pending | info_requested | approved | rejected | withdrawn
//   applications.message     : free text
//   applications.application_data : jsonb (already read by the admin and landlord pages)
// Phone is deliberately NOT stored in application_data: landlords can read that column, and the
// landlord dashboard only reveals a tenant's phone after approval. Phone goes to the tenant's own profile.

export const OPEN_STATUSES = ['pending', 'info_requested', 'approved'] as const

export const OCCUPATIONS = [
  'Employed',
  'Self-employed',
  'Student',
  'Retired',
  'Between jobs',
  'Other',
] as const

export type ApplicationForm = {
  fullName: string
  phone: string
  moveInDate: string // yyyy-mm-dd
  occupants: string // kept as text while typing
  occupation: string
  message: string
}

export type FieldErrors = Partial<Record<keyof ApplicationForm, string>>

export const MAX_OCCUPANTS = 20
export const MAX_MESSAGE = 1000

export function normalisePhone(raw: string): string {
  const trimmed = (raw ?? '').trim()
  const plus = trimmed.startsWith('+') ? '+' : ''
  return plus + trimmed.replace(/\D/g, '')
}

// Accepts Nigerian local (0803...), international Nigerian (+234803... / 234803...) and other
// international numbers of 8-15 digits. This is a sanity check, not proof the number is live.
export function isValidPhone(raw: string): boolean {
  const p = normalisePhone(raw)
  const digits = p.replace('+', '')
  if (p.startsWith('+')) return digits.length >= 8 && digits.length <= 15
  if (/^0\d{10}$/.test(p)) return true
  if (/^234\d{10}$/.test(p)) return true
  return false
}

export function todayIso(now: Date = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function isValidDateString(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const d = new Date(`${s}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

export function validateApplication(f: ApplicationForm, now: Date = new Date()): FieldErrors {
  const e: FieldErrors = {}

  const name = f.fullName.trim().replace(/\s+/g, ' ')
  if (name.length < 2) e.fullName = 'Enter your full name.'
  else if (!name.includes(' ')) e.fullName = 'Enter your first and last name.'
  else if (name.length > 120) e.fullName = 'That name is too long.'

  if (!f.phone.trim()) e.phone = 'Enter a phone number EboHomes can reach you on.'
  else if (!isValidPhone(f.phone)) e.phone = 'Enter a valid phone number, for example 0803 123 4567.'

  if (!f.moveInDate) e.moveInDate = 'Choose your preferred move-in date.'
  else if (!isValidDateString(f.moveInDate)) e.moveInDate = 'Enter a valid date.'
  else if (f.moveInDate < todayIso(now)) e.moveInDate = 'Move-in date cannot be in the past.'

  const n = Number(f.occupants)
  if (!f.occupants.trim()) e.occupants = 'Enter how many people will live in the property.'
  else if (!Number.isInteger(n) || n < 1) e.occupants = 'Enter a whole number of 1 or more.'
  else if (n > MAX_OCCUPANTS) e.occupants = `For more than ${MAX_OCCUPANTS} occupants, please contact EboHomes.`

  if (!f.occupation) e.occupation = 'Choose the option that best describes you.'
  else if (!(OCCUPATIONS as readonly string[]).includes(f.occupation)) e.occupation = 'Choose one of the listed options.'

  if (f.message.trim().length > MAX_MESSAGE) e.message = `Please keep your note under ${MAX_MESSAGE} characters.`

  return e
}

export function hasErrors(e: FieldErrors): boolean {
  return Object.keys(e).length > 0
}

// Shape written to applications.application_data. No contact details, no documents.
export function buildApplicationData(f: ApplicationForm) {
  return {
    full_name: f.fullName.trim().replace(/\s+/g, ' '),
    move_in_date: f.moveInDate,
    occupants: Number(f.occupants),
    occupation: f.occupation,
    form_version: 2,
  }
}

// Row inserted into public.applications. Only columns the existing code already writes.
// Workflow columns (decided_by, info_request, ...) are left out on purpose: enforce_application_rules
// rejects them on a tenant insert.
export function buildApplicationRow(
  f: ApplicationForm,
  ids: { tenantId: string; listingId: string; landlordId: string }
) {
  return {
    tenant_id: ids.tenantId,
    listing_id: ids.listingId,
    landlord_id: ids.landlordId,
    status: 'pending' as const,
    message: f.message.trim() || null,
    application_data: buildApplicationData(f),
  }
}

export type SubmitErrorKind =
  | 'duplicate'
  | 'inactive_account'
  | 'not_permitted'
  | 'not_open'
  | 'schema'
  | 'network'
  | 'unknown'

export type DbErrorLike = { code?: string | null; message?: string | null; details?: string | null; hint?: string | null } | null | undefined

// Turns a Supabase/PostgREST error into a tenant-safe message plus a short support code.
// The raw message is never shown to tenants; callers log it to the console for staff to read.
export function classifySubmitError(err: DbErrorLike): { kind: SubmitErrorKind; message: string; supportCode: string } {
  const code = (err?.code ?? '').toString()
  const msg = (err?.message ?? '').toString()
  const supportCode = code ? `APP-${code}` : 'APP-ERR'

  if (code === '23505')
    return { kind: 'duplicate', supportCode, message: 'You already have an open application for this property.' }
  if (/not active/i.test(msg))
    return { kind: 'inactive_account', supportCode, message: 'Your account is not active, so you cannot apply right now. Please contact EboHomes support.' }
  if (code === '42501' || /row-level security/i.test(msg))
    return { kind: 'not_permitted', supportCode, message: 'You are not able to apply to this property. It may no longer be open for applications.' }
  if (code === '23503')
    return { kind: 'not_open', supportCode, message: 'This property is no longer available for applications.' }
  if (['42703', '42P01', 'PGRST204', 'PGRST205', '23502', '23514', '22P02'].includes(code))
    return { kind: 'schema', supportCode, message: 'We could not submit your application because of a system problem on our side. Please contact EboHomes support and quote the code below.' }
  if (/failed to fetch|networkerror|load failed/i.test(msg))
    return { kind: 'network', supportCode: 'APP-NET', message: 'We could not reach EboHomes. Check your connection and try again. Nothing was submitted.' }
  return { kind: 'unknown', supportCode, message: 'Something went wrong submitting your application. Please try again, or contact EboHomes support and quote the code below.' }
}

// ---- Display helpers (UI only, no database access) ----

export function formatMoveIn(iso: unknown): string {
  if (typeof iso !== 'string' || !isValidDateString(iso)) return '—'
  const d = new Date(`${iso}T00:00:00`)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

// Turns application_data (jsonb, may be null, may come from the older two-field form) into labelled rows
// for the admin and landlord screens. Unknown keys are ignored here; the admin page still lists them raw.
export function describeApplicationData(data: unknown): { label: string; value: string }[] {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return []
  const d = data as Record<string, unknown>
  const rows: { label: string; value: string }[] = []
  if (typeof d.full_name === 'string' && d.full_name.trim()) rows.push({ label: 'Name given', value: d.full_name.trim() })
  if (d.move_in_date) rows.push({ label: 'Move-in', value: formatMoveIn(d.move_in_date) })
  const n = Number(d.occupants)
  if (Number.isInteger(n) && n > 0) rows.push({ label: 'Occupants', value: String(n) })
  if (typeof d.occupation === 'string' && d.occupation.trim()) rows.push({ label: 'Occupation', value: d.occupation.trim() })
  return rows
}