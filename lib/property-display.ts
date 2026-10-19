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