// Shared helpers for property SURROUNDINGS (Phase 10.5). Safe for client and server. No imports.
// Every fact is an observation with a source and a date. None of it is proof, and distances are straight-line only.
// The allowed answers must match eb_surroundings_answer_ok in SQL (tests/location-admin.test.mjs checks this).

export type SurroundingsSource = 'landlord' | 'inspector' | 'admin'
export type SurroundingsStatus = 'pending' | 'published' | 'flagged' | 'withdrawn' | 'superseded'
export type Choice = { value: string; label: string }
export type SurroundingsCategory = { key: string; label: string; group: 'road' | 'neighbourhood' | 'facility'; answers: Choice[] }

const RECORDED: Choice[] = [{ value: 'recorded', label: 'Recorded' }]

export const SURROUNDINGS_CATEGORIES: SurroundingsCategory[] = [
  { key: 'road_access', label: 'Road to the property', group: 'road', answers: [
    { value: 'tarred', label: 'Tarred road' }, { value: 'untarred_good', label: 'Untarred, in good condition' },
    { value: 'untarred_rough', label: 'Untarred, rough' }, { value: 'footpath_only', label: 'Footpath only' }] },
  { key: 'road_surface', label: 'Road surface', group: 'road', answers: [
    { value: 'good', label: 'Good' }, { value: 'fair', label: 'Fair' }, { value: 'poor', label: 'Poor' }] },
  { key: 'vehicle_access', label: 'Vehicle access', group: 'road', answers: [
    { value: 'car_to_gate', label: 'A car can reach the gate' }, { value: 'car_nearby', label: 'A car can get close, then a short walk' },
    { value: 'motorbike_only', label: 'Motorbike only' }, { value: 'foot_only', label: 'On foot only' }] },
  { key: 'rainy_season_access', label: 'Rainy-season access', group: 'road', answers: [
    { value: 'passable', label: 'Looked passable when seen' }, { value: 'difficult', label: 'Looked difficult when seen' },
    { value: 'not_passable', label: 'Looked not passable when seen' }, { value: 'not_observed', label: 'Not observed' }] },
  { key: 'street_lighting', label: 'Street lighting', group: 'road', answers: [
    { value: 'working', label: 'Lights working' }, { value: 'partial', label: 'Some lights working' }, { value: 'none_seen', label: 'No street lights seen' }] },
  { key: 'drainage', label: 'Drainage', group: 'road', answers: [
    { value: 'covered_working', label: 'Covered drains, looked working' }, { value: 'open_working', label: 'Open drains, looked working' },
    { value: 'blocked_or_poor', label: 'Drains looked blocked or poor' }, { value: 'none_seen', label: 'No drains seen' }] },
  { key: 'flooding', label: 'Flooding', group: 'road', answers: [
    { value: 'no_signs_seen', label: 'No signs of flooding seen' }, { value: 'signs_seen', label: 'Signs of flooding seen' },
    { value: 'reported_by_person_met', label: 'Flooding reported by the person met (not seen)' }] },
  { key: 'noise', label: 'Noise', group: 'neighbourhood', answers: [
    { value: 'quiet', label: 'Quiet when visited' }, { value: 'moderate', label: 'Moderate noise when visited' }, { value: 'loud', label: 'Loud when visited' }] },
  { key: 'water', label: 'Water', group: 'neighbourhood', answers: [
    { value: 'available', label: 'Water available' }, { value: 'unreliable', label: 'Water supply unreliable' }, { value: 'none_seen', label: 'No water supply seen' }] },
  { key: 'electricity', label: 'Electricity', group: 'neighbourhood', answers: [
    { value: 'available', label: 'Power available' }, { value: 'unreliable', label: 'Power unreliable' }, { value: 'none_seen', label: 'No power seen' }] },
  { key: 'network', label: 'Phone network', group: 'neighbourhood', answers: [
    { value: 'strong', label: 'Strong signal' }, { value: 'weak', label: 'Weak signal' }, { value: 'none', label: 'No signal' }] },
  { key: 'visible_security', label: 'Visible security features', group: 'neighbourhood', answers: [
    { value: 'gate_or_fence', label: 'Gate or fence seen' }, { value: 'guard_post_seen', label: 'Guard post seen' },
    { value: 'both_seen', label: 'Gate or fence and guard post seen' }, { value: 'none_seen', label: 'No gate, fence or guard post seen' }] },
  { key: 'facility_school', label: 'School', group: 'facility', answers: RECORDED },
  { key: 'facility_hospital', label: 'Hospital or clinic', group: 'facility', answers: RECORDED },
  { key: 'facility_market', label: 'Market', group: 'facility', answers: RECORDED },
  { key: 'facility_transport', label: 'Transport stop or park', group: 'facility', answers: RECORDED },
  { key: 'facility_shopping', label: 'Shopping centre', group: 'facility', answers: RECORDED },
  { key: 'landmark', label: 'Landmark', group: 'facility', answers: RECORDED },
]

// Topics an inspector can tag a surroundings photo with. Must match the check on inspection_evidence_files.topic in SQL.
export const PHOTO_TOPICS: Choice[] = [
  { value: 'general', label: 'General surroundings' }, { value: 'road', label: 'Road' }, { value: 'drainage', label: 'Drainage' },
  { value: 'flooding', label: 'Flooding' }, { value: 'street_lighting', label: 'Street lighting' }, { value: 'water', label: 'Water' },
  { value: 'electricity', label: 'Electricity' }, { value: 'network', label: 'Network' }, { value: 'facility', label: 'Nearby facility' },
]

export const categoryOf = (key: string) => SURROUNDINGS_CATEGORIES.find((c) => c.key === key)
export const categoryLabel = (key: string) => categoryOf(key)?.label ?? key
export const answersFor = (key: string): Choice[] => categoryOf(key)?.answers ?? []
export const answerLabel = (key: string, value: string) => answersFor(key).find((a) => a.value === value)?.label ?? value
export const isFacilityCategory = (key: string) => key.startsWith('facility_') || key === 'landmark'

export function sourceLabel(source: string): string {
  if (source === 'landlord') return 'Landlord-provided'
  if (source === 'inspector') return 'Inspector-reported'
  return 'Admin-recorded'
}

const dateText = (s?: string | null) => (s ? new Date(s).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' }) : '')

// Says plainly who said it and whether an administrator has looked at it. Never says "verified".
export function factProvenance(source: string, status: string, reviewedAt?: string | null): string {
  const who = sourceLabel(source)
  if (status === 'published') return `${who} · reviewed by an administrator${reviewedAt ? ' on ' + dateText(reviewedAt) : ''}`
  if (status === 'flagged') return `${who} · flagged by an administrator`
  if (status === 'withdrawn') return `${who} · withdrawn`
  return `${who} · not yet reviewed`
}

// The only way a distance is ever worded. Straight line, never a road, walking or driving distance.
export function formatStraightLine(m: number | null | undefined): string | null {
  if (m == null || !Number.isFinite(Number(m)) || Number(m) < 0) return null
  const v = Number(m)
  const text = v < 1000 ? `${Math.max(10, Math.round(v / 10) * 10)} m` : `${parseFloat((v / 1000).toFixed(2))} km`
  return `About ${text} (straight-line distance)`
}

export function isStale(observedAt: string | null | undefined, months: number, now: Date = new Date()): boolean {
  if (!observedAt) return false
  const d = new Date(observedAt)
  if (Number.isNaN(d.getTime())) return false
  const limit = new Date(now)
  limit.setMonth(limit.getMonth() - months)
  return d < limit
}

// Notes describe what was seen. They must not make safety or crime claims. This only warns a reviewer; it decides nothing.
const SAFETY_RE = /\b(crime|criminals?|robber(y|ies)|robbed|robbing|thie(f|ves)|theft|burglar\w*|kidnap\w*|murder\w*|violen(t|ce)|unsafe|dangerous|insecure|safe area|very safe|crime-free|armed|gangs?|cultists?|assault\w*|rape\w*)\b/i
export function looksLikeSafetyClaim(text: string | null | undefined): boolean {
  return !!text && SAFETY_RE.test(text)
}

export function pinInNigeria(lat: unknown, lng: unknown): boolean {
  const la = Number(lat), lo = Number(lng)
  return Number.isFinite(la) && Number.isFinite(lo) && la >= 4 && la <= 14 && lo >= 2.5 && lo <= 15
}
