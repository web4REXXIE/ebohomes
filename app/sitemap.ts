import type { MetadataRoute } from "next"
import { createClient } from "@supabase/supabase-js"
import { isValidListingId } from "@/lib/listing-id"

// Public, indexable pages. Not listed on purpose:
//  - auth routes, tenant/landlord/admin/inspector areas
//  - utility or login-gated pages (/list-property, /report-listing, /verify-receipt, /receipt/*)
const PUBLIC_PATHS = ["/", "/search", "/about", "/contact", "/terms", "/privacy", "/cookies"]

// Keeps the sitemap well inside search-engine limits. Newest listings are listed first.
const MAX_LISTINGS = 1000

// Same environment variable the rest of the app uses for its canonical URL. No fallback domain is
// hardcoded: if it is unset or invalid, the sitemap is empty rather than pointing at an unverified host.
function getSiteUrl(): string | null {
  const raw = (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim().replace(/\/+$/, "")
  return /^https?:\/\/[^\s/]+/i.test(raw) ? raw : null
}

// Approved listing ids only, read with the public anon key, so Row Level Security decides what is
// visible (the same read the public listing page makes). Any failure returns an empty list and the
// static pages are still served.
async function approvedListingIds(): Promise<string[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) return []
  try {
    const db = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data, error } = await db
      .from("listings")
      .select("id")
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .limit(MAX_LISTINGS)
    if (error || !data) return []
    return data.map((r: { id: unknown }) => r.id).filter(isValidListingId)
  } catch {
    return []
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getSiteUrl()
  if (!base) return []
  const pages = PUBLIC_PATHS.map((path) => ({ url: `${base}${path}` }))
  const listings = (await approvedListingIds()).map((id) => ({ url: `${base}/listing/${id}` }))
  return [...pages, ...listings]
}
