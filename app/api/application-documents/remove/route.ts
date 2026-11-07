import { NextResponse } from 'next/server'
import { isUuid } from '@/lib/application-documents'
import { authUser, fail } from '@/lib/payment-submission-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST { id } -> { ok: true }
// Hides the document from the application. The file and the record stay for the audit trail.
export async function POST(req: Request) {
  const a = await authUser(req)
  if ('res' in a) return a.res
  let body: any
  try {
    body = await req.json()
  } catch {
    return fail('Invalid request.', 400)
  }
  if (!isUuid(body?.id)) return fail('Invalid request.', 400)
  const { error } = await a.db.rpc('eb_remove_application_document', { p_user: a.user.id, p_document: body.id })
  if (error) {
    const friendly = error.code === '22023' || error.code === 'P0002'
    return fail(friendly ? error.message : 'Could not remove the document. Try again.', friendly ? 409 : 500)
  }
  return NextResponse.json({ ok: true })
}
