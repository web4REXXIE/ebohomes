import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { UUID_RE } from '@/lib/payment-submission'
import { authAdmin } from '@/lib/admin-server'
import { PROOF_BUCKET, validateProofMeta } from '@/lib/payout'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' }
const json = (b: unknown, status = 200) => NextResponse.json(b, { status, headers: { 'Cache-Control': 'no-store' } })

// POST { id, mime, bytes } -> one-time upload slot for the proof of transfer. Only for an APPROVED payout.
export async function POST(req: Request) {
  const a = await authAdmin(req)
  if ('res' in a) return a.res
  let body: any
  try { body = await req.json() } catch { return json({ error: 'Invalid request.' }, 400) }
  const id = typeof body?.id === 'string' ? body.id : ''
  if (!UUID_RE.test(id)) return json({ error: 'Invalid request.' }, 400)
  const bad = validateProofMeta(body.mime, body.bytes)
  if (bad) return json({ error: bad }, 400)

  const { data: p } = await a.db.from('landlord_payouts').select('status').eq('id', id).maybeSingle()
  if (!p) return json({ error: 'Payout not found.' }, 404)
  if (p.status !== 'approved') return json({ error: 'Proof can only be uploaded for an approved payout.' }, 409)

  const path = `payouts/${id}/${randomUUID()}.${EXT[body.mime as string]}`
  const { data, error } = await a.db.storage.from(PROOF_BUCKET).createSignedUploadUrl(path)
  if (error || !data?.token) { console.error('proof slot failed'); return json({ error: 'Could not prepare the upload.' }, 500) }
  return json({ path, token: data.token })
}