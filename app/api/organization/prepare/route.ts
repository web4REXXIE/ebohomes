import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { MAX_ORG_FILES, ORG_BUCKET, orgFolderFor, orgPathFor, validateOrgFileMeta, validateOrgLogoMeta } from '@/lib/organization-evidence'
import { authUser, fail } from '@/lib/payment-submission-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST { kind: 'document' | 'logo', mime, bytes } -> { organization_id, path, token }
// Finds the caller's OWN company (one per account) and hands back a one-time upload slot in the PRIVATE bucket.
// The company is never taken from the request, so nobody can upload into someone else's folder.
// A slot proves nothing about the company. Only an administrator decision does.
export async function POST(req: Request) {
  const a = await authUser(req)
  if ('res' in a) return a.res
  let body: any
  try { body = await req.json() } catch { return fail('Invalid request.', 400) }
  const kind = body?.kind === 'logo' ? 'logo' : body?.kind === 'document' ? 'document' : null
  if (!kind) return fail('Invalid request.', 400)
  const bad = kind === 'logo' ? validateOrgLogoMeta(body?.mime, body?.bytes) : validateOrgFileMeta(body?.mime, body?.bytes)
  if (bad) return fail(bad, 400)

  const { data: o } = await a.db.from('organizations').select('id, created_by, status').eq('created_by', a.user.id).maybeSingle()
  if (!o) return fail('Create your company profile first, then add files.', 404)
  // Same rule the database enforces when the file is registered. Checked here so no orphan file is uploaded.
  if (o.status === 'pending_review' || o.status === 'suspended') {
    return fail('You cannot add files while EboHomes has this company.', 409)
  }

  // Cap stored files per company (registered or not) so abandoned uploads cannot pile up.
  const { data: stored } = await a.db.storage.from(ORG_BUCKET).list(orgFolderFor(a.user.id, o.id), { limit: MAX_ORG_FILES + 1 })
  if ((stored?.length ?? 0) >= MAX_ORG_FILES) return fail('Too many files for this company. Please contact EboHomes.', 429)

  const path = orgPathFor(a.user.id, o.id, body.mime, randomUUID(), kind)
  const { data, error } = await a.db.storage.from(ORG_BUCKET).createSignedUploadUrl(path)
  if (error || !data?.token) {
    console.error('organization upload slot failed:', error?.message)
    return fail('Could not prepare the upload. Try again.', 500)
  }
  return NextResponse.json({ organization_id: o.id, path, token: data.token })
}
