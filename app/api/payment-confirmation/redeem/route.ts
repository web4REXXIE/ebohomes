import { NextResponse } from 'next/server'
import { UUID_RE } from '@/lib/payment-submission'
import { isWellFormedCode, normalizeCode } from '@/lib/confirmation-code'
import { hashCode, readSecret } from '@/lib/confirmation-crypto'
import { authTenant } from '@/lib/confirmation-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const json = (b: unknown, status = 200) => NextResponse.json(b, { status, headers: { 'Cache-Control': 'no-store' } })

export async function POST(req: Request) {
  const a = await authTenant(req)
  if (!a) return json({ error: 'Sign in first.' }, 401)

  let body: any
  try { body = await req.json() } catch { return json({ error: 'Invalid request.' }, 400) }
  const submissionId = typeof body?.submission_id === 'string' ? body.submission_id : ''
  if (!UUID_RE.test(submissionId)) return json({ error: 'Invalid request.' }, 400)

  const code = normalizeCode(body?.code)
  if (!isWellFormedCode(code)) return json({ ok: false, reason: 'invalid' }, 400)

  const secret = readSecret()
  if (!secret) {
    console.error('redeem: CONFIRMATION_CODE_SECRET is missing or too short')
    return json({ error: 'Confirmation is not available right now. Please contact EboHomes support.' }, 503)
  }

  const { data, error } = await a.db.rpc('eb_redeem_confirmation_code', {
    p_submission: submissionId,
    p_hash: hashCode(secret, submissionId, code),
  })
  if (error) {
    console.error('redeem failed:', error.code)
    return json({ error: 'Could not check the code. Please try again.' }, 500)
  }
  return json(data)
}