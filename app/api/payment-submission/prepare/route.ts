import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { EVIDENCE_BUCKET, PAYMENT_TYPES, evidencePathFor, validateEvidenceMeta, type SubmissionType } from '@/lib/payment-submission'
import { authUser, fail, loadPayContext } from '@/lib/payment-submission-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST { tenancy_id, payment_type, mime, bytes } -> { path, token }
// Checks the tenant owns the tenancy, then hands back a one-time upload slot at a random path in the PRIVATE bucket.
export async function POST(req: Request) {
  const a = await authUser(req)
  if ('res' in a) return a.res
  let body: any
  try { body = await req.json() } catch { return fail('Invalid request.', 400) }
  if (!(PAYMENT_TYPES as readonly string[]).includes(body?.payment_type)) return fail('Invalid request.', 400)
  const bad = validateEvidenceMeta(body?.mime, body?.bytes)
  if (bad) return fail(bad, 400)
  const ctx = await loadPayContext(a.db, a.user.id, body.tenancy_id, body.payment_type as SubmissionType)
  if ('res' in ctx) return ctx.res

  const path = evidencePathFor(a.user.id, ctx.tenancyId, body.mime, randomUUID())
  const { data, error } = await a.db.storage.from(EVIDENCE_BUCKET).createSignedUploadUrl(path)
  if (error || !data?.token) return fail('Could not prepare the upload. Try again.', 500)
  return NextResponse.json({ path, token: data.token })
}