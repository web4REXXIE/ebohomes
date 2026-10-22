import { NextResponse } from 'next/server'
import { EVIDENCE_BUCKET, UUID_RE } from '@/lib/payment-submission'
import { authUser, fail } from '@/lib/payment-submission-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET ?id=<submission id> -> { url } a 5 minute signed link. Only the tenant who submitted it, or an admin.
export async function GET(req: Request) {
  const a = await authUser(req)
  if ('res' in a) return a.res
  const id = new URL(req.url).searchParams.get('id') ?? ''
  if (!UUID_RE.test(id)) return fail('Invalid request.', 400)
  const { data: s } = await a.db.from('payment_submissions').select('tenant_id, evidence_path').eq('id', id).maybeSingle()
  if (!s) return fail('Not found.', 404)
  if (s.tenant_id !== a.user.id) {
    const { data: p } = await a.db.from('profiles').select('role').eq('id', a.user.id).maybeSingle()
    if (p?.role !== 'admin') return fail('Not found.', 404)
  }
  const { data, error } = await a.db.storage.from(EVIDENCE_BUCKET).createSignedUrl(s.evidence_path, 300)
  if (error || !data?.signedUrl) return fail('Could not open the file.', 500)
  return NextResponse.json({ url: data.signedUrl })
}