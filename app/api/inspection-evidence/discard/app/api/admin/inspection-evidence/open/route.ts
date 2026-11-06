import { NextResponse } from 'next/server'
import { authAdmin } from '@/lib/admin-server'
import { INSPECTION_BUCKET, UUID_RE } from '@/lib/inspection-evidence'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const json = (b: unknown, status = 200) => NextResponse.json(b, { status, headers: { 'Cache-Control': 'no-store' } })

// GET ?file=<evidence file id> -> { url } a 5 minute signed link. Admin only.
// The database function records 'file_opened' (who, which file, when) and refuses an admin who is the inspector.
// Fails closed: if the open cannot be recorded, no link is returned. Accepting a file in review needs this recorded open.
export async function GET(req: Request) {
  const a = await authAdmin(req)
  if ('res' in a) return a.res
  const file = new URL(req.url).searchParams.get('file') ?? ''
  if (!UUID_RE.test(file)) return json({ error: 'Invalid request.' }, 400)

  const { data: path, error } = await a.db.rpc('eb_inspection_log_open', { p_admin: a.user.id, p_file: file })
  if (error || typeof path !== 'string' || !path) {
    if (error?.code === '42501' || error?.code === 'P0002') return json({ error: error.message }, error.code === '42501' ? 403 : 404)
    console.error('inspection evidence open failed:', error?.code)
    return json({ error: 'Could not record this access, so the file was not opened. Try again.' }, 500)
  }
  const { data, error: sErr } = await a.db.storage.from(INSPECTION_BUCKET).createSignedUrl(path, 300)
  if (sErr || !data?.signedUrl) return json({ error: 'Could not open the file.' }, 500)
  return json({ url: data.signedUrl })
}
