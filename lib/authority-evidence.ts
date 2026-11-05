// Pure helpers for property AUTHORITY evidence files (Phase 9.2). Safe for client and server. No imports.
// Files live in the PRIVATE bucket below. The path is  <lister id>/<listing id>/<random id>.<ext>
// and must match the check inside eb_authority_add_document in SQL.

export const AUTHORITY_BUCKET = 'property-evidence'
export const AUTHORITY_MAX_BYTES = 10 * 1024 * 1024
export const AUTHORITY_MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
}
export const AUTHORITY_ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf'
export const AUTHORITY_DOC_TYPE_VALUES = [
  'certificate_of_occupancy',
  'registered_deed_of_assignment',
  'land_title_or_recognised_title_evidence',
  'tenancy_agreement',
  'signed_authorization_letter',
  'company_authorization_or_appointment',
  'other_supporting_document',
] as const

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function validateAuthorityFileMeta(mime: unknown, bytes: unknown): string | null {
  if (typeof mime !== 'string' || !AUTHORITY_MIME_EXT[mime]) return 'Upload a JPG, PNG, WEBP or PDF.'
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes <= 0) return 'The selected file is empty.'
  if (bytes > AUTHORITY_MAX_BYTES) return 'The file is too large. The maximum is 10MB.'
  return null
}

export function isAuthorityDocType(v: unknown): boolean {
  return typeof v === 'string' && (AUTHORITY_DOC_TYPE_VALUES as readonly string[]).includes(v)
}

export function authorityPathFor(userId: string, listingId: string, mime: string, fileId: string): string {
  return `${userId}/${listingId}/${fileId}.${AUTHORITY_MIME_EXT[mime]}`
}

export function isValidAuthorityPath(path: unknown, userId: string, listingId: string): path is string {
  if (typeof path !== 'string' || path.length > 200) return false
  const parts = path.split('/')
  if (parts.length !== 3 || parts[0] !== userId || parts[1] !== listingId) return false
  return /^[0-9a-f-]{36}\.(jpg|png|webp|pdf)$/i.test(parts[2])
}

// Turns the database's plain error text into something safe to show.
export function friendlyAuthorityError(message: string | null | undefined, fallback = 'Something went wrong. Please try again.'): string {
  const m = (message ?? '').trim()
  if (!m) return fallback
  if (/^(still needed|this listing is being reviewed|there is nothing to decide|no change|choose |write |record |tick |at least one|\d+ document|only an administrator|only a listing|a reason|this listing is already|the preview is out of date|the transition|listing not found|document not found|sign in)/i.test(m)) return m
  return fallback
}
