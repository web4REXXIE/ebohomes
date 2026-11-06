import { NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { AUTHORITY_BUCKET, UUID_RE, sniffAuthorityMime } from '@/lib/authority-evidence'
import { PAYEE_FOLDER, friendlyPayeeError, isValidPayeePath, validatePayeeFileMeta, validatePayeeInput } from '@/lib/payee-authorization'
import { authUser, fail } from '@/lib/payment-submission-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST { listing_id, payee_kind, payee_name, bank_name, account_number, account_name, path, name }
// Registers the uploaded authorization and files a rent-payee REQUEST. Nothing is approved here and no money moves:
// an administrator must approve it, and no payout function reads this data yet.
export async function POST(req: Request) {
  const a = await authUser(req)
  if ('res' in a) return a.res
  const { db, user } = a
  let body: any
  try { body = await req.json() } catch { return fail('Invalid request.', 400) }

  const listingId = typeof body?.listing_id === 'string' ? body.listing_id : ''
  if (!UUID_RE.test(listingId)) return fail('Invalid request.', 400)
  if (!isValidPayeePath(body?.path, user.id, listingId)) return fail('Invalid authorization file.', 400)
  const v = validatePayeeInput(body)
  if (!v.ok) return fail(Object.values(v.errors)[0], 400, { errors: v.errors })

  const { data: l } = await db.from('listings').select('id, landlord_id').eq('id', listingId).maybeSingle()
  if (!l || l.landlord_id !== user.id) return fail('Listing not found.', 404)

  const path = body.path as string
  const folder = `${PAYEE_FOLDER}/${user.id}/${listingId}`
  const fileName = path.split('/')[3]
  const { data: files } = await db.storage.from(AUTHORITY_BUCKET).list(folder, { limit: 5, search: fileName })
  const file = (files ?? []).find((f: any) => f.name === fileName)
  const mime = (file as any)?.metadata?.mimetype as string | undefined
  const bytes = Number((file as any)?.metadata?.size)
  if (!file || validatePayeeFileMeta(mime, bytes)) return fail('Your file did not upload. Please try again.', 400)

  const { data: blob, error: dlErr } = await db.storage.from(AUTHORITY_BUCKET).download(path)
  if (dlErr || !blob) return fail('Could not read your file. Please try again.', 500)
  const buf = Buffer.from(await blob.arrayBuffer())
  // The declared type is only a claim. The file's own first bytes must match it.
  if (sniffAuthorityMime(buf) !== mime) return fail('This file is not a real JPG, PNG, WEBP or PDF. Please upload a clear photo or PDF.', 400)
  const sha256 = createHash('sha256').update(buf).digest('hex')

  const original = typeof body.name === 'string' ? body.name.replace(/[\u0000-\u001f]/g, '').slice(0, 200) : null
  const { data, error } = await db.rpc('eb_request_property_payee', {
    p_listing: listingId, p_requester: user.id, p_kind: v.value.payee_kind, p_payee_name: v.value.payee_name,
    p_bank: v.value.bank_name, p_number: v.value.account_number, p_account_name: v.value.account_name,
    p_path: path, p_doc_name: original, p_mime: mime, p_size: bytes, p_sha256: sha256,
  })
  if (error) {
    console.error('payee request failed:', error.code)
    // The upload is not referenced by any request, so it is removed. A new attempt uploads again.
    try { await db.storage.from(AUTHORITY_BUCKET).remove([path]) } catch {}
    if (error.code === '22023' || error.code === 'P0002' || error.code === '42501') {
      return fail(friendlyPayeeError(error.message, 'Could not send your request. Try again.'), 400)
    }
    return fail('Could not send your request. Try again.', 500)
  }
  return NextResponse.json({ ok: true, id: (data as any)?.id ?? null })
}
