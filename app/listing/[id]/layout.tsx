import type { Metadata } from 'next'
import { createClient } from '@supabase/supabase-js'

type RouteParams = { id: string }

type LayoutProps = {
  children: React.ReactNode
  // Next 15 passes params as a Promise; Next 14 passes a plain object.
  // `await` handles both.
  params: Promise<RouteParams> | RouteParams
}

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? '').replace(/\/$/, '')

function formatNaira(value: unknown) {
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount <= 0) return null
  return `₦${amount.toLocaleString('en-NG')}`
}

function truncate(text: string, max: number) {
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean
}

export async function generateMetadata({
  params,
}: LayoutProps): Promise<Metadata> {
  const { id } = await params

  const fallback: Metadata = {
    title: 'Property on EboHomes',
    description: 'Verified rental properties in Ebonyi State.',
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey || !id) return fallback

  try {
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Only approved listings are exposed to link previews
    const { data, error } = await supabase
      .from('listings')
      .select(
        'title, description, location_text, price_monthly, bedrooms, property_type, photos'
      )
      .eq('id', id)
      .eq('status', 'approved')
      .maybeSingle()

    if (error || !data) return fallback

    const price = formatNaira(data.price_monthly)

    const summary = [
      price ? `${price}/month` : null,
      data.bedrooms != null ? `${data.bedrooms} bed` : null,
      data.property_type || null,
      data.location_text || null,
    ]
      .filter(Boolean)
      .join(' · ')

    const description = truncate(
      data.description ? `${summary}. ${data.description}` : summary,
      180
    )

    const title = `${data.title} | EboHomes`

    const photos: string[] = Array.isArray(data.photos) ? data.photos : []
    const image = photos[0]
    const url = SITE_URL ? `${SITE_URL}/listing/${id}` : undefined

    return {
      title,
      description,
      ...(SITE_URL ? { metadataBase: new URL(SITE_URL) } : {}),
      openGraph: {
        type: 'website',
        siteName: 'EboHomes',
        title,
        description,
        ...(url ? { url } : {}),
        ...(image
          ? { images: [{ url: image, alt: data.title }] }
          : {}),
      },
      twitter: {
        card: image ? 'summary_large_image' : 'summary',
        title,
        description,
        ...(image ? { images: [image] } : {}),
      },
    }
  } catch {
    return fallback
  }
}

export default function ListingLayout({ children }: LayoutProps) {
  return <>{children}</>
}