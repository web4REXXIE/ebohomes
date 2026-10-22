import { NextResponse } from 'next/server'
import { UUID_RE } from '@/lib/payment-submission'
import { validatePayoutAccount } from '@/lib/payout-account'
import { authUser } from '@/lib/user-auth-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const json = (b: unknown, status = 200) => NextResponse.json(b, { status, headers: { 'Cache-Control': 'no-store' } })
const userFacing = (c?: string) => c === '22023' || c === '42501' || c === 'P0002'

// GET -> the landlord's own accounts (masked). Never returns a full account number.
export async function GET(req: Request) {
  const u = await authUser(req)
  if (!u) return json({ error: 'Sign in first.' }, 401)
  const { data, error } = await u.db.rpc('eb_my_payout_accounts')
  if (error || !data?.found) return json({ error: 'Could not load your payout account.' }, 500)
  return json(data)
}

// POST { action: 'request', bank_name, account_number, account_name } | { action: 'cancel', id }
export async function POST(req: Request) {
  const u = await authUser(req)
  if (!u) return json({ error: 'Sign in first.' }, 401)
  let body: any
  try { body = await req.json() } catch { return json({ error: 'Invalid request.' }, 400) }

  if (body?.action === 'cancel') {
    const id = typeof body.id === 'string' ? body.id : ''
    if (!UUID_RE.test(id)) return json({ error: 'Invalid request.' }, 400)
    const { error } = await u.db.rpc('eb_cancel_payout_request', { p_id: id })
    if (error) return userFacing(error.code) ? json({ error: error.message }, 409) : json({ error: 'Could not cancel. Try again.' }, 500)
    return json({ ok: true })
  }

  if (body?.action !== 'request') return json({ error: 'Invalid request.' }, 400)
  const v = validatePayoutAccount(body)
  if (!v.ok) return json({ error: 'Check the highlighted fields.', fields: v.errors }, 400)
  const { data, error } = await u.db.rpc('eb_request_payout_account', {
    p_bank: v.value.bank_name, p_number: v.value.account_number, p_name: v.value.account_name,
  })
  if (error) {
    if (userFacing(error.code)) return json({ error: error.message }, 409)
    console.error('payout request failed:', error.code)
    return json({ error: 'Could not send your request. Nothing was changed.' }, 500)
  }
  return json({ ok: true, id: data?.id ?? null })
}