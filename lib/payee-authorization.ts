// Pure helpers for the rent-payee request (Phase 10.2, Step F). Safe for client and server. No imports.
// The authorization file lives in the PRIVATE property-evidence bucket at  payee/<user>/<listing>/<random id>.<ext>
// This path rule must match the check inside eb_request_property_payee in SQL.

export const PAYEE_FOLDER = 'payee'
export const PAYEE_MAX_BYTES = 10 * 1024 * 1024
export const PAYEE_MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
}
export const MAX_PAYEE_FILES_PER_LISTING = 10
export type PayeeKind = 'agent' | 'company'

export function validatePayeeFileMeta(mime: unknown, bytes: unknown): string | null {
  if (typeof mime !== 'string' || !PAYEE_MIME_EXT[mime]) return 'Upload a JPG, PNG, WEBP or PDF.'
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes <= 0) return 'The selected file is empty.'
  if (bytes > PAYEE_MAX_BYTES) return 'The file is too large. The maximum is 10MB.'
  return null
}

export function payeePathFor(userId: string, listingId: string, mime: string, fileId: string): string {
  return `${PAYEE_FOLDER}/${userId}/${listingId}/${fileId}.${PAYEE_MIME_EXT[mime]}`
}

export function isValidPayeePath(path: unknown, userId: string, listingId: string): path is string {
  if (typeof path !== 'string' || path.length > 200) return false
  const parts = path.split('/')
  if (parts.length !== 4 || parts[0] !== PAYEE_FOLDER || parts[1] !== userId || parts[2] !== listingId) return false
  return /^[0-9a-f-]{36}\.(jpg|png|webp|pdf)$/.test(parts[3])
}

export type PayeeInput = {
  payee_kind: PayeeKind; payee_name: string; bank_name: string; account_number: string; account_name: string
}

export function validatePayeeInput(i: {
  payee_kind?: unknown; payee_name?: unknown; bank_name?: unknown; account_number?: unknown; account_name?: unknown
}): { ok: true; value: PayeeInput } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {}
  const kind = i.payee_kind === 'agent' || i.payee_kind === 'company' ? i.payee_kind : null
  const payee = typeof i.payee_name === 'string' ? i.payee_name.trim().replace(/\s+/g, ' ') : ''
  const bank = typeof i.bank_name === 'string' ? i.bank_name.trim() : ''
  const num = typeof i.account_number === 'string' ? i.account_number.replace(/[\s-]/g, '') : ''
  const name = typeof i.account_name === 'string' ? i.account_name.trim().replace(/\s+/g, ' ') : ''
  if (!kind) errors.payee_kind = 'Choose who should receive the rent.'
  if (payee.length < 2 || payee.length > 200) errors.payee_name = 'Enter the name of the payee.'
  if (bank.length < 2 || bank.length > 80) errors.bank_name = 'Enter the bank name.'
  if (!/^[0-9]{10}$/.test(num)) errors.account_number = 'The account number must be exactly 10 digits.'
  if (!/^[\p{L}][\p{L}\s.'&-]{1,119}$/u.test(name)) errors.account_name = 'Enter the account name exactly as the bank shows it.'
  if (Object.keys(errors).length || !kind) return { ok: false, errors }
  return { ok: true, value: { payee_kind: kind, payee_name: payee, bank_name: bank, account_number: num, account_name: name } }
}

// Only the database's own plain messages are shown. Anything else becomes the fallback.
export function friendlyPayeeError(message: string | null | undefined, fallback = 'Something went wrong. Please try again.'): string {
  const m = (message ?? '').trim()
  if (!m) return fallback
  if (/^(rent can only be directed|this property is listed by its owner|choose |the payee type does not match|you need an approved professional|enter the|the account number must|you already have a request|a change is already scheduled|too many requests|that is already the approved|invalid authorization file|listing not found|sign in)/i.test(m)) return m
  return fallback
}
