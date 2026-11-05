import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { AUTHORITY_BUCKET, UUID_RE, authorityPathFor, validateAuthorityFileMeta } from '@/lib/authority-evidence'
import { authUser, fail } from '@/lib/payment-submission-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST { listing_id, mime, bytes } -> { path, token }
// Checks the caller is the lister of this listing, then hands back a one-time upload slot in the PRIVATE bucket.
export async function POST(req: Request) {
  const a = await authUser(req)
  if ('res' in a) return a.res
  let body: any
  try { body = await req.json() } catch { return fail('Invalid request.', 400) }
  const listingId = typeof body?.listing_id === 'string' ? body.listing_id : ''
  if (!UUID_RE.test(listingId)) return fail('Invalid request.', 400)
  const bad = validateAuthorityFileMeta(body?.mime, body?.bytes)
  if (bad) return fail(bad, 400)

  const { data: l } = await a.db.from('listings').select('id, landlord_id').eq('id', listingId).maybeSingle()
  if (!l || l.landlord_id !== a.user.id) return fail('Listing not found.', 404)

  const path = authorityPathFor(a.user.id, listingId, body.mime, randomUUID())
  const { data, error } = await a.db.storage.from(AUTHORITY_BUCKET).createSignedUploadUrl(path)
  if (error || !data?.token) {
    console.error('authority upload slot failed:', error?.message)
    return fail('Could not prepare the upload. Try again.', 500)
  }
  return NextResponse.json({ path, token: data.token })
}
