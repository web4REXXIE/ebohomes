// Pure helpers for the "Trust and verification" block on the property details page.
// They only read records the system already has. They never create or guess a verification.

export type RowState = 'yes' | 'no' | 'unavailable'

export type IconKey = 'route' | 'droplet' | 'zap' | 'wifi' | 'lock' | 'building' | 'leaf' | 'home'

export type InspectionItem = {
  key: string
  label: string
  icon: IconKey
  value: string
  match: boolean | null
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

// Only the exact value true counts as a yes. Anything else is not evidence.
function flag(value: unknown): boolean {
  return value === true
}

// Landlord identity. Comes from the existing listing_trust record only.
// If the record could not be loaded we say so instead of saying "not checked".
export function identityState(trust: unknown, failed = false): RowState {
  if (failed) return 'unavailable'
  if (!isObject(trust)) return 'unavailable'
  return flag(trust.identity_checked) ? 'yes' : 'no'
}

// Inspection. Comes from public_listing_inspections only, which already hides
// inspections that are unreviewed, not a pass, out of date, or on hold.
// The inspected flag inside listing_trust is NOT used.
export function inspectionState(inspection: unknown, failed = false): RowState {
  if (failed) return 'unavailable'
  return isObject(inspection) ? 'yes' : 'no'
}

export function formatInspectionDate(value: unknown): string {
  if (typeof value !== 'string' && !(value instanceof Date)) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function firstText(...values: unknown[]): string {
  for (const value of values) {
    const t = text(value)
    if (t) return t
  }
  return ''
}

function matchOf(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

// The facts and notes shown when the inspection card is opened.
export function inspectionDetails(inspection: unknown): { facts: InspectionItem[]; notes: InspectionItem[] } {
  if (!isObject(inspection)) return { facts: [], notes: [] }
  const i = inspection

  const allFacts: InspectionItem[] = [
    { key: 'road', label: 'Road', icon: 'route', value: text(i.road_condition), match: matchOf(i.road_matches) },
    { key: 'water', label: 'Water', icon: 'droplet', value: text(i.water_source), match: matchOf(i.water_matches) },
    { key: 'electricity', label: 'Electricity', icon: 'zap', value: text(i.electricity_notes), match: matchOf(i.electricity_matches) },
    { key: 'network', label: 'Network', icon: 'wifi', value: text(i.network_notes), match: matchOf(i.network_matches) },
    { key: 'security', label: 'Security', icon: 'lock', value: text(i.security_notes), match: matchOf(i.security_matches) },
    { key: 'neighbourhood', label: 'Neighbourhood', icon: 'building', value: text(i.neighborhood_type), match: null },
  ]
  const facts = allFacts.filter((item) => item.value)

  const allNotes: InspectionItem[] = [
    { key: 'environment', label: 'Environment', icon: 'leaf', value: text(i.environment_notes), match: matchOf(i.environment_matches) },
    { key: 'condition', label: 'Condition', icon: 'home', value: firstText(i.overall_notes, i.condition_notes), match: matchOf(i.condition_matches) },
  ]
  const notes = allNotes.filter((item) => item.value)

  return { facts, notes }
}

export function nearbyText(inspection: unknown): string {
  return isObject(inspection) ? text(inspection.nearby_landmarks) : ''
}
