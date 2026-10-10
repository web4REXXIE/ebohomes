/**
 * Canonical URL of the app, used for OAuth redirects.
 * Production: set NEXT_PUBLIC_SITE_URL in Vercel's Production environment ONLY.
 * Local/preview: leave unset; falls back to the current origin.
 */
export function getSiteUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL
  if (fromEnv) return fromEnv.replace(/\/+$/, '')
  if (typeof window !== 'undefined') return window.location.origin
  return 'http://localhost:3000'
}