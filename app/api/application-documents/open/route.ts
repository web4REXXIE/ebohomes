import { NextResponse } from 'next/server'
import { APP_DOC_BUCKET, isUuid } from '@/lib/application-documents'
import { authUser, fail } from '@/lib/payment-submission-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET ?id=<document id> -> { url } a 5 minute signed link.
// Only the tenant who uploaded it (while it is active) or EboHomes staff. Landlords always get 404.
// Every link is logged. For staff, if the log cannot be written, no link is issued.
export async function GET(req: Request) {
  const a = await authUser(req)
  if ('res' in a) return a.res
  const id = new URL(req.url).searchParams.get('id') ?? ''
  if (!isUuid(id)) return fail('Invalid request.', 400)

  const { data: d } = await a.db
    .from('application_documents')
    .select('id, tenant_id, storage_path, status')
    .eq('id', id)
    .maybeSingle()
  if (!d) return fail('Not found.', 404)

  let role: 'tenant' | 'admin'
  if (d.tenant_id === a.user.id) {
    if (d.status !== 'active') return fail('Not found.', 404)
    role = 'tenant'
  } else {
    const { data: p } = await a.db.from('profiles').select('role').eq('id', a.user.id).maybeSingle()
    if (p?.role !== 'admin') return fail('Not found.', 404)
    role = 'admin'
  }

  const log = await a.db
    .from('application_document_access')
    .insert({ document_id: d.id, actor_id: a.user.id, actor_role: role })
  if (log.error && role === 'admin') return fail('Could not open the file. Try again.', 500)

  const { data, error } = await a.db.storage.from(APP_DOC_BUCKET).createSignedUrl(d.storage_path, 300)
  if (error || !data?.signedUrl) return fail('Could not open the file.', 500)
  return NextResponse.json({ url: data.signedUrl })
}
