// Rules and labels for risk alerts (Phase 9.4). Pure functions, no imports, safe for client and server.
// scoreListingPair, scoreDocumentPair and scoreLocationChange MIRROR the SQL in 20261119_01_risk_alert_foundation.sql.
// If a weight or rule changes in one place, change it in the other. A risk score never replaces authority review:
// it only decides how urgently an administrator should look. Nothing here bans, hides or rejects anything.

export type RiskCategory =
  | 'duplicate_property' | 'multiple_accounts' | 'document_reuse' | 'location_change' | 'repeated_rejected'
  | 'recreated_listing' | 'unusual_representative' | 'unauthorized_listing' | 'manual_review'
export type RiskSeverity = 'info' | 'warning' | 'investigation' | 'high'
export type RiskStatus = 'open' | 'investigating' | 'info_requested' | 'escalated' | 'resolved'
export type RiskResolution = 'false_positive' | 'legitimate' | 'no_action' | 'confirmed_violation'

export type RiskThresholds = { warnAt: number; investigateAt: number; highAt: number }
export const DEFAULT_THRESHOLDS: RiskThresholds = { warnAt: 20, investigateAt: 40, highAt: 70 }

export type RiskSettings = {
  duplicateRadiusM: number; photoHammingMax: number; photoMatchMin: number; locationJumpM: number
}
export const DEFAULT_RISK_SETTINGS: RiskSettings = { duplicateRadiusM: 50, photoHammingMax: 6, photoMatchMin: 2, locationJumpM: 1000 }

export const CATEGORY_INFO: Record<RiskCategory, { label: string; help: string }> = {
  duplicate_property: { label: 'Possible duplicate property', help: 'Another account has a listing with a matching address, map pin or photos.' },
  multiple_accounts: { label: 'Several accounts, one property', help: 'Different accounts have listings linked to the same property record.' },
  document_reuse: { label: 'Possible document reuse', help: 'The same evidence file was submitted more than once.' },
  location_change: { label: 'Location changed', help: 'The map pin or address moved away from the recorded or approved position.' },
  repeated_rejected: { label: 'Rejected before', help: 'A matching listing was rejected earlier and appears again.' },
  recreated_listing: { label: 'Deleted and re-created', help: 'The same place was deleted and listed again several times.' },
  unusual_representative: { label: 'Unusual representative link', help: 'Several accounts say they act for the same owner.' },
  unauthorized_listing: { label: 'Possible unauthorized listing', help: 'There are signs the lister may not be allowed to list this property.' },
  manual_review: { label: 'Needs a manual look', help: 'Raised for an administrator to investigate.' },
}

export const SEVERITY_INFO: Record<RiskSeverity, { label: string; rank: number; tone: string }> = {
  info: { label: 'Information', rank: 0, tone: 'border-border bg-secondary text-foreground' },
  warning: { label: 'Warning', rank: 1, tone: 'border-amber-300 bg-amber-50 text-amber-900' },
  investigation: { label: 'Investigate', rank: 2, tone: 'border-orange-300 bg-orange-50 text-orange-900' },
  high: { label: 'High priority', rank: 3, tone: 'border-red-300 bg-red-50 text-red-900' },
}

export const STATUS_LABEL: Record<RiskStatus, string> = {
  open: 'Open', investigating: 'Investigating', info_requested: 'Waiting for the lister', escalated: 'Escalated', resolved: 'Resolved',
}

export const RESOLUTION_OPTIONS: { value: RiskResolution; label: string; help: string }[] = [
  { value: 'false_positive', label: 'False positive', help: 'The match is a coincidence. The same finding will not be raised again.' },
  { value: 'legitimate', label: 'Legitimate situation', help: 'For example another unit, or an owner with several representatives. Not raised again.' },
  { value: 'no_action', label: 'No action needed', help: 'Looked at it. Nothing to do now.' },
  { value: 'confirmed_violation', label: 'Confirmed policy violation', help: 'Only records your finding. Any account or listing action is a separate, deliberate step.' },
]

export const EVENT_LABEL: Record<string, string> = {
  detected: 'Detected', assigned: 'Assigned', note: 'Note added', info_requested: 'Information requested',
  escalated: 'Escalated', hold_placed: 'Property hold placed', resolved: 'Resolved', reopened: 'Reopened', rescanned: 'Re-checked',
}

export function severityForScore(score: number, t: RiskThresholds = DEFAULT_THRESHOLDS): RiskSeverity {
  if (score >= t.highAt) return 'high'
  if (score >= t.investigateAt) return 'investigation'
  if (score >= t.warnAt) return 'warning'
  return 'info'
}

export function isActive(status: string): boolean { return status !== 'resolved' }
// "Needs attention" = still open AND strong enough to be worth an administrator's time.
export function needsAttention(a: { status: string; severity: string }): boolean {
  return isActive(a.status) && (a.severity === 'warning' || a.severity === 'investigation' || a.severity === 'high')
}
export function sortAlerts<T extends { severity: string; detected_at: string }>(list: T[]): T[] {
  const rank = (s: string) => SEVERITY_INFO[s as RiskSeverity]?.rank ?? 0
  return [...list].sort((a, b) => rank(b.severity) - rank(a.severity) || +new Date(b.detected_at) - +new Date(a.detected_at))
}

export type EvidenceLike = { weight: number }
export function totalScore(evidence: EvidenceLike[]): number { return evidence.reduce((n, e) => n + (e.weight || 0), 0) }

// ---------- small helpers (same maths as SQL) ----------
export function normText(p: string | null | undefined): string {
  return (p ?? '').toLowerCase().replace(/[\p{P}\p{S}]+/gu, ' ').replace(/\s+/g, ' ').trim()
}
export function phoneKey(p: string | null | undefined): string | null {
  const d = (p ?? '').replace(/\D/g, '')
  return d.length >= 10 ? d.slice(-10) : null
}
export function maskPhoneKey(p: string | null | undefined): string {
  const k = phoneKey(p)
  return k ? `ending ${k.slice(-3)}` : 'not given'
}
export function distanceMetres(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const r = (x: number) => (x * Math.PI) / 180
  const a = Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lng2 - lng1) / 2) ** 2
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(a)))
}
// Number of differing bits between two 16-character hex fingerprints (0 to 64). null if either is not valid.
export function hexHamming(a: string, b: string): number | null {
  const ok = /^[0-9a-f]{16}$/
  if (!ok.test(a) || !ok.test(b)) return null
  let n = 0
  for (let i = 0; i < 16; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16)
    while (x) { n += x & 1; x >>= 1 }
  }
  return n
}
export function countMatchingPhotos(mine: string[], theirs: string[], maxBits: number): number {
  const seen = new Set<string>()
  for (const h of mine) {
    if (theirs.some((t) => { const d = hexHamming(h, t); return d !== null && d <= maxBits })) seen.add(h)
  }
  return seen.size
}

// ---------- listing vs listing (a DIFFERENT account's listing) ----------
export type ListingSnapshot = {
  landlordId: string; propertyId?: string | null; locationText?: string | null; lat?: number | null; lng?: number | null
  propertyType?: string | null; bedrooms?: number | null; priceMonthly?: number | null; contactPhone?: string | null
  deviceId?: string | null; photoHashes?: string[]; status?: string | null; authorityStatus?: string | null
}
export type PairResult = { raise: boolean; score: number; severity: RiskSeverity; category: RiskCategory; reasons: string[]; likelyDifferentUnit: boolean; bothAuthorityReviewed: boolean }

export function scoreListingPair(me: ListingSnapshot, o: ListingSnapshot, s: RiskSettings = DEFAULT_RISK_SETTINGS, t: RiskThresholds = DEFAULT_THRESHOLDS): PairResult {
  const none: PairResult = { raise: false, score: 0, severity: 'info', category: 'duplicate_property', reasons: [], likelyDifferentUnit: false, bothAuthorityReviewed: false }
  if (me.landlordId === o.landlordId) return none // same account listing the same place is normal, not a cross-account alert

  const hasPins = me.lat != null && me.lng != null && o.lat != null && o.lng != null
  const dist = hasPins ? distanceMetres(me.lat!, me.lng!, o.lat!, o.lng!) : null
  const fProp = !!me.propertyId && o.propertyId === me.propertyId
  const fGps = dist !== null && dist <= s.duplicateRadiusM
  const fAddr = normText(me.locationText) !== '' && normText(o.locationText) === normText(me.locationText)
  const photos = countMatchingPhotos(me.photoHashes ?? [], o.photoHashes ?? [], s.photoHammingMax)
  const fPhoto = photos >= s.photoMatchMin
  if (!(fProp || fGps || fAddr || fPhoto)) return none // one stray photo match alone is not a signal

  const reasons: string[] = []
  let w = 0
  if (fProp) { w += 40; reasons.push('same property record') }
  if (fGps) { w += 20; reasons.push('pins very close') }
  if (fAddr) { w += 20; reasons.push('same address') }
  if (fPhoto) { w += Math.min(15 + photos * 5, 40); reasons.push('matching photos') }
  if (me.propertyType && me.propertyType === o.propertyType) { w += 5; reasons.push('same property type') }
  if (me.bedrooms != null && me.bedrooms === o.bedrooms) { w += 5; reasons.push('same bedrooms') }
  const pk = phoneKey(me.contactPhone)
  if (pk && pk === phoneKey(o.contactPhone)) { w += 20; reasons.push('same contact phone') }
  if (me.deviceId && me.deviceId === o.deviceId) { w += 10; reasons.push('same device (supporting only)') }
  const hi = Math.max(me.priceMonthly ?? 0, o.priceMonthly ?? 0)
  if (me.priceMonthly != null && o.priceMonthly != null && hi > 0 && Math.abs(me.priceMonthly - o.priceMonthly) / hi >= 0.1) { w += 10; reasons.push('rent differs') }
  const fRej = o.status === 'rejected'
  if (fRej) { w += 15; reasons.push('matching listing rejected earlier') }

  const likelyDifferentUnit = !fPhoto && !fProp && (me.bedrooms !== o.bedrooms || me.propertyType !== o.propertyType)
  const bothAuthorityReviewed = me.authorityStatus === 'accepted' && o.authorityStatus === 'accepted'
  let cap: number | null = null
  if (likelyDifferentUnit) cap = t.warnAt - 1
  if (bothAuthorityReviewed) cap = Math.min(cap ?? t.investigateAt - 1, t.investigateAt - 1)
  const score = cap !== null ? Math.min(w, cap) : w
  const category: RiskCategory = fRej ? 'repeated_rejected' : fProp ? 'multiple_accounts' : 'duplicate_property'
  return { raise: score > 0, score, severity: severityForScore(score, t), category, reasons, likelyDifferentUnit, bothAuthorityReviewed }
}

// ---------- evidence file vs an earlier submission of the same file ----------
export type DocSnapshot = {
  uploadedBy: string; listingId: string; propertyId?: string | null; docType: string
  ownerPhone?: string | null; companyCac?: string | null; earlierFlagged?: boolean
}
const PROPERTY_SPECIFIC_DOCS = ['certificate_of_occupancy', 'registered_deed_of_assignment', 'land_title_or_recognised_title_evidence']

export function scoreDocumentPair(d: DocSnapshot, o: DocSnapshot, t: RiskThresholds = DEFAULT_THRESHOLDS): { raise: boolean; score: number; severity: RiskSeverity; related: boolean } {
  if (d.listingId === o.listingId) return { raise: false, score: 0, severity: 'info', related: false }
  const related = (!!phoneKey(d.ownerPhone) && phoneKey(d.ownerPhone) === phoneKey(o.ownerPhone))
    || (normText(d.companyCac) !== '' && normText(d.companyCac) === normText(o.companyCac))
  let w: number, cap: number | null = null
  if (d.uploadedBy !== o.uploadedBy) {
    w = 45
    if (o.earlierFlagged) w += 25
    if (related) cap = t.investigateAt - 1 // one owner can have several representatives
  } else if (PROPERTY_SPECIFIC_DOCS.includes(d.docType) && (d.propertyId ?? null) !== (o.propertyId ?? null)) {
    w = 25
  } else {
    w = 5 // same owner or company papers reused: often legitimate
  }
  const score = cap !== null ? Math.min(w, cap) : w
  return { raise: score > 0, score, severity: severityForScore(score, t), related }
}

// ---------- location change (compared with the last approved or original position) ----------
export function scoreLocationChange(
  ref: { lat?: number | null; lng?: number | null; text?: string | null },
  now: { lat?: number | null; lng?: number | null; text?: string | null },
  toleranceM: number, jumpM = DEFAULT_RISK_SETTINGS.locationJumpM, t: RiskThresholds = DEFAULT_THRESHOLDS,
): { raise: boolean; score: number; severity: RiskSeverity; metres: number | null } {
  const has = ref.lat != null && ref.lng != null && now.lat != null && now.lng != null
  const metres = has ? distanceMetres(ref.lat!, ref.lng!, now.lat!, now.lng!) : null
  let w = 0
  if (metres !== null && metres > toleranceM) { w += 30; if (metres > jumpM) w += 40 }
  if (ref.text != null && normText(now.text) !== normText(ref.text)) w += 10
  return { raise: w > 0, score: w, severity: severityForScore(w, t), metres: metres === null ? null : Math.round(metres) }
}

// ---------- messages ----------
// Shows a readable message for database errors. Our own messages are plain sentences and pass through.
export function friendlyRiskError(message: string | null | undefined): string {
  const m = (message ?? '').trim()
  if (!m) return 'Something went wrong. Please try again.'
  const own = /^(Only an administrator|You cannot act|Alert not found|This alert|Choose |Write |A reason|Invalid settings|One of the values|This listing has no property|Only a resolved|Listing not found)/i
  return own.test(m) ? m : 'Something went wrong. Please try again.'
}
