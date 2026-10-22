import { NextResponse } from 'next/server'
import { EVIDENCE_BUCKET, UUID_RE, isValidEvidencePath, validateEvidenceMeta, validateSubmission } from '@/lib/payment-submission'
import { authUser, fail, loadPayContext } from '@/lib/payment-submission-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST the submission form. Records EVIDENCE ONLY. It never touches payments and never marks anything verified.
export async function POST(req: Request) {
  const a = await authUser(req)
  if ('res' in a) return a.res
  const { db, user } = a
  let body: any
  try { body = await req.json() } catch { return fail('Invalid request.', 400) }

  const v = validateSubmission(body ?? {})
  if (!v.ok) return fail('Please check the form.', 400, { fields: v.errors })
  const ctx = await loadPayContext(db, user.id, body.tenancy_id, v.value.payment_type)
  if ('res' in ctx) return ctx.res

  const replaces = body.replaces_id == null || body.replaces_id === '' ? null : String(body.replaces_id)
  if (replaces && !UUID_RE.test(replaces)) return fail('Invalid request.', 400)
  if (!isValidEvidencePath(body.evidence_path, user.id, ctx.tenancyId)) return fail('Invalid evidence file.', 400)

  // simple abuse limit: 10 submissions per tenant per hour
  const since = new Date(Date.now() - 3600_000).toISOString()
  const { count } = await db.from('payment_submissions').select('id', { count: 'exact', head: true }).eq('tenant_id', user.id).gte('created_at', since)
  if ((count ?? 0) >= 10) return fail('Too many submissions. Please wait an hour or contact EboHomes.', 429)

  // the file must really exist in the private bucket, with an allowed type and size
  const folder = `${user.id}/${ctx.tenancyId}`
  const name = String(body.evidence_path).split('/')[2]
  const { data: files } = await db.storage.from(EVIDENCE_BUCKET).list(folder, { limit: 5, search: name })
  const file = (files ?? []).find((f: any) => f.name === name)
  const mime = (file as any)?.metadata?.mimetype
  const bytes = Number((file as any)?.metadata?.size)
  if (!file || validateEvidenceMeta(mime, bytes)) return fail('Your evidence file did not upload. Please try again.', 400)

  const { data, error } = await db.rpc('eb_submit_payment_evidence', {
    p_tenant: user.id, p_tenancy: ctx.tenancyId, p_terms: ctx.termsId, p_type: v.value.payment_type, p_expected: ctx.expected,
    p_amount: v.value.amount_paid, p_payer_name: v.value.payer_name, p_payer_bank: v.value.payer_bank,
    p_ref: v.value.transaction_reference, p_paid_at: v.value.paid_at, p_method: v.value.payment_method, p_notes: v.value.notes,
    p_path: body.evidence_path, p_mime: mime, p_bytes: bytes, p_replaces: replaces,
  })
  if (error) {
    const m = error.message ?? ''
    if (m.includes('payment_submissions_one_open_idx')) return fail('You already have a submission for this payment waiting for EboHomes. You do not need to send it again.', 409)
    if (m.includes('payment_submissions_reference_idx')) return fail('This transaction reference was already submitted. If it is your payment, contact EboHomes.', 409)
    if (m.includes('corrected') || m.includes('not found') || m.includes('active tenancies')) return fail(m, 409)
    console.error('payment submission failed:', error.code)
    return fail('Could not save your submission. Try again.', 500)
  }
  return NextResponse.json({ ok: true, id: (data as any)?.id, status: (data as any)?.status })
}