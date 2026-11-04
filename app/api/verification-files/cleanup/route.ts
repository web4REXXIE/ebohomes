import { NextResponse } from 'next/server'
import { authUser } from '@/lib/user-auth-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { orphanedIdentityFiles } from '@/lib/verification-files'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUCKET = 'ownership-docs'
const json = (b: unknown, status = 200) => NextResponse.json(b, { status, headers: { 'Cache-Control': 'no-store' } })

// POST -> deletes the signed-in user's OWN old identity uploads (ID photo, selfie, ownership
// document) that their profile no longer points to. Files newer than 6 hours are kept so an
// upload in progress is never removed.
export async function POST(req: Request) {
  const u = await authUser(req)
  if (!u) return json({ error: 'Sign in first.' }, 401)

  const { data: p, error } = await u.db
    .from('profiles')
    .select('id_document_url, selfie_url, ownership_doc_url')
    .eq('id', u.user.id)
    .single()
  if (error || !p) return json({ error: 'Could not load your profile.' }, 500)

  try {
    const admin = getSupabaseAdmin()
    const { data: files, error: listErr } = await admin.storage.from(BUCKET).list(u.user.id, { limit: 200 })
    if (listErr) return json({ error: 'Could not check your files.' }, 500)

    const doomed = orphanedIdentityFiles(
      (files ?? []).map((f) => f.name),
      [p.id_document_url, p.selfie_url, p.ownership_doc_url],
      Date.now()
    )
    if (doomed.length > 0) {
      const { error: rmErr } = await admin.storage.from(BUCKET).remove(doomed.map((n) => `${u.user.id}/${n}`))
      if (rmErr) return json({ error: 'Could not remove old files.' }, 500)
    }
    return json({ ok: true, removed: doomed.length })
  } catch {
    console.error('verification cleanup failed')
    return json({ error: 'Could not remove old files.' }, 500)
  }
}
