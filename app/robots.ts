import type { MetadataRoute } from 'next'

// Stage 19a: only server endpoints are blocked from crawling here.
//
// Private pages (admin, dashboards, account areas, receipts, login) are deliberately NOT listed. If a page is
// disallowed, a crawler never fetches it, so it never sees the noindex instruction, and the bare URL can
// still show up in search results if another site links to it. Those pages are kept out of search by
// noindex instead: an X-Robots-Tag header from next.config.mjs and a robots meta tag from each server layout
// (see lib/private-routes.mjs).
//
// Neither robots.txt nor noindex protects anything. Signed-in pages are protected by the app's own access
// checks and by Supabase Row Level Security.
const BLOCKED_FROM_CRAWLING = ['/api/']

// Same environment variable the rest of the app already uses for its canonical
// URL. No fallback domain is hardcoded: if unset or invalid, the Sitemap line
// is omitted and the crawl rules still apply.
function getSiteUrl(): string | null {
  const raw = (process.env.NEXT_PUBLIC_SITE_URL ?? '').trim().replace(/\/+$/, '')
  return /^https?:\/\/[^\s/]+/i.test(raw) ? raw : null
}

export default function robots(): MetadataRoute.Robots {
  const base = getSiteUrl()
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: BLOCKED_FROM_CRAWLING }],
    ...(base ? { sitemap: `${base}/sitemap.xml` } : {}),
  }
}
