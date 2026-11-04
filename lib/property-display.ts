// Pure helpers for showing a property the same way on every page. No imports, so they can be unit tested directly.

export type TitleSource = {
  title?: string | null
  property_type?: string | null
  location_text?: string | null
  bedrooms?: number | null
}

const URL_LIKE = /(https?:\/\/|www\.)|(^[\w-]+\.(com|app|ng|org|net|co)(\/|$))|vercel\.app/i

// A title is usable when a person typed a real name. Empty text, a pasted link or the word "Property" are not.
export function isUsableTitle(title: string | null | undefined): boolean {
  const t = (title ?? '').trim()
  if (t.length < 3) return false
  if (URL_LIKE.test(t)) return false
  if (/^property$/i.test(t)) return false
  return true
}

function typeLabel(type: string | null | undefined): string {
  const t = (type ?? '').replace(/_/g, ' ').trim()
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : ''
}

// The name to show for a property. Falls back to real data: "5 bed Duplex in Hausa quarters".
export function displayTitle(l: TitleSource | null | undefined): string {
  if (!l) return 'Property'
  if (isUsableTitle(l.title)) return (l.title as string).trim()
  const type = typeLabel(l.property_type)
  const where = (l.location_text ?? '').trim()
  const beds = l.bedrooms != null && Number(l.bedrooms) > 0 ? `${l.bedrooms} bed ` : ''
  if (type && where) return `${beds}${type} in ${where}`
  if (type) return `${beds}${type}`.trim()
  if (where) return `Property in ${where}`
  return 'Property'
}

// A listing is live to tenants only when its status is "approved". Paused, pending, rejected and suspended are not live.
export function listingIsLive(status: string | null | undefined): boolean {
  return status === 'approved'
}

/* ---------------- Phase 8.1: property details helpers ---------------- */

export function propertyTypeLabel(type: string | null | undefined): string {
  return typeLabel(type)
}

// "1 bedroom", "3 bedrooms". Zero is shown as "Studio". Missing or invalid gives null so nothing is shown.
export function bedroomsLabel(n: number | string | null | undefined): string | null {
  if (n === null || n === undefined || n === '') return null
  const v = Number(n)
  if (!Number.isFinite(v) || v < 0) return null
  if (v === 0) return 'Studio'
  return `${v} ${v === 1 ? 'bedroom' : 'bedrooms'}`
}

export function bathroomsLabel(n: number | string | null | undefined): string | null {
  if (n === null || n === undefined || n === '') return null
  const v = Number(n)
  if (!Number.isFinite(v) || v < 0) return null
  return `${v} ${v === 1 ? 'bathroom' : 'bathrooms'}`
}

// Amenities are saved as ids by the listing form. These are the same labels the form shows.
const AMENITY_LABELS: Record<string, string> = {
  generator: 'Generator',
  water: 'Water Supply',
  'tiled-floor': 'Tiled Floor',
  'pop-ceiling': 'POP Ceiling',
  parking: 'Parking Space',
  security: 'Security (24/7)',
  wardrobe: 'Wardrobe',
  ac: 'Air Conditioning',
}

export function amenityLabel(raw: string | null | undefined): string {
  const t = (raw ?? '').trim()
  if (!t) return ''
  const known = AMENITY_LABELS[t.toLowerCase()]
  if (known) return known
  // Unknown id such as "swimming-pool": tidy it. Text that already has spaces is left as written.
  if (/[-_]/.test(t) && !/\s/.test(t)) {
    const spaced = t.replace(/[-_]+/g, ' ')
    return spaced.charAt(0).toUpperCase() + spaced.slice(1)
  }
  return t
}

// Labels for display: tidied, no blanks, no duplicates, original order kept.
export function amenityLabels(list: unknown): string[] {
  if (!Array.isArray(list)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of list) {
    if (typeof item !== 'string') continue
    const label = amenityLabel(item)
    const key = label.toLowerCase()
    if (!label || seen.has(key)) continue
    seen.add(key)
    out.push(label)
  }
  return out
}

// A money value from the database. Missing, blank, negative or non-numeric gives null. It never turns missing into 0.
export function toMoney(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value !== 'number' && typeof value !== 'string') return null
  const v = Number(value)
  return Number.isFinite(v) && v >= 0 ? v : null
}

export type UpfrontInput = {
  price_monthly?: unknown
  service_charge?: unknown
  caution_deposit?: unknown
}

// Estimated upfront total = monthly rent + service charge + caution deposit.
// Returns a number only when ALL THREE amounts are present and valid (rent must be above 0).
// If any is missing the answer is null. A missing amount is never treated as zero.
export function upfrontTotal(l: UpfrontInput | null | undefined): number | null {
  if (!l) return null
  const rent = toMoney(l.price_monthly)
  const service = toMoney(l.service_charge)
  const caution = toMoney(l.caution_deposit)
  if (rent === null || rent <= 0 || service === null || caution === null) return null
  return rent + service + caution
}

export type AvailabilityInfo = { label: string; availableNow: boolean }

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})/

// Turns availability_date (a date such as 2026-12-01) into plain words.
// Today or earlier: "Available now". Later: "Available from 1 December 2026".
// No date: "Available" (the listing is live). Unreadable text is shown as written.
export function availabilityInfo(value: string | null | undefined, now: Date = new Date()): AvailabilityInfo {
  const raw = (value ?? '').trim()
  if (!raw) return { label: 'Available', availableNow: true }
  const m = DATE_ONLY.exec(raw)
  if (!m) return { label: `Available: ${raw}`, availableNow: false }
  const target = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  if (!Number.isFinite(target)) return { label: `Available: ${raw}`, availableNow: false }
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  if (target <= today) return { label: 'Available now', availableNow: true }
  const pretty = new Date(target).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
  return { label: `Available from ${pretty}`, availableNow: false }
}
