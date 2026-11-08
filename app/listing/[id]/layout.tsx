import type { Metadata } from "next"
import { createClient } from "@supabase/supabase-js"
import { isValidListingId } from "@/lib/listing-id"
import { cleanMediaUrls } from "@/lib/property-media"
import { watermarkedUrl } from "@/lib/watermark"

// The listing page itself lives in page.tsx (a client component). This layout only adds the
// per-listing metadata and renders its children. It reads the same public listing row the page
// reads, with the public anon key, so Row Level Security decides what is visible. Only listings
// that are approved are described; anything else gets a generic, non-indexed result.

type Params = Promise<{ id: string }>

const FALLBACK: Metadata = { title: "Property listing", robots: { index: false, follow: true } }

function naira(value: unknown): string | null {
  const n = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(n) || n <= 0) return null
  return "\u20A6" + Math.round(n).toLocaleString("en-NG")
}

function shorten(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim()
  if (t.length <= max) return t
  return t.slice(0, max - 1).replace(/\s+\S*$/, "") + "\u2026"
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params
  if (!isValidListingId(id)) return FALLBACK

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) return FALLBACK

  try {
    const db = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data, error } = await db
      .from("listings")
      .select("title, description, location_text, price_monthly, property_type, bedrooms, photos, status")
      .eq("id", id)
      .maybeSingle()

    if (error || !data || data.status !== "approved") return FALLBACK

    const title = shorten(String(data.title ?? "Property for rent"), 70)
    const rent = naira(data.price_monthly)
    const where = data.location_text ? String(data.location_text) : "Ebonyi State"
    const beds = typeof data.bedrooms === "number" && data.bedrooms > 0 ? `${data.bedrooms}-bedroom ` : ""
    const kind = data.property_type ? String(data.property_type).toLowerCase() : "property"
    const lead = `${beds}${kind} for rent in ${where}${rent ? ` at ${rent} per month` : ""}.`
    const body = data.description ? " " + shorten(String(data.description), 110) : ""
    const description = shorten(lead + body, 200)

    const photo = cleanMediaUrls(data.photos).find((p) => /^https:\/\//i.test(p))
    // Same 1600px watermarked version the gallery uses, so shared previews match the site and the
    // file is a sensible size for social networks.
    const images = photo ? [{ url: watermarkedUrl(photo, 1600), alt: title }] : [{ url: "/og-image.jpg", width: 1200, height: 630, alt: "EboHomes" }]
    const canonical = `/listing/${id}`

    return {
      title,
      description,
      alternates: { canonical },
      openGraph: { title, description, url: canonical, siteName: "EboHomes", type: "website", locale: "en_NG", images },
      twitter: { card: "summary_large_image", title, description, images: images.map((i) => i.url) },
    }
  } catch {
    return FALLBACK
  }
}

export default function ListingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
