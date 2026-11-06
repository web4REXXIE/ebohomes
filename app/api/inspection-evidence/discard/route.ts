import { NextResponse } from 'next/server'
import { INSPECTION_BUCKET, UUID_RE, friendlyInspectionError } from '@/lib/inspection-evidence'
import { authUser, fail } from '@/lib/payment-submission-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST { file_id } -> removes a file that was never submitted (wrong photo, failed attempt).
// The database refuses once a file belongs to a submitted inspection. The record stays; only the stored object is removed.
export async function POST(req: Request) {
  const a = await authUser(req)
  if ('res' in a) return a.res
  const { db, user } = a
  let body: any
  try { body = await req.json() } catch { return fail('Invalid request.', 400) }
  const fileId = typeof body?.file_id === 'string' ? body.file_id : ''
  if (!UUID_RE.test(fileId)) return fail('Invalid request.', 400)

  const { data: path, error } = await db.rpc('eb_inspection_discard_file', { p_user: user.id, p_file: fileId })
  if (error) {
    if (error.code === '42501' || error.code === 'P0002') return fail(friendlyInspectionError(error.message, 'File not found.'), error.code === '42501' ? 403 : 404)
    console.error('inspection file discard failed:', error.code)
    return fail('Could not remove this file. Try again.', 500)
  }
  if (typeof path === 'string' && path) { try { await db.storage.from(INSPECTION_BUCKET).remove([path]) } catch { /* the record is already marked discarded */ } }
  return NextResponse.json({ ok: true })
}
