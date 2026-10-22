'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { partyState } from '@/lib/handover'

export default function HandoversPage() {
  const router = useRouter()
  const [items, setItems] = useState<any[] | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    setErr(null)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push('/login'); return }
    const res = await fetch('/api/handover', { headers: { Authorization: `Bearer ${session.access_token}` } })
    const j = await res.json().catch(() => null)
    if (!res.ok) { setErr(j?.error ?? 'Could not load this page.'); return }
    setItems(j.items)
  }, [router])
  useEffect(() => { load() }, [load])

  if (err) return (
    <div className="mx-auto max-w-lg space-y-3 p-4">
      <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">{err}</p>
      <button onClick={load} className="min-h-12 w-full rounded-xl bg-primary font-bold text-primary-foreground">Try again</button>
    </div>)
  if (!items) return <div className="flex min-h-[50vh] items-center justify-center" role="status" aria-label="Loading"><Loader2 className="animate-spin text-primary" size={28} aria-hidden /></div>

  return (
    <div className="mx-auto max-w-lg space-y-4 p-4">
      <div>
        <h1 className="text-xl font-bold text-foreground">Key handovers</h1>
        <p className="text-sm text-muted-foreground">Tenancies where EboHomes has verified a payment and the handover needs confirming.</p>
      </div>
      {items.length === 0 ? <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">Nothing to confirm yet.</p>
        : <ul className="space-y-2">{items.map((i) => (
          <li key={i.tenancy_id}>
            <Link href={`/tenancies/${i.tenancy_id}/handover`} className="block min-h-14 space-y-1 rounded-xl border border-border bg-card p-3 text-sm">
              <span className="flex flex-wrap items-center justify-between gap-2"><b>{i.listing_title ?? 'Property'} · {i.tenancy_code}</b>
                <span className="rounded-full border border-border bg-secondary px-2.5 py-1 text-xs font-semibold">{i.role === 'tenant' ? 'You are the tenant' : 'You are the landlord'}</span></span>
              <span className="block text-xs text-muted-foreground">{partyState(i.status, i.my_confirmed_at, i.other_confirmed_at)}</span>
              {i.hold_reason && <span className="block text-xs text-amber-900">Payout on hold: {i.hold_reason}</span>}
            </Link>
          </li>))}</ul>}
    </div>
  )
}