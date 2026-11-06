import { NextResponse } from 'next/server'
import { authAdmin } from '@/lib/admin-server'
import { AUTHORITY_BUCKET, UUID_RE } from '@/lib/authority-evidence'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const json = (b: unknown, status = 200) => NextResponse.json(b, { status, headers: { 'Cache-Control': 'no-store' } })

// GET ?id=<payee request id> -> { url } a 5 minute signed link to the owner's rent-collection authorization. Admin only.
// Every open is written to property_payee_events. Fails closed: if the access cannot be recorded, no link is returned.
// An admin cannot open files for their own request or their own listing.
export async function GET(req: Request) {
  const a = await authAdmin(req)
  if ('res' in a) return a.res
  const id = new URL(req.url).searchParams.get('id') ?? ''
  if (!UUID_RE.test(id)) return json({ error: 'Invalid request.' }, 400)

  const { data: p } = await a.db.from('property_authorized_payees').select('id, listing_id, requested_by, authorization_path').eq('id', id).maybeSingle()
  if (!p) return json({ error: 'Not found.' }, 404)
  const { data: l } = await a.db.from('listings').select('landlord_id').eq('id', p.listing_id).maybeSingle()
  if (!l) return json({ error: 'Not found.' }, 404)
  if (l.landlord_id === a.user.id || p.requested_by === a.user.id) return json({ error: 'You cannot open files for your own request.' }, 403)

  const { data, error } = await a.db.storage.from(AUTHORITY_BUCKET).createSignedUrl(p.authorization_path, 300)
  if (error || !data?.signedUrl) return json({ error: 'Could not open the file.' }, 500)

  const { error: logErr } = await a.db.from('property_payee_events').insert({ payee_id: p.id, listing_id: p.listing_id, event: 'document_opened', actor_id: a.user.id })
  if (logErr) {
    console.error('payee document access log failed:', logErr.code)
    return json({ error: 'Could not record this access, so the file was not opened. Try again.' }, 500)
  }
  return json({ url: data.signedUrl })
}
