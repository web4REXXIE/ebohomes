import { NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import {
  INSPECTION_BUCKET, UUID_RE, friendlyInspectionError, isValidInspectionPath, kindForMime, normaliseCaptureMethod,
  sniffInspectionMime, validateInspectionFileMeta,
} from '@/lib/inspection-evidence'
import { authUser, fail } from '@/lib/payment-submission-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

// POST { job_id, request_id?, path, name, capture_method } -> registers an uploaded file as evidence ("staged").
// The server re-checks the file exists, reads its true size, streams it to read its real type from its first bytes and to compute
// a SHA-256 fingerprint. A file that fails any check is removed from storage. Registering a file never makes an inspection pass:
// only an admin decision does, and only after the files are reviewed.
export async function POST(req: Request) {
  const a = await authUser(req)
  if ('res' in a) return a.res
  const { db, user } = a
  let body: any
  try { body = await req.json() } catch { return fail('Invalid request.', 400) }

  const jobId = typeof body?.job_id === 'string' ? body.job_id : ''
  const requestId = body?.request_id == null || body.request_id === '' ? null : body.request_id
  if (!UUID_RE.test(jobId) || (requestId !== null && (typeof requestId !== 'string' || !UUID_RE.test(requestId)))) return fail('Invalid request.', 400)
  if (!isValidInspectionPath(body?.path, user.id, jobId)) return fail('Invalid evidence file.', 400)
  const path = body.path as string
  const remove = async () => { try { await db.storage.from(INSPECTION_BUCKET).remove([path]) } catch { /* best effort */ } }

  const folder = `${user.id}/${jobId}`
  const fileName = path.split('/')[2]
  const { data: files } = await db.storage.from(INSPECTION_BUCKET).list(folder, { limit: 5, search: fileName })
  const file = (files ?? []).find((f: any) => f.name === fileName)
  const mime = (file as any)?.metadata?.mimetype as string | undefined
  const bytes = Number((file as any)?.metadata?.size)
  if (!file || validateInspectionFileMeta(mime, bytes)) { await remove(); return fail('Your file did not upload. Please try again.', 400) }

  // Stream the stored file so a 100MB video is never held in memory.
  const { data: signed, error: sErr } = await db.storage.from(INSPECTION_BUCKET).createSignedUrl(path, 120)
  if (sErr || !signed?.signedUrl) return fail('Could not read your file. Please try again.', 500)
  const res = await fetch(signed.signedUrl)
  if (!res.ok || !res.body) return fail('Could not read your file. Please try again.', 500)
  const hash = createHash('sha256')
  let head = new Uint8Array(0)
  let total = 0
  const reader = res.body.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue
    total += value.length
    if (total > bytes) break
    hash.update(value)
    if (head.length < 16) { const m = new Uint8Array(Math.min(16, head.length + value.length)); m.set(head); m.set(value.subarray(0, m.length - head.length), head.length); head = m }
  }
  if (total !== bytes) { await remove(); return fail('Your file did not upload completely. Please try again.', 400) }
  // The declared type is only a claim. The file's own first bytes must match it.
  if (sniffInspectionMime(head) !== mime) {
    await remove()
    return fail('This file is not a real JPG, PNG, WEBP, MP4 or WEBM file. Please use the camera or choose another file.', 400)
  }
  const sha256 = hash.digest('hex')
  const kind = kindForMime(mime)!
  const original = typeof body.name === 'string' ? body.name.replace(/[\u0000-\u001f]/g, '').slice(0, 200) : null
  const method = normaliseCaptureMethod(body.capture_method)

  const { data, error } = requestId
    ? await db.rpc('eb_inspection_register_supplement_file', { p_user: user.id, p_request: requestId, p_kind: kind, p_path: path, p_name: original, p_mime: mime, p_size: bytes, p_sha256: sha256, p_method: method })
    : await db.rpc('eb_inspection_register_file', { p_user: user.id, p_job: jobId, p_kind: kind, p_path: path, p_name: original, p_mime: mime, p_size: bytes, p_sha256: sha256, p_method: method })
  if (error) {
    console.error('inspection file register failed:', error.code)
    // These codes are the database's own plain refusals. The stored object is removed so nothing is left behind.
    if (['22023', '23505', '42501', 'P0002'].includes(error.code ?? '')) {
      await remove()
      return fail(friendlyInspectionError(error.message, 'Could not save this file. Try again.'), error.code === '42501' ? 403 : 400)
    }
    return fail('Could not save this file. Try again.', 500) // transient: the stored object is kept so a retry can register it
  }
  return NextResponse.json({ ok: true, id: data, kind, sha256_prefix: sha256.slice(0, 8) })
}
