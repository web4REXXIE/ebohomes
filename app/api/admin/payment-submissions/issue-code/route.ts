import { NextResponse } from 'next/server'
import { UUID_RE } from '@/lib/payment-submission'
import { CODE_ALPHABET, CODE_LENGTH, formatCode } from '@/lib/confirmation-code'
import { generateCode, hashCode, readSecret } from '@/lib/confirmation-crypto'
import { sendCodeEmail } from '@/lib/confirmation-server'
import { authAdmin } from '@/lib/admin-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const json = (b: unknown, status = 200) => NextResponse.json(b, { status, headers: { 'Cache-Control': 'no-store' } })
const userFacing = (c?: string) => c === '22023' || c === '42501' || c === 'P0002'

export async function POST(req: Request) {
  const a = await authAdmin(req)
  if ('res' in a) return a.res

  let body: any
  try { body = await req.json() } catch { return json({ error: 'Invalid request.' }, 400) }
  const id = typeof body?.id === 'string' ? body.id : ''
  if (!UUID_RE.test(id)) return json({ error: 'Invalid request.' }, 400)

  const secret = readSecret()
  if (!secret) {
    console.error('issue-code: CONFIRMATION_CODE_SECRET is missing or too short')
    return json({ error: 'Confirmation codes are not set up on the server yet.' }, 503)
  }

  const { data: sub } = await a.db.from('payment_submissions').select('tenant_id, tenancy_id').eq('id', id).maybeSingle()
  if (!sub) return json({ error: 'Submission not found.' }, 404)
  const { data: tenancy } = await a.db.from('tenancies').select('listing_id').eq('id', sub.tenancy_id).maybeSingle()
  const { data: listing } = tenancy?.listing_id
    ? await a.db.from('listings').select('title').eq('id', tenancy.listing_id).maybeSingle()
    : { data: null }
  const { data: tenantAuth } = await a.db.auth.admin.getUserById(sub.tenant_id)
  const email = tenantAuth?.user?.email ?? ''

  const code = generateCode(CODE_ALPHABET, CODE_LENGTH)
  const { data: issued, error } = await a.userDb.rpc('eb_issue_confirmation_code', {
    p_submission: id,
    p_hash: hashCode(secret, id, code),
  })
  if (error) {
    if (userFacing(error.code)) return json({ error: error.message }, 409)
    console.error('issue-code failed:', error.code)
    return json({ error: 'Could not create the code. Nothing was changed.' }, 500)
  }
  const codeId = (issued as { code_id?: string } | null)?.code_id
  if (!codeId) return json({ error: 'Could not create the code. Nothing was changed.' }, 500)

  const outcome = email
    ? await sendCodeEmail(email, formatCode(code), listing?.title ?? 'your EboHomes property')
    : { status: 'failed' as const, detail: 'This tenant has no email address on their account.' }
  const sent = outcome.status === 'sent'

  const { error: markError } = await a.userDb.rpc('eb_mark_code_delivery', { p_code: codeId, p_status: sent ? 'sent' : 'failed' })
  if (markError) console.error('issue-code: could not record delivery:', markError.code)

  if (!sent) {
    return json({
      error: outcome.status === 'not_configured'
        ? 'The code was created but email sending is not set up on the server, so it was not delivered. Add the email settings in Vercel, redeploy, wait two minutes, then send a new code.'
        : `The code was created but the email could not be sent. ${outcome.detail ?? ''} Fix that, wait two minutes, then send a new code.`.replace(/\s+/g, ' '),
    }, 502)
  }
  return json({ ok: true, delivery: 'sent', expires_at: (issued as { expires_at?: string }).expires_at ?? null })
}