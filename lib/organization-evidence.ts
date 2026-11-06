// Pure helpers for COMPANY (organization) files (Phase 10.3). Safe for client and server.
// Files live in the same PRIVATE bucket as authority evidence, under their own folder:
//   organization/<creator id>/<organization id>/<random id>.<ext>        (company documents)
//   organization/<creator id>/<organization id>/logo-<random id>.<ext>   (company logo, image only)
// The first segment is never a user id, so no user-folder policy can match these files.
// Nothing here makes a company "verified". Only an administrator decision does.
import { AUTHORITY_BUCKET, AUTHORITY_MAX_BYTES, AUTHORITY_MIME_EXT } from '@/lib/authority-evidence'

export { AUTHORITY_BUCKET as ORG_BUCKET }
export const ORG_FOLDER = 'organization'
export const MAX_ORG_FILES = 30
export const ORG_LOGO_MAX_BYTES = 2 * 1024 * 1024
export const ORG_LOGO_MIMES = ['image/jpeg', 'image/png', 'image/webp'] as const
export const ORG_LOGO_ACCEPT = ORG_LOGO_MIMES.join(',')

// Must match the doc_type check on organization_documents in 20261202_01_organizations.sql
export const ORG_DOC_TYPE_VALUES = [
  'registration_certificate',
  'registration_status_report',
  'representative_authorization',
  'proof_of_address',
  'other_supporting_document',
] as const
export type OrgDocType = (typeof ORG_DOC_TYPE_VALUES)[number]

export const ORG_DOC_LABELS: Record<OrgDocType, string> = {
  registration_certificate: 'Registration certificate (CAC)',
  registration_status_report: 'Registration status report',
  representative_authorization: 'Proof you can act for the company',
  proof_of_address: 'Proof of business address',
  other_supporting_document: 'Other supporting document',
}

export function isOrgDocType(v: unknown): v is OrgDocType {
  return typeof v === 'string' && (ORG_DOC_TYPE_VALUES as readonly string[]).includes(v)
}

export function validateOrgFileMeta(mime: unknown, bytes: unknown): string | null {
  if (typeof mime !== 'string' || !AUTHORITY_MIME_EXT[mime]) return 'Upload a JPG, PNG, WEBP or PDF.'
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes <= 0) return 'The selected file is empty.'
  if (bytes > AUTHORITY_MAX_BYTES) return 'The file is too large. The maximum is 10MB.'
  return null
}

export function validateOrgLogoMeta(mime: unknown, bytes: unknown): string | null {
  if (typeof mime !== 'string' || !(ORG_LOGO_MIMES as readonly string[]).includes(mime)) return 'The logo must be a JPG, PNG or WEBP image.'
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes <= 0) return 'The selected file is empty.'
  if (bytes > ORG_LOGO_MAX_BYTES) return 'The logo is too large. The maximum is 2MB.'
  return null
}

export function orgFolderFor(userId: string, orgId: string): string {
  return `${ORG_FOLDER}/${userId}/${orgId}`
}

export function orgPathFor(userId: string, orgId: string, mime: string, fileId: string, kind: 'document' | 'logo'): string {
  return `${orgFolderFor(userId, orgId)}/${kind === 'logo' ? 'logo-' : ''}${fileId}.${AUTHORITY_MIME_EXT[mime]}`
}

export function isValidOrgPath(path: unknown, userId: string, orgId: string, kind: 'document' | 'logo'): path is string {
  if (typeof path !== 'string' || path.length > 220) return false
  const parts = path.split('/')
  if (parts.length !== 4 || parts[0] !== ORG_FOLDER || parts[1] !== userId || parts[2] !== orgId) return false
  return kind === 'logo'
    ? /^logo-[0-9a-f-]{36}\.(jpg|png|webp)$/i.test(parts[3])
    : /^[0-9a-f-]{36}\.(jpg|png|webp|pdf)$/i.test(parts[3])
}

// Turns the database's plain error text into something safe to show.
export function friendlyOrgError(message: string | null | undefined, fallback = 'Something went wrong. Please try again.'): string {
  const m = (message ?? '').trim()
  if (!m) return fallback
  if (/^(you cannot|too many documents|company not found|sign in|document not found)/i.test(m)) return m
  return fallback
}
