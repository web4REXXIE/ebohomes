import { NextResponse } from 'next/server'
import { authAdmin } from '@/lib/admin-server'
import { ORG_BUCKET } from '@/lib/organization-evidence'
import { UUID_RE } from '@/lib/authority-evidence'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const json = (b: unknown, status = 200) => NextResponse.json(b, { status, headers: { 'Cache-Control': 'no-store' } })

// GET ?id=<document id> | ?org=<organization id>&logo=pending|current -> { url } a 5 minute signed link. Admin only.
// Documents: the database function checks the admin's role, blocks reviewing your own company, and records
// 'document_opened' in the company history. It runs AS the admin. Fails closed: if the open cannot be recorded, no link is returned.
// Logos: admins only, never the company's own creator.
export async function GET(req: Request) {
  const a = await authAdmin(req)
  if ('res' in a) return a.res
  const sp = new URL(req.url).searchParams
  const id = sp.get('id') ?? ''
  const org = sp.get('org') ?? ''
  const logo = sp.get('logo')

  let path: string | null = null
  if (id) {
    if (!UUID_RE.test(id)) return json({ error: 'Invalid request.' }, 400)
    const { data, error } = await a.userDb.rpc('admin_organization_document_path', { p_doc: id })
    if (error || typeof data !== 'string' || !data) {
      if (error?.code === '42501' || error?.code === 'P0002') return json({ error: error.message }, error.code === '42501' ? 403 : 404)
      console.error('organization document open failed:', error?.code)
      return json({ error: 'Could not record this access, so the file was not opened. Try again.' }, 500)
    }
    path = data
  } else if (org && (logo === 'pending' || logo === 'current')) {
    if (!UUID_RE.test(org)) return json({ error: 'Invalid request.' }, 400)
    // admin_organization_detail runs AS the admin: it refuses non-admins. The logo is low-risk and is public once approved.
    const { data: d, error: dErr } = await a.userDb.rpc('admin_organization_detail', { p_id: org })
    if (dErr || !d) return json({ error: 'Not found.' }, 404)
    if ((d as any).is_self) return json({ error: 'You cannot review your own company.' }, 403)
    path = logo === 'pending' ? ((d as any).pending_logo_path ?? null) : ((d as any).logo_path ?? null)
    if (!path) return json({ error: 'Not found.' }, 404)
  } else {
    return json({ error: 'Invalid request.' }, 400)
  }

  const { data, error } = await a.db.storage.from(ORG_BUCKET).createSignedUrl(path, 300)
  if (error || !data?.signedUrl) return json({ error: 'Could not open the file.' }, 500)
  return json({ url: data.signedUrl })
}
