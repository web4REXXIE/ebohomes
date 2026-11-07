import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import {
  APP_DOC_BUCKET,
  APP_DOC_OPEN_STATUSES,
  appDocPathFor,
  isUuid,
  validateAppDocMeta,
} from '@/lib/application-documents'
import { authUser, fail } from '@/lib/payment-submission-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST { application_id, mime, bytes } -> { path, token }
// Checks the signed-in user is the applicant and the application is open, then returns a one-time upload slot
// at a random path in the PRIVATE bucket.
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
  const bad = validateAppDocMeta(body?.mime, body?.bytes)
  if (bad) return fail(bad, 400)

  const { data: app } = await a.db
    .from('applications')
    .select('id, tenant_id, status')
    .eq('id', body.application_id)
    .maybeSingle()
  if (!app || app.tenant_id !== a.user.id) return fail('Application not found.', 404)
  if (!(APP_DOC_OPEN_STATUSES as readonly string[]).includes(app.status)) {
    return fail('Documents can only be added while your application is open.', 409)
  }

  const path = appDocPathFor(a.user.id, app.id, body.mime, randomUUID())
  const { data, error } = await a.db.storage.from(APP_DOC_BUCKET).createSignedUploadUrl(path)
  if (error || !data?.token) return fail('Could not prepare the upload. Try again.', 500)
  return NextResponse.json({ path, token: data.token })
}
