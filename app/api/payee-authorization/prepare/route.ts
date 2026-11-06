import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { AUTHORITY_BUCKET, UUID_RE } from '@/lib/authority-evidence'
import { MAX_PAYEE_FILES_PER_LISTING, PAYEE_FOLDER, payeePathFor, validatePayeeFileMeta } from '@/lib/payee-authorization'
import { authUser, fail } from '@/lib/payment-submission-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST { listing_id, mime, bytes } -> { path, token }
// Gives the lister of this listing a one-time upload slot in the PRIVATE bucket for a rent-collection authorization.
// This is not property authority evidence and cannot affect authority_status.
export async function POST(req: Request) {
  const a = await authUser(req)
  if ('res' in a) return a.res
  let body: any
  try { body = await req.json() } catch { return fail('Invalid request.', 400) }
  const listingId = typeof body?.listing_id === 'string' ? body.listing_id : ''
  if (!UUID_RE.test(listingId)) return fail('Invalid request.', 400)
  const bad = validatePayeeFileMeta(body?.mime, body?.bytes)
  if (bad) return fail(bad, 400)

  const { data: l } = await a.db.from('listings').select('id, landlord_id, authority_status').eq('id', listingId).maybeSingle()
  if (!l || l.landlord_id !== a.user.id) return fail('Listing not found.', 404)
  if (l.authority_status !== 'accepted') {
    return fail('Rent can only be directed to a representative after EboHomes has accepted your authority for this property.', 400)
  }

  const folder = `${PAYEE_FOLDER}/${a.user.id}/${listingId}`
  const { data: stored } = await a.db.storage.from(AUTHORITY_BUCKET).list(folder, { limit: MAX_PAYEE_FILES_PER_LISTING + 1 })
  if ((stored?.length ?? 0) >= MAX_PAYEE_FILES_PER_LISTING) return fail('Too many files for this listing. Please contact EboHomes.', 429)

  const path = payeePathFor(a.user.id, listingId, body.mime, randomUUID())
  const { data, error } = await a.db.storage.from(AUTHORITY_BUCKET).createSignedUploadUrl(path)
  if (error || !data?.token) {
    console.error('payee upload slot failed:', error?.message)
    return fail('Could not prepare the upload. Try again.', 500)
  }
  return NextResponse.json({ path, token: data.token })
}
