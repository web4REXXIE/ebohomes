// Stage 19a: the one list of pages that must never appear in search results.
// These are signed-in areas, account actions, one-off links (receipts, payment confirmation) and
// authentication screens. Plain .mjs on purpose, so next.config.mjs and the tests can both read it.
//
// Two layers use this list:
//   1. next.config.mjs sends an "X-Robots-Tag: noindex, nofollow" header for each prefix. This covers every
//      page below it, including client-component layouts that cannot export metadata.
//   2. Each folder's server layout also exports PRIVATE_ROBOTS (lib/seo.ts) as a <meta name="robots"> tag.
//
// This is a search-engine instruction, not security. Access control stays in the app and in Supabase.
export const PRIVATE_ROUTE_PREFIXES = [
  // Staff and role dashboards
  '/admin',
  '/dashboard',
  '/home',
  '/inspector',
  // Tenant and landlord account areas
  '/journey',
  '/tenancies',
  '/viewings',
  '/messages',
  '/notifications',
  '/profile',
  '/settings',
  '/saved',
  '/applications',
  '/apply',
  '/handovers',
  '/inspections',
  '/inspect',
  '/list-property',
  '/report-listing',
  // One-off links
  '/payment-confirmation',
  '/receipt',
  '/verify-receipt',
  // Authentication
  '/login',
  '/forgot-password',
  '/reset-password',
  '/verification-pending',
]

// Private paths that sit inside a public URL space. A landlord-only action under a public listing.
export const PRIVATE_PATTERNS = ['/listing/:id/feature']

// Server endpoints. Not pages, but there is no reason for them to be indexed either.
export const API_PATTERN = '/api/:path*'

export const NOINDEX_VALUE = 'noindex, nofollow'

// Header rules in the format next.config.mjs expects.
export function noindexHeaderRules() {
  const sources = [
    ...PRIVATE_ROUTE_PREFIXES.map((p) => `${p}/:path*`),
    ...PRIVATE_PATTERNS,
    API_PATTERN,
  ]
  return sources.map((source) => ({ source, headers: [{ key: 'X-Robots-Tag', value: NOINDEX_VALUE }] }))
}
