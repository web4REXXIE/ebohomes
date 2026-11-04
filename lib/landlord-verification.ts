// Pure helpers (safe for client and server). No imports.
// One definition of "submitted" and "status" so every screen agrees.

export type VerificationFields = {
  account_type?: string | null
  business_name?: string | null
  business_address?: string | null
  cac_number?: string | null
  representative_name?: string | null
  representative_role?: string | null
  id_document_type?: string | null
  id_document_url?: string | null
  selfie_url?: string | null
  ownership_doc_url?: string | null
  verification_status?: string | null
  verified?: boolean | null
}

export type VerificationBucket = 'pending' | 'verified' | 'rejected' | 'not_submitted'

const has = (v: unknown) => typeof v === 'string' && v.trim() !== ''

// Human-readable list of what is still missing. Empty list means a complete submission.
export function missingItems(p: VerificationFields): string[] {
  const m: string[] = []
  if (!has(p.business_name)) m.push('Business name')
  if (!has(p.business_address)) m.push('Business address')
  if (p.account_type === 'company') {
    if (!has(p.cac_number)) m.push('CAC number')
    if (!has(p.representative_name)) m.push('Representative name')
    if (!has(p.representative_role)) m.push('Representative role')
  }
  if (!has(p.id_document_type)) m.push('ID type')
  if (!has(p.id_document_url)) m.push('Government ID photo')
  if (!has(p.selfie_url)) m.push('Selfie holding ID')
  if (!has(p.ownership_doc_url)) m.push('Ownership document')
  return m
}

export function isSubmissionComplete(p: VerificationFields): boolean {
  return missingItems(p).length === 0
}

// The database defaults verification_status to 'pending', so "pending" alone does not
// mean the landlord submitted anything. Pending counts only when everything is on file.
export function verificationBucket(p: VerificationFields): VerificationBucket {
  if (p.verified === true || p.verification_status === 'verified' || p.verification_status === 'approved') return 'verified'
  if (p.verification_status === 'rejected') return 'rejected'
  return isSubmissionComplete(p) ? 'pending' : 'not_submitted'
}
