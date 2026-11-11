// Pure helpers (safe for client and server). No imports.
// One definition of a tenant's verification state, so every screen agrees.
//
// Honesty rules: "submitted" means ID type, ID photo and selfie are all on file and EboHomes has not
// decided. "verified" needs BOTH database fields to say so. Nothing here claims a reviewer has opened it.

export type TenantProfileFields = {
  id_document_type?: string | null
  id_document_url?: string | null
  selfie_url?: string | null
  verification_status?: string | null
  verified?: boolean | null
}

export type TenantVerificationState = 'not_submitted' | 'submitted' | 'verified' | 'rejected'

const has = (v: unknown) => typeof v === 'string' && v.trim() !== ''

export const TENANT_ID_LABELS: Record<string, string> = {
  nin: 'NIN slip / card',
  drivers_licence: "Driver's licence",
  voters_card: "Voter's card",
  intl_passport: 'International passport',
}

export function tenantMissingItems(p: TenantProfileFields): string[] {
  const m: string[] = []
  if (!has(p.id_document_type)) m.push('ID type')
  if (!has(p.id_document_url)) m.push('ID photo')
  if (!has(p.selfie_url)) m.push('selfie holding your ID')
  return m
}

export function tenantVerificationState(p: TenantProfileFields | null | undefined): TenantVerificationState {
  if (!p) return 'not_submitted'
  if (p.verified === true && p.verification_status === 'verified') return 'verified'
  if (p.verification_status === 'rejected' && p.verified !== true) return 'rejected'
  return tenantMissingItems(p).length === 0 ? 'submitted' : 'not_submitted'
}

// Only allow a return path that stays inside EboHomes.
export function safeNextPath(next: string | null | undefined): string | null {
  if (!next || typeof next !== 'string') return null
  if (!next.startsWith('/') || next.startsWith('//') || next.includes('\\') || next.length > 300) return null
  return next
}
