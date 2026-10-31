'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, MapPin } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { CreateTenancyModal } from '@/components/create-tenancy-modal'
import { buildSetupRows, type SetupRow } from '@/lib/landlord-setup'
import { fetchTenantNames } from '@/lib/tenant-names'

const naira = (n: unknown) => (typeof n === 'number' || (typeof n === 'string' && n !== '') ? '₦' + Number(n).toLocaleString('en-NG', { maximumFractionDigits: 0 }) : 'Price not set')

type Row = SetupRow<any>

// Shown at the top of the landlord's Tenancies page. Lists applicants EboHomes approved who confirmed they want to proceed
// and have no tenancy yet. Creating the tenancy itself is still guarded by the database.
export function LandlordTenancySetup() {
  const router = useRouter()
  const [state, setState] = useState<'loading' | 'error' | 'ok'>('loading')
  const [uid, setUid] = useState<string | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [listings, setListings] = useState<Record<string, any>>({})
  const [names, setNames] = useState<Record<string, string>>({})
  const [open, setOpen] = useState<Row | null>(null)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    setUid(user.id)
    const apps = await supabase.from('applications')
      .select('id, listing_id, tenant_id, status, tenant_interest_at, case_ref, application_data')
      .eq('landlord_id', user.id).eq('status', 'approved').not('tenant_interest_at', 'is', null)
      .order('tenant_interest_at', { ascending: true })
    if (apps.error) { setState('error'); return }
    const list = apps.data ?? []
    if (list.length === 0) { setRows([]); setState('ok'); return }
    const ten = await supabase.from('tenancies').select('application_id, listing_id, status').eq('landlord_id', user.id)
    if (ten.error) { setState('error'); return } // never offer "create" if we cannot see existing tenancies
    const ids = Array.from(new Set(list.map((a: any) => a.listing_id)))
    const ls = await supabase.from('listings').select('id, title, status, price_monthly, location_text, photos').in('id', ids)
    if (ls.error) { setState('error'); return }
    setListings(Object.fromEntries((ls.data ?? []).map((l: any) => [l.id, l])))
    // Tenant names are a convenience. If the profile cannot be read, the row still works.
    setNames(await fetchTenantNames(list.map((a: any) => a.tenant_id)))
    setRows(buildSetupRows(list as any[], (ten.data ?? []) as any[], (ls.data ?? []) as any[]))
    setState('ok')
  }, [router])

  useEffect(() => { load() }, [load])

  if (state === 'loading') return <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground"><Loader2 size={16} className="animate-spin" aria-hidden /> Checking for tenants ready for setup...</p>
  if (state === 'error') return <p role="alert" className="m-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">We could not load applicants who are ready for a tenancy. Refresh the page. If it keeps happening, contact EboHomes.</p>
  if (rows.length === 0) return null

  return (
    <section className="mx-auto max-w-3xl space-y-3 p-4" aria-label="Tenants ready for tenancy setup">
      <div>
        <h2 className="text-lg font-bold text-foreground">Ready for tenancy setup ({rows.length})</h2>
        <p className="text-sm text-muted-foreground">EboHomes approved these applicants and they confirmed they want to proceed. Create the tenancy, then propose the rental terms. Nothing is rented until EboHomes verifies payment and the key handover is confirmed.</p>
      </div>
      {rows.map((r) => {
        const l = listings[r.app.listing_id]
        const photo = Array.isArray(l?.photos) ? l.photos.find((x: unknown) => typeof x === 'string') : null
        const who = names[r.app.tenant_id] || 'Approved applicant'
        return (
          <article key={r.app.id} className="overflow-hidden rounded-xl border border-border bg-card">
            {photo && <img src={photo} alt="" loading="lazy" className="h-36 w-full object-cover" />}
            <div className="space-y-1 p-4 text-sm">
              <p className="text-base font-bold text-foreground">{l?.title ?? 'Property'}</p>
              {l?.location_text && <p className="flex items-center gap-1 text-muted-foreground"><MapPin size={14} aria-hidden /> {l.location_text}</p>}
              <p className="text-muted-foreground">Listed rent: <b className="text-foreground">{naira(l?.price_monthly)}</b> · Applicant: <b className="text-foreground">{who}</b>{r.app.case_ref ? ` · Ref ${r.app.case_ref}` : ''}</p>
              {r.reason
                ? <p role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">{r.reason}</p>
                : <button type="button" onClick={() => setOpen(r)} className="mt-2 min-h-11 w-full rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground">Create tenancy</button>}
            </div>
          </article>
        )
      })}
      {open && uid && (
        <CreateTenancyModal
          application={{ id: open.app.id, listing_id: open.app.listing_id, tenant_id: open.app.tenant_id, application_data: open.app.application_data }}
          listing={{ price_monthly: listings[open.app.listing_id]?.price_monthly ?? null, title: listings[open.app.listing_id]?.title ?? 'Property' }}
          landlordId={uid}
          onClose={() => setOpen(null)}
          onCreated={(t) => { setOpen(null); router.push(`/dashboard/tenancies/${t.id}`) }}
        />
      )}
    </section>
  )
}