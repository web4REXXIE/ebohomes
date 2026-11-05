import { NextResponse } from 'next/server'
import { authAdmin } from '@/lib/admin-server'
import { AUTHORITY_BUCKET, UUID_RE } from '@/lib/authority-evidence'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const json = (b: unknown, status = 200) => NextResponse.json(b, { status, headers: { 'Cache-Control': 'no-store' } })

// GET ?id=<document id> -> { url } a 5 minute signed link. Admin only.
// Every open is recorded in listing_document_reviews as 'opened' (an access log). Opening is NOT a review.
export async function GET(req: Request) {
  const a = await authAdmin(req)
  if ('res' in a) return a.res
  const id = new URL(req.url).searchParams.get('id') ?? ''
  if (!UUID_RE.test(id)) return json({ error: 'Invalid request.' }, 400)

  const { data: d } = await a.db.from('listing_authority_documents').select('id, listing_id, storage_path').eq('id', id).maybeSingle()
  if (!d) return json({ error: 'Not found.' }, 404)

  const { data, error } = await a.db.storage.from(AUTHORITY_BUCKET).createSignedUrl(d.storage_path, 300)
  if (error || !data?.signedUrl) return json({ error: 'Could not open the file.' }, 500)

  await a.db.from('listing_document_reviews').insert({ document_id: d.id, listing_id: d.listing_id, reviewer_id: a.user.id, outcome: 'opened' })
  return json({ url: data.signedUrl })
}
