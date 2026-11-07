import { NextResponse } from 'next/server'
import {
  APP_DOC_BUCKET,
  isUuid,
  isValidAppDocPath,
  validateAppDocKind,
  validateAppDocMeta,
} from '@/lib/application-documents'
import { authUser, fail } from '@/lib/payment-submission-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST { application_id, kind, label?, path, name?, mime, bytes } -> { id }
// Registers a file the client already uploaded to the slot from /prepare.
// The database function re-checks ownership, status, limits and the path. Nothing here trusts the browser.
export async function POST(req: Request) {
  const a = await authUser(req)
  if ('res' in a) return a.res
  let body: any
  try {
    body = await req.json()
  } catch {
    return fail('Invalid request.', 400)
  }
  if (!isUuid(body?.application_id)) return fail('Invalid request.', 400)
  const k = validateAppDocKind(body?.kind, body?.label)
  if (!k.ok) return fail(k.error, 400)
  const bad = validateAppDocMeta(body?.mime, body?.bytes)
  if (bad) return fail(bad, 400)
  if (!isValidAppDocPath(body?.path, a.user.id, body.application_id)) return fail('Invalid request.', 400)

  // Make sure the file really landed in the bucket before saving a record for it.
  const file = body.path.split('/').pop() as string
  const { data: found } = await a.db.storage
    .from(APP_DOC_BUCKET)
    .list(`${a.user.id}/${body.application_id}`, { search: file, limit: 5 })
  if (!found || !found.some((f) => f.name === file)) return fail('The upload did not finish. Try again.', 409)

  const name =
    typeof body.name === 'string' ? body.name.replace(/[\u0000-\u001f]/g, '').trim().slice(0, 120) || null : null

  const { data, error } = await a.db.rpc('eb_add_application_document', {
    p_user: a.user.id,
    p_application: body.application_id,
    p_kind: k.kind,
    p_label: k.label,
    p_path: body.path,
    p_name: name,
    p_mime: body.mime,
    p_bytes: body.bytes,
  })
  if (error) {
    // The file is useless without a record. Remove it so the private bucket does not collect orphans.
    await a.db.storage.from(APP_DOC_BUCKET).remove([body.path])
    const friendly = error.code === '22023' || error.code === 'P0002'
    return fail(friendly ? error.message : 'Could not save the document. Try again.', friendly ? 409 : 500)
  }
  return NextResponse.json({ id: data })
}
