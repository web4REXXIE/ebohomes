import type { MetadataRoute } from 'next'

// Static, public, indexable pages only. Verified against the route tree.
//
// Deliberately NOT listed:
//  - auth routes (/login, /forgot-password, /reset-password, /verification-pending)
//  - tenant, landlord, admin and inspector areas
//  - utility or login-gated pages (/list-property, /report-listing, /verify-receipt, /receipt/*)
//  - /listing/[id]: individual listing URLs are not generated here because no
//    existing public server-side source of approved listing ids is wired in.
//    They are intentionally not invented. See the Phase 1 report.
const PUBLIC_PATHS = ['/', '/search', '/about', '/contact', '/terms', '/privacy', '/cookies']

// Same environment variable the rest of the app already uses for its canonical
// URL. No fallback domain is hardcoded: if it is unset or invalid, the sitemap
// is empty rather than pointing search engines at an unverified host.
function getSiteUrl(): string | null {
  const raw = (process.env.NEXT_PUBLIC_SITE_URL ?? '').trim().replace(/\/+$/, '')
  return /^https?:\/\/[^\s/]+/i.test(raw) ? raw : null
}

export default function sitemap(): MetadataRoute.Sitemap {
  const base = getSiteUrl()
  if (!base) return []
  return PUBLIC_PATHS.map((path) => ({ url: `${base}${path}` }))
}
