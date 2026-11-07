import { NextResponse } from 'next/server'
import { INSPECTION_BUCKET, UUID_RE } from '@/lib/inspection-evidence'
import { authUser, fail } from '@/lib/payment-submission-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET ?file=<evidence file id> -> { url } a 5 minute signed link.
// Only the tenant who asked for the inspection, only after an admin released the report, only for accepted files.
// Anything else gets the same "not found", so nobody can probe for files.
export async function GET(req: Request) {
  const a = await authUser(req)
  if ('res' in a) return a.res
  const file = new URL(req.url).searchParams.get('file') ?? ''
  if (!UUID_RE.test(file)) return fail('Not found.', 404)

  const { data: path, error } = await a.db.rpc('eb_remote_report_file_path', { p_uid: a.user.id, p_file: file })
  if (error || typeof path !== 'string' || !path) return fail('Not found.', 404)

  const { data, error: sErr } = await a.db.storage.from(INSPECTION_BUCKET).createSignedUrl(path, 300)
  if (sErr || !data?.signedUrl) return fail('Could not open the file.', 500)
  return NextResponse.json({ url: data.signedUrl }, { headers: { 'Cache-Control': 'no-store' } })
}
