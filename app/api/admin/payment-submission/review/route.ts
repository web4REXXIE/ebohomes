import { NextResponse } from 'next/server'
import { UUID_RE } from '@/lib/payment-submission'
import { validateReview } from '@/lib/payment-review'
import { authAdmin } from '@/lib/admin-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST { id, action, note?, attest? }. Validates, then calls eb_review_submission AS the admin.
// The database function is the real gate: it re-checks admin status, locks the row and records the event.
export async function POST(req: Request) {
  const a = await authAdmin(req)
  if ('res' in a) return a.res
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }) }
  const id = typeof body?.id === 'string' ? body.id : ''
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })

  const { data: s } = await a.db.from('payment_submissions').select('amount_paid, expected_amount, transaction_reference').eq('id', id).maybeSingle()
  if (!s) return NextResponse.json({ error: 'Submission not found.' }, { status: 404 })
  const v = validateReview(body.action, body.note, body.attest, { amount_paid: Number(s.amount_paid), expected_amount: s.expected_amount == null ? null : Number(s.expected_amount), transaction_reference: s.transaction_reference })
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })

  const att = body.action === 'verify' ? {
    checked_bank_account: body.attest.checked_bank_account === true,
    correct_tenant_and_property: body.attest.correct_tenant_and_property === true,
    amount_received: String(body.attest.amount_received).replace(/,/g, ''),
    bank_reference: String(body.attest.bank_reference).trim(),
    mismatch_acknowledged: body.attest.mismatch_acknowledged === true,
  } : null

  const { data, error } = await a.userDb.rpc('eb_review_submission', { p_id: id, p_action: body.action, p_note: v.note, p_attest: att })
  if (error) {
    const known = ['already', 'cannot review', 'must confirm', 'does not match', 'Acknowledge', 'clear message', 'guard did not', 'Enter the amount']
    if (known.some((k) => (error.message ?? '').includes(k))) return NextResponse.json({ error: error.message }, { status: 409 })
    console.error('review failed:', error.code)
    return NextResponse.json({ error: 'Could not record the decision. Nothing was changed.' }, { status: 500 })
  }
  return NextResponse.json(data)
}