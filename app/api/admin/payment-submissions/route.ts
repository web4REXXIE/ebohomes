import { NextResponse } from 'next/server'
import { UUID_RE } from '@/lib/payment-submission'
import { filterStatuses, type QueueFilter } from '@/lib/payment-review'
import { authAdmin } from '@/lib/admin-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET ?filter=awaiting|info|verified|rejected|all  -> list
// GET ?id=<submission id>                          -> full detail for the reviewer
export async function GET(req: Request) {
  const a = await authAdmin(req)
  if ('res' in a) return a.res
  const { db } = a
  const q = new URL(req.url).searchParams
  const id = q.get('id')

  if (id) {
    if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
    const { data: s } = await db.from('payment_submissions').select('*').eq('id', id).maybeSingle()
    if (!s) return NextResponse.json({ error: 'Not found.' }, { status: 404 })
    const [tenancy, tenant, terms, events, history] = await Promise.all([
      db.from('tenancies').select('id, tenancy_code, status, rent_period, start_date, end_date, listing_id').eq('id', s.tenancy_id).maybeSingle(),
      db.from('profiles').select('id, full_name, email, phone').eq('id', s.tenant_id).maybeSingle(),
      db.from('rental_terms').select('id, rent_amount, deposit_amount, fees_amount, status, version').eq('id', s.terms_id ?? '00000000-0000-0000-0000-000000000000').maybeSingle(),
      db.from('payment_submission_events').select('id, event, actor_id, note, details, created_at').eq('submission_id', id).order('created_at', { ascending: true }),
      db.from('payment_submissions').select('id, status, amount_paid, review_note, reviewed_by, reviewed_at, created_at, replaces_id')
        .eq('tenancy_id', s.tenancy_id).eq('payment_type', s.payment_type).order('created_at', { ascending: true }),
    ])
    const { data: listing } = tenancy.data?.listing_id
      ? await db.from('listings').select('id, title, location_text, properties(public_id)').eq('id', tenancy.data.listing_id).maybeSingle()
      : { data: null }
    const actorIds = Array.from(new Set([...(events.data ?? []).map((e: any) => e.actor_id), ...(history.data ?? []).map((h: any) => h.reviewed_by)].filter(Boolean)))
    const { data: actors } = actorIds.length ? await db.from('profiles').select('id, full_name').in('id', actorIds as string[]) : { data: [] as any[] }
    const names: Record<string, string> = {}
    for (const p of actors ?? []) names[(p as any).id] = (p as any).full_name ?? 'Staff'
    return NextResponse.json({ submission: s, tenancy: tenancy.data, tenant: tenant.data, terms: terms.data, listing, events: events.data ?? [], history: history.data ?? [], names })
  }

  const f = (q.get('filter') ?? 'awaiting') as QueueFilter
  let query = db.from('payment_submissions')
    .select('id, tenancy_id, tenant_id, payment_type, amount_paid, expected_amount, status, replaces_id, created_at, transaction_reference')
    .order('created_at', { ascending: true }).limit(100)
  const st = filterStatuses(f)
  if (st) query = query.in('status', st)
  const { data: rows, error } = await query
  if (error) return NextResponse.json({ error: 'Could not load the queue.' }, { status: 500 })
  const tIds = Array.from(new Set((rows ?? []).map((r: any) => r.tenant_id)))
  const { data: profs } = tIds.length ? await db.from('profiles').select('id, full_name').in('id', tIds) : { data: [] as any[] }
  const nm: Record<string, string> = {}
  for (const p of profs ?? []) nm[(p as any).id] = (p as any).full_name ?? 'Tenant'
  return NextResponse.json({ items: (rows ?? []).map((r: any) => ({ ...r, tenant_name: nm[r.tenant_id] ?? 'Tenant' })) })
}