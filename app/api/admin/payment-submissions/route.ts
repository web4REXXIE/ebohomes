import { NextResponse } from 'next/server'
import { UUID_RE } from '@/lib/payment-submission'
import { QUEUE_FILTERS, filterStatuses, type QueueFilter } from '@/lib/payment-review'
import { authAdmin } from '@/lib/admin-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const json = (b: unknown, status = 200) => NextResponse.json(b, { status, headers: { 'Cache-Control': 'no-store' } })

// Server-side only: real DB error goes to Vercel logs, never to the browser.
function logDbError(where: string, e: { code?: string; message?: string; details?: string; hint?: string } | null) {
  if (e) console.error(`admin payment-submissions ${where}:`, { code: e.code, message: e.message, details: e.details, hint: e.hint })
}

export async function GET(req: Request) {
  const a = await authAdmin(req)
  if ('res' in a) return a.res
  const { db } = a
  const q = new URL(req.url).searchParams
  const id = q.get('id')

  if (id !== null) {
    if (!UUID_RE.test(id)) return json({ error: 'Invalid request.' }, 400)
    const { data: submission, error } = await db.from('payment_submissions').select('*').eq('id', id).maybeSingle()
    if (error) { logDbError('detail', error); return json({ error: 'Could not load this submission.' }, 500) }
    if (!submission) return json({ error: 'Submission not found.' }, 404)

    const [tenancyR, termsR, tenantR, eventsR, historyR, authR] = await Promise.all([
      db.from('tenancies').select('id, tenancy_code, status, listing_id').eq('id', submission.tenancy_id).maybeSingle(),
      submission.terms_id
        ? db.from('rental_terms').select('id, rent_amount, deposit_amount, fees_amount').eq('id', submission.terms_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      db.from('profiles').select('id, full_name, phone').eq('id', submission.tenant_id).maybeSingle(),
      db.from('payment_submission_events').select('id, event, actor_id, note, created_at').eq('submission_id', id).order('created_at', { ascending: true }),
      db.from('payment_submissions').select('id, status, replaces_id, created_at')
        .eq('tenancy_id', submission.tenancy_id).eq('payment_type', submission.payment_type).order('created_at', { ascending: true }),
      db.auth.admin.getUserById(submission.tenant_id),
    ])
    for (const [n, r] of [['tenancy', tenancyR], ['terms', termsR], ['tenant', tenantR], ['events', eventsR], ['history', historyR]] as const) logDbError(`detail.${n}`, (r as any).error)
    if (eventsR.error || historyR.error) return json({ error: 'Could not load this submission.' }, 500)

    const listingR = tenancyR.data?.listing_id
      ? await db.from('listings').select('title, location_text, properties(public_id)').eq('id', tenancyR.data.listing_id).maybeSingle()
      : { data: null, error: null }
    logDbError('detail.listing', listingR.error)

    const ids = Array.from(new Set([...(eventsR.data ?? []).map((e: any) => e.actor_id), submission.reviewed_by].filter(Boolean))) as string[]
    const names: Record<string, string> = {}
    if (ids.length) {
      const { data: ps, error: pe } = await db.from('profiles').select('id, full_name').in('id', ids)
      logDbError('detail.names', pe)
      for (const p of ps ?? []) names[p.id] = p.full_name ?? 'Staff'
    }

    return json({
      submission,
      tenant: tenantR.data ? { full_name: tenantR.data.full_name, phone: tenantR.data.phone, email: authR.data?.user?.email ?? null } : null,
      listing: listingR.data ?? null,
      tenancy: tenancyR.data ? { tenancy_code: tenancyR.data.tenancy_code, status: tenancyR.data.status } : null,
      terms: termsR.data ?? null,
      events: eventsR.data ?? [],
      history: historyR.data ?? [],
      names,
    })
  }

  const f = (q.get('filter') ?? 'awaiting') as QueueFilter
  if (!QUEUE_FILTERS.some((x) => x.key === f)) return json({ error: 'Unknown filter.' }, 400)
  const statuses = filterStatuses(f)
  let query = db.from('payment_submissions')
    .select('id, tenant_id, tenancy_id, payment_type, expected_amount, amount_paid, status, replaces_id, created_at')
    .order('created_at', { ascending: false }).limit(200)
  if (statuses) query = query.in('status', statuses)
  const { data: rows, error } = await query
  if (error) { logDbError('queue', error); return json({ error: 'Could not load the queue.' }, 500) }

  const tenantIds = Array.from(new Set((rows ?? []).map((r: any) => r.tenant_id)))
  const nameOf: Record<string, string> = {}
  if (tenantIds.length) {
    const { data: ps, error: pe } = await db.from('profiles').select('id, full_name').in('id', tenantIds)
    logDbError('queue.names', pe)
    for (const p of ps ?? []) nameOf[p.id] = p.full_name ?? 'Tenant'
  }
  return json({ items: (rows ?? []).map((r: any) => ({ ...r, tenant_name: nameOf[r.tenant_id] ?? 'Tenant' })) })
}