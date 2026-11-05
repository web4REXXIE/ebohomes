import { NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { AUTHORITY_BUCKET, UUID_RE, isAuthorityDocType, isValidAuthorityPath, validateAuthorityFileMeta } from '@/lib/authority-evidence'
import { authUser, fail } from '@/lib/payment-submission-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST { listing_id, doc_type, path, name } -> registers an uploaded file as evidence.
// The server re-checks the file really exists, reads its true type and size, and records a SHA-256 fingerprint.
// Registering a document never makes a listing "authority reviewed": only an admin decision does.
export async function POST(req: Request) {
  const a = await authUser(req)
  if ('res' in a) return a.res
  const { db, user } = a
  let body: any
  try { body = await req.json() } catch { return fail('Invalid request.', 400) }

  const listingId = typeof body?.listing_id === 'string' ? body.listing_id : ''
  if (!UUID_RE.test(listingId)) return fail('Invalid request.', 400)
  if (!isAuthorityDocType(body?.doc_type)) return fail('Choose what kind of document this is.', 400)
  if (!isValidAuthorityPath(body?.path, user.id, listingId)) return fail('Invalid evidence file.', 400)

  const { data: l } = await db.from('listings').select('id, landlord_id').eq('id', listingId).maybeSingle()
  if (!l || l.landlord_id !== user.id) return fail('Listing not found.', 404)

  // simple abuse limit: 20 documents per lister per hour
  const since = new Date(Date.now() - 3600_000).toISOString()
  const { count } = await db.from('listing_authority_documents').select('id', { count: 'exact', head: true }).eq('uploaded_by', user.id).gte('uploaded_at', since)
  if ((count ?? 0) >= 20) return fail('Too many uploads. Please wait an hour or contact EboHomes.', 429)

  const path = body.path as string
  const folder = `${user.id}/${listingId}`
  const fileName = path.split('/')[2]
  const { data: files } = await db.storage.from(AUTHORITY_BUCKET).list(folder, { limit: 5, search: fileName })
  const file = (files ?? []).find((f: any) => f.name === fileName)
  const mime = (file as any)?.metadata?.mimetype as string | undefined
  const bytes = Number((file as any)?.metadata?.size)
  if (!file || validateAuthorityFileMeta(mime, bytes)) return fail('Your file did not upload. Please try again.', 400)

  const { data: blob, error: dlErr } = await db.storage.from(AUTHORITY_BUCKET).download(path)
  if (dlErr || !blob) return fail('Could not read your file. Please try again.', 500)
  const sha256 = createHash('sha256').update(Buffer.from(await blob.arrayBuffer())).digest('hex')

  const original = typeof body.name === 'string' ? body.name.replace(/[\u0000-\u001f]/g, '').slice(0, 200) : null
  const { data, error } = await db.rpc('eb_authority_add_document', {
    p_listing: listingId, p_uploader: user.id, p_doc_type: body.doc_type, p_path: path,
    p_name: original, p_mime: mime, p_size: bytes, p_sha256: sha256,
  })
  if (error) {
    console.error('authority document register failed:', error.code)
    return fail('Could not save your document. Try again.', 500)
  }
  return NextResponse.json({ ok: true, id: data })
}
