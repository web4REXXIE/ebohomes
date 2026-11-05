// Rules for property AUTHORITY review (Phase 9.2). Pure functions, no database calls.
// These mirror the SQL in 20261114_01_authority_foundation.sql. If one changes, change the other.
// Nothing here says a document proves ownership: it only decides what must be submitted and what may be shown.

export type AuthorityStatus = 'not_submitted' | 'submitted' | 'needs_evidence' | 'accepted' | 'rejected' | 'on_hold'
export type AuthorityRole = 'owner' | 'agent' | 'manager' | 'company_representative' | 'other'
export type AuthoritySituation = 'sole_owner' | 'co_owned' | 'inherited' | 'other'

export const AUTHORITY_ROLES: { value: AuthorityRole; label: string }[] = [
  { value: 'owner', label: 'I own this property' },
  { value: 'agent', label: 'I am an agent for the owner' },
  { value: 'manager', label: 'I manage it for the owner' },
  { value: 'company_representative', label: 'I act for a company' },
  { value: 'other', label: 'Other (I will explain)' },
]

export const AUTHORITY_SITUATIONS: { value: AuthoritySituation; label: string }[] = [
  { value: 'sole_owner', label: 'Sole owner' },
  { value: 'co_owned', label: 'Co-owned' },
  { value: 'inherited', label: 'Inherited' },
  { value: 'other', label: 'Other' },
]

// Fixed list. Not every type is equal evidence; admins judge each one.
export const AUTHORITY_DOC_TYPES: { value: string; label: string }[] = [
  { value: 'certificate_of_occupancy', label: 'Certificate of Occupancy' },
  { value: 'registered_deed_of_assignment', label: 'Registered deed of assignment' },
  { value: 'land_title_or_recognised_title_evidence', label: 'Land title or other recognized title evidence' },
  { value: 'tenancy_agreement', label: 'Tenancy agreement' },
  { value: 'signed_authorization_letter', label: 'Signed authorization letter' },
  { value: 'company_authorization_or_appointment', label: 'Company authorization or appointment' },
  { value: 'other_supporting_document', label: 'Other supporting document' },
]

export type ClaimInput = {
  role: string
  ownerName?: string | null
  ownerPhone?: string | null
  companyName?: string | null
  companyCac?: string | null
  note?: string | null
}
export type ActiveDoc = { doc_type: string; withdrawn_at?: string | null }

const blank = (v?: string | null) => !v || v.trim() === ''

// What the lister still has to provide before they can submit. Same rule as eb_authority_missing in SQL.
export function missingForClaim(claim: ClaimInput, docs: ActiveDoc[]): string[] {
  const active = docs.filter((d) => !d.withdrawn_at)
  const has = (t: string) => active.some((d) => d.doc_type === t)
  const m: string[] = []
  if (active.length === 0) m.push('At least one supporting document')
  if (claim.role === 'agent' || claim.role === 'manager') {
    if (!has('signed_authorization_letter')) m.push('Signed authorization letter from the owner')
    if (blank(claim.ownerName)) m.push('Owner full name')
    if (blank(claim.ownerPhone)) m.push('Owner phone number')
  } else if (claim.role === 'company_representative') {
    if (!has('company_authorization_or_appointment')) m.push('Company authorization or appointment document')
    if (blank(claim.companyName)) m.push('Company name')
    if (blank(claim.companyCac)) m.push('Company CAC number')
  } else if (claim.role === 'other') {
    if ((claim.note || '').trim().length < 10) m.push('A short explanation of your relationship to the property')
  }
  return m
}

// Only an accepted review counts. Uploading or opening a document never does.
export function isAuthorityReviewed(status: string | null | undefined): boolean {
  return status === 'accepted'
}

// One row of the public "Trust and verification" block. Only an accepted review is a 'yes'.
// Pending, needs-evidence, rejected, on-hold and not-submitted all read as "not yet reviewed",
// so the public never sees an internal review state. 'unavailable' means the status could not be loaded.
export function authorityState(status: string | null | undefined, failed = false): 'yes' | 'no' | 'unavailable' {
  if (failed) return 'unavailable'
  return isAuthorityReviewed(status) ? 'yes' : 'no'
}

// Plain wording for the landlord. Never says ownership is verified.
export function authorityStatusInfo(status: string | null | undefined): { label: string; detail: string; tone: 'neutral' | 'good' | 'warn' | 'bad' } {
  switch (status) {
    case 'submitted':
      return { label: 'Authority under review', detail: 'EboHomes is reviewing the evidence you sent for this property.', tone: 'neutral' }
    case 'needs_evidence':
      return { label: 'More evidence needed', detail: 'EboHomes asked for more evidence. Add it and send it again.', tone: 'warn' }
    case 'accepted':
      return { label: 'Authority reviewed', detail: 'EboHomes reviewed the evidence you sent for this property.', tone: 'good' }
    case 'rejected':
      return { label: 'Authority not accepted', detail: 'EboHomes could not accept the evidence. You can correct it and send it again.', tone: 'bad' }
    case 'on_hold':
      return { label: 'Under review by EboHomes', detail: 'EboHomes is looking at this listing. We will contact you if we need anything.', tone: 'warn' }
    default:
      return { label: 'Authority not submitted', detail: 'Send evidence of your authority to list this property before it can be published.', tone: 'neutral' }
  }
}

// "Listed by" on the public listing page. The value is copied from the accepted authority role,
// so it keeps the difference between an owner, an agent, a manager and a company representative.
export const LISTED_BY_LABELS: Record<string, string> = {
  owner: 'Owner',
  agent: 'Agent',
  manager: 'Property manager',
  company_representative: 'Company representative',
  other: 'Other',
}
export function listedByLabel(role: string | null | undefined): string | null {
  if (!role) return null
  return LISTED_BY_LABELS[role] ?? 'Other'
}

// What each public indicator means, and its limit. Shown to tenants.
export const PUBLIC_INDICATOR_TEXT = {
  identity: {
    title: 'Identity checked',
    meaning: 'EboHomes checked the identity details the lister submitted.',
    limit: 'This does not show that they own or may rent out this property.',
  },
  authority: {
    title: 'Authority reviewed',
    meaning: 'EboHomes reviewed the evidence the lister submitted for this property.',
    limit: 'This is a review of documents, not a legal guarantee of ownership. Always confirm details before paying.',
  },
  inspected: {
    title: 'Inspected by EboHomes',
    meaning: 'An EboHomes inspector visited the property.',
    limit: 'An inspection says nothing about who owns the property.',
  },
} as const

// ---------- Location ----------
export function normaliseText(s?: string | null): string {
  return (s || '')
    .toLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function distanceMetres(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = (d: number) => (d * Math.PI) / 180
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(a)))
}

export type Baseline = { text: string | null; lat: number | null; lng: number | null }
export type NextLocation = { text: string | null; lat: number | null; lng: number | null }

// Compared with the last ACCEPTED review, not the previous edit, so small moves cannot add up.
// The tolerance applies to the GPS test only; a written-location change is judged on its own.
export function locationMaterialChange(baseline: Baseline | null, next: NextLocation, toleranceM = 100) {
  if (!baseline) return { baseline: false, textMaterial: false, gpsMaterial: false, distanceM: null as number | null }
  const textMaterial = normaliseText(next.text) !== normaliseText(baseline.text)
  const hadPin = baseline.lat != null && baseline.lng != null
  const hasPin = next.lat != null && next.lng != null
  let gpsMaterial = false
  let distanceM: number | null = null
  if (!hadPin) gpsMaterial = next.lat != null || next.lng != null
  else if (!hasPin) gpsMaterial = true
  else {
    distanceM = distanceMetres(baseline.lat as number, baseline.lng as number, next.lat as number, next.lng as number)
    gpsMaterial = distanceM > toleranceM
  }
  return { baseline: true, textMaterial, gpsMaterial, distanceM }
}

// ---------- Legacy transition ----------
const ENDED_TENANCY = ['ended', 'terminated', 'cancelled', 'expired', 'completed']
export const isEndedTenancyStatus = (s?: string | null) => ENDED_TENANCY.includes(s || '')
export const isOpenApplicationStatus = (s?: string | null) => ['pending', 'info_requested', 'approved'].includes(s || '')

export type LegacyReason = 'resolved' | 'protected_tenancy' | 'protected_application' | 'not_due' | 'not_live' | 'eligible'
export function legacyReason(x: {
  resolved: boolean
  protection: 'active_tenancy' | 'active_application' | null
  deadline: Date
  now: Date
  listingStatus: string
  authorityStatus: string
}): LegacyReason {
  if (x.resolved) return 'resolved'
  if (x.protection === 'active_tenancy') return 'protected_tenancy'
  if (x.protection === 'active_application') return 'protected_application'
  if (x.deadline.getTime() > x.now.getTime()) return 'not_due'
  if (!['approved', 'paused', 'inspection_required'].includes(x.listingStatus)) return 'not_live'
  if (x.authorityStatus === 'accepted') return 'resolved'
  return 'eligible'
}
