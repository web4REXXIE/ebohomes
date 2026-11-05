'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2, ChevronRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'

// Admin home: only what is waiting for a decision. Everything else is in the menu.
type Item = { label: string; hint: string; href: string; count: number | null }

export default function AdminHome() {
  const [items, setItems] = useState<Item[] | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const count = async (q: PromiseLike<{ count: number | null; error: unknown }>) => {
        const { count, error } = await q
        return error ? null : count ?? 0
      }
      const [listings, authority, landlords] = await Promise.all([
        count(supabase.from('listings').select('id', { count: 'exact', head: true }).eq('status', 'pending').eq('authority_status', 'accepted')),
        count(supabase.from('listings').select('id', { count: 'exact', head: true }).eq('authority_status', 'submitted')),
        count(
          supabase.from('profiles').select('id', { count: 'exact', head: true })
            .eq('role', 'landlord').eq('verification_status', 'pending')
            .not('id_document_url', 'is', null).not('selfie_url', 'is', null),
        ),
      ])
      if (!alive) return
      setItems([
        { label: 'Listings ready to approve', hint: 'Authority accepted, waiting for your approval', href: '/admin/property-review', count: listings },
        { label: 'Authority to review', hint: 'Evidence that a lister may list a property', href: '/admin/listing-authority', count: authority },
        { label: 'Landlords to verify', hint: 'Identity checks waiting for a decision', href: '/admin/verify-landlords', count: landlords },
      ])
    })()
    return () => { alive = false }
  }, [])

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <div>
        <h1 className="text-xl font-bold text-foreground">Needs your attention</h1>
        <p className="text-sm text-muted-foreground">Open the menu for everything else.</p>
      </div>
      {!items ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={16} className="animate-spin" aria-hidden /> Loading...</p>
      ) : (
        <ul className="space-y-2">
          {items.map((i) => (
            <li key={i.href}>
              <Link href={i.href} className="flex min-h-14 items-center justify-between gap-3 rounded-lg border border-border bg-card p-4">
                <span className="min-w-0">
                  <span className="block font-semibold text-foreground">{i.label}</span>
                  <span className="block text-xs text-muted-foreground">{i.hint}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className={`rounded-full px-3 py-1 text-sm font-bold ${i.count ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}>
                    {i.count ?? '—'}
                  </span>
                  <ChevronRight size={16} aria-hidden />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
