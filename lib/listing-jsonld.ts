// Stage 19a: structured data (JSON-LD) for an approved public listing.
// It only repeats facts that the listing page already shows. It never adds ratings, reviews, verification
// claims, amenities, availability or coordinates. Missing fields are left out, not guessed.

export type ListingJsonLdInput = {
  id: string
  title?: unknown
  description?: unknown
  location_text?: unknown
  price_monthly?: unknown
  bedrooms?: unknown
  bathrooms?: unknown
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const t = value.replace(/\s+/g, ' ').trim()
  if (!t) return null
  return t.length > max ? t.slice(0, max - 1).trimEnd() + '\u2026' : t
}

function count(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100 ? value : null
}

function rent(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null
}

/** `images` must already be public https URLs (the same watermarked photos the page shows). */
export function buildListingJsonLd(listing: ListingJsonLdInput, site: string, images: string[] = []): Record<string, unknown> | null {
  const name = text(listing.title, 120)
  if (!name || !listing.id) return null

  const base = site.replace(/\/+$/, '')
  const url = `${base}/listing/${listing.id}`
  const description = text(listing.description, 1000)
  const price = rent(listing.price_monthly)
  const bedrooms = count(listing.bedrooms)
  const bathrooms = count(listing.bathrooms)
  const where = text(listing.location_text, 200)
  const photos = images.filter((i) => /^https:\/\//i.test(i)).slice(0, 6)

  const about: Record<string, unknown> = { '@type': 'Accommodation' }
  if (bedrooms !== null) about.numberOfBedrooms = bedrooms
  if (bathrooms !== null) about.numberOfBathroomsTotal = bathrooms
  if (where) about.address = where

  const ld: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'RealEstateListing',
    url,
    name,
    publisher: { '@type': 'Organization', name: 'EboHomes', url: base },
  }
  if (description) ld.description = description
  if (photos.length) ld.image = photos
  if (Object.keys(about).length > 1) ld.about = about
  if (price !== null) {
    ld.offers = {
      '@type': 'Offer',
      url,
      price,
      priceCurrency: 'NGN',
      priceSpecification: { '@type': 'UnitPriceSpecification', price, priceCurrency: 'NGN', unitCode: 'MON', unitText: 'month' },
    }
  }
  return ld
}

/** JSON for a <script type="application/ld+json"> tag. Listing text is written by landlords, so "<" is escaped
 *  to stop a title or description from closing the script tag. */
export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')
}
