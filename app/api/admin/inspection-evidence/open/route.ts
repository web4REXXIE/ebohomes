import { NextResponse } from 'next/server'
import { authAdmin } from '@/lib/admin-server'
import { INSPECTION_BUCKET, UUID_RE } from '@/lib/inspection-evidence'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const json = (b: unknown, status = 200) => NextResponse.json(b, { status, headers: { 'Cache-Control': 'no-store' } })

// GET ?file=<evidence file id> -> { url } a 5 minute signed link. Admin only.
// The open is recorded first (eb_inspection_log_open). If it cannot be recorded, no link is returned.
// An admin cannot open evidence of their own inspection, or of a remote inspection request they are part of.
export async function GET(req: Request) {
  const a = await authAdmin(req)
  if ('res' in a) return a.res
  const file = new URL(req.url).searchParams.get('file') ?? ''
  if (!UUID_RE.test(file)) return json({ error: 'Invalid request.' }, 400)

  const { data: f } = await a.db.from('inspection_evidence_files').select('id, job_id').eq('id', file).maybeSingle()
  if (!f) return json({ error: 'Not found.' }, 404)
  const { data: job } = await a.db.from('inspection_jobs').select('request_id').eq('id', f.job_id).maybeSingle()
  if (job?.request_id) {
    const { data: q } = await a.db.from('inspection_requests').select('tenant_id, landlord_id').eq('id', job.request_id).maybeSingle()
    if (q && (q.tenant_id === a.user.id || q.landlord_id === a.user.id)) {
      return json({ error: 'You cannot open evidence for a request you are involved in.' }, 403)
    }
  }

  const { data: path, error } = await a.db.rpc('eb_inspection_log_open', { p_admin: a.user.id, p_file: file })
  if (error || typeof path !== 'string' || !path) {
    const own = /own inspection/i.test(error?.message ?? '')
    return json({ error: own ? 'You cannot open evidence of your own inspection.' : 'Could not record this access, so the file was not opened. Try again.' }, own ? 403 : 500)
  }
  const { data, error: sErr } = await a.db.storage.from(INSPECTION_BUCKET).createSignedUrl(path, 300)
  if (sErr || !data?.signedUrl) return json({ error: 'Could not open the file.' }, 500)
  return json({ url: data.signedUrl })
}
