// Pure helpers for application documents. No imports, so the client, the server and tests share them.
// Documents are private. Only the tenant and EboHomes staff can open a file. Landlords see document types only.

export const APP_DOC_BUCKET = 'application-documents'
export const APP_DOC_MAX_BYTES = 8 * 1024 * 1024
export const APP_DOC_MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
}
export const APP_DOC_ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf'

export const APP_DOC_KINDS = [
  'government_id',
  'proof_of_income',
  'employment_letter',
  'reference_letter',
  'proof_of_address',
  'other',
] as const
export type AppDocKind = (typeof APP_DOC_KINDS)[number]

export const APP_DOC_LABEL: Record<AppDocKind, string> = {
  government_id: 'Government ID',
  proof_of_income: 'Proof of income',
  employment_letter: 'Employment letter',
  reference_letter: 'Reference letter',
  proof_of_address: 'Proof of address',
  other: 'Other document',
}

export const APP_DOC_OPEN_STATUSES = ['pending', 'info_requested', 'approved'] as const

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v)

export function validateAppDocMeta(mime: unknown, bytes: unknown): string | null {
  if (typeof mime !== 'string' || !APP_DOC_MIME_EXT[mime]) return 'Upload a JPG, PNG, WEBP or PDF.'
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes <= 0) return 'The selected file is empty.'
  if (bytes > APP_DOC_MAX_BYTES) return 'The file is too large. The maximum is 8MB.'
  return null
}

export function validateAppDocKind(
  kind: unknown,
  label: unknown
): { ok: true; kind: AppDocKind; label: string | null } | { ok: false; error: string } {
  if (typeof kind !== 'string' || !(APP_DOC_KINDS as readonly string[]).includes(kind)) {
    return { ok: false, error: 'Choose what kind of document this is.' }
  }
  if (kind !== 'other') return { ok: true, kind: kind as AppDocKind, label: null }
  const text = typeof label === 'string' ? label.trim().replace(/\s+/g, ' ') : ''
  if (text.length < 2 || text.length > 60) return { ok: false, error: 'Describe the document in 2 to 60 characters.' }
  return { ok: true, kind: 'other', label: text }
}

// {tenantId}/{applicationId}/{random-uuid}.{ext}. The server picks the name. The client never does.
export function appDocPathFor(tenantId: string, applicationId: string, mime: string, uuid: string): string {
  return `${tenantId}/${applicationId}/${uuid}.${APP_DOC_MIME_EXT[mime] ?? 'bin'}`
}

export function isValidAppDocPath(path: unknown, tenantId: string, applicationId: string): path is string {
  if (typeof path !== 'string' || path.length > 200) return false
  const parts = path.split('/')
  if (parts.length !== 3 || parts[0] !== tenantId || parts[1] !== applicationId) return false
  return /^[0-9a-f-]{36}\.(jpg|png|webp|pdf)$/i.test(parts[2])
}
