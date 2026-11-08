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
  // The ownership document is optional. Agents and managers may not own what they list.
  // Each property is checked separately (property authority review).
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


// ---------------------------------------------------------------------------------------------
// Stage 16: what a landlord is allowed to be TOLD about their verification.
//
// This is deliberately more cautious than verificationBucket() above, which the admin screens use
// and which is left unchanged. It never reinterprets the `verified` flag on its own.
//
// What the records can prove (supabase admin_decide_landlord_verification):
//   - An administrator decision sets verification_status = 'verified' AND verified = true together,
//     or verification_status = 'rejected' AND verified = false together. Nothing else writes them.
//   - The decision checks that business details, ID type, ID photo and selfie are on file. The ownership
//     document is optional; each property gets its own authority review.
//   So the records can support "EboHomes approved this landlord account". They cannot support
//   "ownership is verified", and nothing here says so.
//   - verification_status defaults to 'pending', so 'pending' alone is not a submission.
//   - There is no submitted-at timestamp and no "reviewer has opened it" record, so "submitted"
//     is the furthest honest claim before a decision. "Under active review" is never claimed.
//
// Fields that disagree (verified = true without status 'verified', status 'approved', an unrecognised
// status) produce 'unknown', a neutral message. They never produce "verified".
// ---------------------------------------------------------------------------------------------
export type VerificationDisplayState = 'not_submitted' | 'submitted' | 'verified' | 'rejected' | 'unknown'

export type VerificationDisplay = {
  state: VerificationDisplayState
  label: string
  detail: string
  tone: 'green' | 'blue' | 'amber' | 'red' | 'grey'
  missing: string[]
  actionLabel: string
  // True when the landlord has something to do (not submitted or rejected).
  needsAction: boolean
}

export function landlordVerificationDisplay(
  p: (VerificationFields & { rejection_reason?: string | null }) | null | undefined,
): VerificationDisplay {
  if (!p) {
    return {
      state: 'unknown',
      label: 'Status unavailable',
      detail: 'We could not read your verification records. Open Get Verified to check, or contact EboHomes.',
      tone: 'grey',
      missing: [],
      actionLabel: 'Open Get Verified',
      needsAction: false,
    }
  }

  const status = (p.verification_status ?? '').trim()
  const missing = missingItems(p)

  // 1. Explicit administrator outcomes. Both fields must agree.
  if (status === 'verified' && p.verified === true) {
    return {
      state: 'verified',
      label: 'Verified',
      detail: 'EboHomes reviewed the details you submitted and approved your landlord account. Each property is still checked separately.',
      tone: 'green',
      missing: [],
      actionLabel: 'View details',
      needsAction: false,
    }
  }
  if (status === 'rejected' && p.verified !== true) {
    return {
      state: 'rejected',
      label: 'Not approved',
      detail: 'EboHomes did not approve this submission. Read the reason, update your details and submit again.',
      tone: 'red',
      missing,
      actionLabel: 'Update details',
      needsAction: true,
    }
  }

  // 2. Anything that claims or contradicts an outcome but did not match above is not trusted.
  const recognisedNoDecision = status === '' || status === 'pending'
  if (p.verified === true || !recognisedNoDecision) {
    return {
      state: 'unknown',
      label: 'Status unavailable',
      detail: 'Your account records do not give a clear verification result. Open Get Verified to see your details, or contact EboHomes.',
      tone: 'grey',
      missing: [],
      actionLabel: 'Open Get Verified',
      needsAction: false,
    }
  }

  // 3. No decision recorded: either complete and waiting, or not complete.
  if (missing.length === 0) {
    return {
      state: 'submitted',
      label: 'Submitted, waiting for EboHomes',
      detail: 'You have submitted the required details. EboHomes has not recorded a decision yet. You will be notified when there is one.',
      tone: 'amber',
      missing: [],
      actionLabel: 'View submission',
      needsAction: false,
    }
  }
  return {
    state: 'not_submitted',
    label: 'Not submitted',
    detail: `Still needed: ${missing.join(', ')}.`,
    tone: 'grey',
    missing,
    actionLabel: 'Complete verification',
    needsAction: true,
  }
}
