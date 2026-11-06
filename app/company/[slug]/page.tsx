import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { BadgeCheck, Building2, Mail, MapPin, Phone } from 'lucide-react'

export const dynamic = 'force-dynamic'

type PublicCompany = {
  name: string; slug: string; description: string | null
  operating_locations: string[]; services: string[]; areas_served: string[]
  public_email: string | null; public_phone: string | null; has_logo: boolean; verified: boolean; approved_at: string | null
}

// Public data only. The database function returns an APPROVED company or nothing, and never private details.
async function getCompany(slug: string): Promise<PublicCompany | null> {
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(slug)) return null
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) return null
  const db = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await db.rpc('public_company', { p_slug: slug })
  if (error || !data) return null
  return data as PublicCompany
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const c = await getCompany(slug)
  if (!c) return { title: 'Company not found | EboHomes', robots: { index: false } }
  return { title: `${c.name} | EboHomes`, description: c.description?.slice(0, 160) ?? `${c.name} on EboHomes` }
}

function Chips({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {items.map((x) => <li key={x} className="rounded-full bg-secondary px-3 py-1.5 text-sm">{x}</li>)}
    </ul>
  )
}

export default async function CompanyPublicPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const c = await getCompany(slug)
  if (!c) notFound()

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-4 pb-24">
      <Link href="/" className="inline-flex min-h-11 items-center text-sm font-semibold">EboHomes</Link>

      <header className="flex items-start gap-4">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-card">
          {c.has_logo
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={`/api/company-logo/${c.slug}`} alt={`${c.name} logo`} className="h-full w-full object-contain" />
            : <Building2 size={28} className="text-muted-foreground" aria-hidden />}
        </div>
        <div className="min-w-0">
          <h1 className="break-words text-2xl font-bold text-foreground">{c.name}</h1>
          <p className="mt-1 inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-900">
            <BadgeCheck size={14} aria-hidden /> Company verified by EboHomes
          </p>
        </div>
      </header>

      <p className="rounded-lg bg-secondary p-3 text-xs text-muted-foreground">
        This confirms the business exists. It does not mean EboHomes has approved any particular property, or any person who works for this company.
        Each listing shows its own authority status.
      </p>

      {c.description && <section><h2 className="mb-2 text-base font-bold">About</h2><p className="whitespace-pre-line text-sm text-foreground">{c.description}</p></section>}
      {c.services.length > 0 && <section><h2 className="mb-2 text-base font-bold">Services</h2><Chips items={c.services} /></section>}
      {c.operating_locations.length > 0 && (
        <section><h2 className="mb-2 flex items-center gap-1 text-base font-bold"><MapPin size={16} aria-hidden /> Operating locations</h2><Chips items={c.operating_locations} /></section>)}
      {c.areas_served.length > 0 && <section><h2 className="mb-2 text-base font-bold">Areas served</h2><Chips items={c.areas_served} /></section>}

      {(c.public_email || c.public_phone) && (
        <section className="space-y-2">
          <h2 className="text-base font-bold">Contact</h2>
          {c.public_phone && <p className="flex items-center gap-2 text-sm"><Phone size={16} aria-hidden /> <a className="min-h-11 py-2 underline" href={`tel:${c.public_phone.replace(/[^0-9+]/g, '')}`}>{c.public_phone}</a></p>}
          {c.public_email && <p className="flex items-center gap-2 text-sm"><Mail size={16} aria-hidden /> <a className="min-h-11 break-all py-2 underline" href={`mailto:${c.public_email}`}>{c.public_email}</a></p>}
        </section>)}
    </main>
  )
}
