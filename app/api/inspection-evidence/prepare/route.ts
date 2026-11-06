import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { INSPECTION_BUCKET, MAX_INSPECTION_FILES_PER_JOB, UUID_RE, inspectionPathFor, validateInspectionFileMeta } from '@/lib/inspection-evidence'
import { authUser, fail } from '@/lib/payment-submission-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST { job_id, request_id?, mime, bytes } -> { path, token }
// Checks the caller is the active inspector assigned to this job and that the job is open for evidence
// (still 'assigned', or an admin asked for more evidence with request_id). Hands back a one-time upload slot in the PRIVATE bucket.
// The database re-checks everything when the file is registered.
export async function POST(req: Request) {
  const a = await authUser(req)
  if ('res' in a) return a.res
  const { db, user } = a
  let body: any
  try { body = await req.json() } catch { return fail('Invalid request.', 400) }
  const jobId = typeof body?.job_id === 'string' ? body.job_id : ''
  const requestId = body?.request_id == null || body.request_id === '' ? null : body.request_id
  if (!UUID_RE.test(jobId) || (requestId !== null && (typeof requestId !== 'string' || !UUID_RE.test(requestId)))) return fail('Invalid request.', 400)
  const bad = validateInspectionFileMeta(body?.mime, body?.bytes)
  if (bad) return fail(bad, 400)

  const { data: insp } = await db.from('inspectors').select('user_id').eq('user_id', user.id).eq('status', 'active').maybeSingle()
  if (!insp) return fail('Only an active inspector can add evidence.', 403)
  const { data: job } = await db.from('inspection_jobs').select('id, inspector_id, status').eq('id', jobId).maybeSingle()
  if (!job || job.inspector_id !== user.id) return fail('This inspection is not assigned to you.', 404)

  if (requestId) {
    const { data: q } = await db.from('inspection_supplement_requests').select('id, job_id, fulfilled_at, cancelled_at').eq('id', requestId).maybeSingle()
    if (!q || q.job_id !== jobId || q.fulfilled_at || q.cancelled_at) return fail('This request for more evidence is not open.', 400)
  } else if (job.status !== 'assigned') {
    return fail('This inspection is not open for evidence.', 400)
  }

  // simple abuse limit: 60 upload slots per inspector per hour
  const since = new Date(Date.now() - 3600_000).toISOString()
  const { count } = await db.from('inspection_evidence_files').select('id', { count: 'exact', head: true }).eq('uploaded_by', user.id).gte('uploaded_at', since)
  if ((count ?? 0) >= 60) return fail('Too many uploads. Please wait an hour or contact EboHomes.', 429)

  // Cap stored files per job (registered or not) so abandoned uploads cannot pile up.
  const { data: stored } = await db.storage.from(INSPECTION_BUCKET).list(`${user.id}/${jobId}`, { limit: MAX_INSPECTION_FILES_PER_JOB + 10 })
  if ((stored?.length ?? 0) >= MAX_INSPECTION_FILES_PER_JOB + 10) return fail('Too many files for this inspection. Please contact EboHomes.', 429)

  const path = inspectionPathFor(user.id, jobId, body.mime, randomUUID())
  const { data, error } = await db.storage.from(INSPECTION_BUCKET).createSignedUploadUrl(path)
  if (error || !data?.token) {
    console.error('inspection upload slot failed:', error?.message)
    return fail('Could not prepare the upload. Try again.', 500)
  }
  return NextResponse.json({ path, token: data.token })
}
