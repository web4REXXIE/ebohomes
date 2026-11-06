import { NextResponse } from 'next/server'
import { UUID_RE } from '@/lib/authority-evidence'
import { authAdmin } from '@/lib/admin-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const json = (b: unknown, status = 200) => NextResponse.json(b, { status, headers: { 'Cache-Control': 'no-store' } })
const userFacing = (c?: string) => c === '22023' || c === '42501' || c === 'P0002'

// GET ?filter=pending|scheduled|all. Runs AS the admin; the database re-checks admin status.
export async function GET(req: Request) {
  const a = await authAdmin(req)
  if ('res' in a) return a.res
  const f = new URL(req.url).searchParams.get('filter') ?? 'pending'
  const filter = ['pending', 'scheduled', 'all'].includes(f) ? f : 'pending'
  const { data, error } = await a.userDb.rpc('admin_property_payee_queue', { p_filter: filter })
  if (error) return json({ error: 'Could not load the queue.' }, 500)
  // The storage path is never sent to the browser. Files are opened through the logged document route.
  const items = ((data as any[]) ?? []).map(({ authorization_path, ...rest }) => rest)
  return json({ items })
}

// POST { id, action: 'approve'|'reject'|'revoke', note?, attest? }
export async function POST(req: Request) {
  const a = await authAdmin(req)
  if ('res' in a) return a.res
  let body: any
  try { body = await req.json() } catch { return json({ error: 'Invalid request.' }, 400) }
  const id = typeof body?.id === 'string' ? body.id : ''
  if (!UUID_RE.test(id)) return json({ error: 'Invalid request.' }, 400)
  if (!['approve', 'reject', 'revoke'].includes(body.action)) return json({ error: 'Invalid request.' }, 400)
  const note = typeof body.note === 'string' ? body.note.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 1000) : ''

  const { data, error } = body.action === 'revoke'
    ? await a.userDb.rpc('admin_revoke_property_payee', { p_id: id, p_reason: note })
    : await a.userDb.rpc('admin_review_property_payee', {
        p_id: id, p_action: body.action, p_note: note || null,
        p_attest: body.action === 'approve'
          ? { identity_matches: body.attest?.identity_matches === true, owner_confirmed: body.attest?.owner_confirmed === true }
          : null,
      })
  if (error) {
    if (userFacing(error.code)) return json({ error: error.message }, 409)
    console.error('payee review failed:', error.code)
    return json({ error: 'Could not record the decision. Nothing was changed.' }, 500)
  }
  return json(data)
}
