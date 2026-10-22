import { NextResponse } from 'next/server'
import { UUID_RE } from '@/lib/payment-submission'
import { authAdmin } from '@/lib/admin-server'
import { validatePaid, validatePrepare } from '@/lib/payout'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const json = (b: unknown, status = 200) => NextResponse.json(b, { status, headers: { 'Cache-Control': 'no-store' } })
const userFacing = (c?: string) => c === '22023' || c === '42501' || c === 'P0002'

// GET ?filter=candidates|progress|done|all. Runs as the admin; the database re-checks admin status.
export async function GET(req: Request) {
  const a = await authAdmin(req)
  if ('res' in a) return a.res
  const f = new URL(req.url).searchParams.get('filter') ?? 'progress'
  if (f === 'candidates') {
    const { data, error } = await a.userDb.rpc('eb_admin_payout_candidates')
    if (error) return json({ error: 'Could not load the list.' }, 500)
    return json({ items: data ?? [] })
  }
  const filter = ['progress', 'done', 'all'].includes(f) ? f : 'progress'
  const { data, error } = await a.userDb.rpc('eb_admin_payouts', { p_filter: filter })
  if (error) return json({ error: 'Could not load the list.' }, 500)
  return json({ items: data ?? [] })
}

// POST { action: 'prepare' | 'approve' | 'cancel' | 'paid', ... }
export async function POST(req: Request) {
  const a = await authAdmin(req)
  if ('res' in a) return a.res
  let body: any
  try { body = await req.json() } catch { return json({ error: 'Invalid request.' }, 400) }
  const fail = (error: { code?: string; message: string } | null) => {
    if (error && userFacing(error.code)) return json({ error: error.message }, 409)
    console.error('payout action failed:', error?.code)
    return json({ error: 'Could not record this. Nothing was changed.' }, 500)
  }

  if (body?.action === 'prepare') {
    const pid = typeof body.payment_id === 'string' ? body.payment_id : ''
    if (!UUID_RE.test(pid)) return json({ error: 'Invalid request.' }, 400)
    const { data: pay } = await a.db.from('payments').select('amount').eq('id', pid).maybeSingle()
    if (!pay) return json({ error: 'Payment not found.' }, 404)
    const v = validatePrepare({ amount: body.amount, note: body.note, key: body.key }, Number(pay.amount))
    if (!v.ok) return json({ error: v.error }, 400)
    const { data, error } = await a.userDb.rpc('eb_prepare_payout', { p_payment: pid, p_amount: v.amount, p_note: v.note, p_key: body.key })
    if (error) return fail(error)
    return json(data)
  }

  const id = typeof body?.id === 'string' ? body.id : ''
  if (!UUID_RE.test(id)) return json({ error: 'Invalid request.' }, 400)

  if (body.action === 'approve' || body.action === 'cancel') {
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, 1000) : ''
    if (body.action === 'cancel' && note.length < 5) return json({ error: 'Write a reason for cancelling.' }, 400)
    const { data, error } = await a.userDb.rpc('eb_review_payout', { p_id: id, p_action: body.action, p_note: note || null })
    if (error) return fail(error)
    return json(data)
  }

  if (body.action === 'paid') {
    const { data: p } = await a.db.from('landlord_payouts').select('amount').eq('id', id).maybeSingle()
    if (!p) return json({ error: 'Payout not found.' }, 404)
    const v = validatePaid({ reference: body.reference, proof_path: body.proof_path, attest: body.attest }, id, Number(p.amount))
    if (!v.ok) return json({ error: v.error }, 400)
    const { data, error } = await a.userDb.rpc('eb_mark_payout_paid', {
      p_id: id, p_reference: v.reference, p_proof_path: body.proof_path,
      p_attest: { transferred_to_shown_account: true, amount_sent: String(body.attest.amount_sent).replace(/,/g, '') },
    })
    if (error) return fail(error)
    return json(data)
  }

  return json({ error: 'Invalid request.' }, 400)
}