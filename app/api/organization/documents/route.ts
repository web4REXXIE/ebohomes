import { NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { sniffAuthorityMime } from '@/lib/authority-evidence'
import { ORG_BUCKET, friendlyOrgError, isOrgDocType, isValidOrgPath, orgFolderFor, validateOrgFileMeta, validateOrgLogoMeta } from '@/lib/organization-evidence'
import { authUser, fail } from '@/lib/payment-submission-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST { kind: 'document' | 'logo', path, name, doc_type? } -> registers an uploaded file for the caller's OWN company.
// The server re-checks the file really exists, reads its true type and size, and records a SHA-256 fingerprint.
// Registering a file never verifies a company: only an administrator decision does.
// A new logo on an approved company waits for admin review. The approved logo stays live until then.
export async function POST(req: Request) {
  const a = await authUser(req)
  if ('res' in a) return a.res
  const { db, user } = a
  let body: any
  try { body = await req.json() } catch { return fail('Invalid request.', 400) }

  const kind = body?.kind === 'logo' ? 'logo' : body?.kind === 'document' ? 'document' : null
  if (!kind) return fail('Invalid request.', 400)
  if (kind === 'document' && !isOrgDocType(body?.doc_type)) return fail('Choose what kind of document this is.', 400)

  const { data: o } = await db.from('organizations').select('id, created_by, status').eq('created_by', user.id).maybeSingle()
  if (!o) return fail('Company not found.', 404)
  if (!isValidOrgPath(body?.path, user.id, o.id, kind)) return fail('Invalid file.', 400)

  // simple abuse limit: 20 registrations per account per hour
  const since = new Date(Date.now() - 3600_000).toISOString()
  const { count } = await db.from('organization_documents').select('id', { count: 'exact', head: true }).eq('uploaded_by', user.id).gte('uploaded_at', since)
  if ((count ?? 0) >= 20) return fail('Too many uploads. Please wait an hour or contact EboHomes.', 429)

  const path = body.path as string
  const fileName = path.split('/')[3]
  const { data: files } = await db.storage.from(ORG_BUCKET).list(orgFolderFor(user.id, o.id), { limit: 5, search: fileName })
  const file = (files ?? []).find((f: any) => f.name === fileName)
  const mime = (file as any)?.metadata?.mimetype as string | undefined
  const bytes = Number((file as any)?.metadata?.size)
  const metaProblem = kind === 'logo' ? validateOrgLogoMeta(mime, bytes) : validateOrgFileMeta(mime, bytes)
  if (!file || metaProblem) return fail('Your file did not upload. Please try again.', 400)

  const { data: blob, error: dlErr } = await db.storage.from(ORG_BUCKET).download(path)
  if (dlErr || !blob) return fail('Could not read your file. Please try again.', 500)
  const buf = Buffer.from(await blob.arrayBuffer())
  // The declared type is only a claim. The file's own first bytes must match it.
  if (sniffAuthorityMime(buf) !== mime) {
    return fail(kind === 'logo' ? 'This is not a real JPG, PNG or WEBP image.' : 'This file is not a real JPG, PNG, WEBP or PDF. Please upload a clear photo or PDF.', 400)
  }

  if (kind === 'logo') {
    const { data, error } = await db.rpc('eb_organization_set_logo', { p_org: o.id, p_uploader: user.id, p_path: path })
    if (error) {
      console.error('organization logo register failed:', error.code)
      if (error.code === '22023' || error.code === 'P0002') return fail(friendlyOrgError(error.message, 'Could not save your logo. Try again.'), 400)
      return fail('Could not save your logo. Try again.', 500)
    }
    return NextResponse.json({ ok: true, pending: Boolean((data as any)?.pending) })
  }

  const sha256 = createHash('sha256').update(buf).digest('hex')
  const original = typeof body.name === 'string' ? body.name.replace(/[\u0000-\u001f]/g, '').slice(0, 200) : null
  const { data, error } = await db.rpc('eb_organization_add_document', {
    p_org: o.id, p_uploader: user.id, p_doc_type: body.doc_type, p_path: path,
    p_name: original, p_mime: mime, p_size: bytes, p_sha256: sha256,
  })
  if (error) {
    console.error('organization document register failed:', error.code)
    if (error.code === '22023' || error.code === 'P0002') return fail(friendlyOrgError(error.message, 'Could not save your document. Try again.'), 400)
    return fail('Could not save your document. Try again.', 500)
  }
  return NextResponse.json({ ok: true, id: data })
    }
