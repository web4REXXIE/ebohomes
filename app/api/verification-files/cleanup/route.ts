import { NextResponse } from 'next/server'
import { authUser } from '@/lib/user-auth-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { identityDeletionEnabled, orphanedIdentityFiles, pathsFromHistory, planIdentityCleanup } from '@/lib/verification-files'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUCKET = 'ownership-docs'
// PHASE 9.3: destructive cleanup of identity / ownership evidence is PAUSED until the retention policy is approved.
// Deletion only runs when the server-side flag EB_ALLOW_IDENTITY_FILE_DELETION is exactly 'true'. Default: off.
// The flag is read on every request (not at import time).
const json = (b: unknown, status = 200) => NextResponse.json(b, { status, headers: { 'Cache-Control': 'no-store' } })

// POST -> finds the signed-in user's OWN old identity uploads (ID photo, selfie, ownership
// document) that their profile no longer points to. Files newer than 6 hours are never candidates.
// While EB_ALLOW_IDENTITY_FILE_DELETION is not 'true' (the default) NOTHING is deleted: the route only reports
// how many candidates exist. Superseded files may be evidence of an earlier review.
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

    // PHASE 9.6: files an earlier review looked at are evidence. Keep every path in the file history,
    // not only the current profile pointers. If the history cannot be read in full, do nothing.
    const { data: hist, error: histErr, count } = await admin
      .from('landlord_verification_file_history')
      .select('id_document_url, selfie_url, ownership_doc_url', { count: 'exact' })
      .eq('profile_id', u.user.id)
      .limit(5000)
    if (histErr || count === null || (hist ?? []).length < count) {
      return json({ ok: true, removed: 0, paused: true, candidates: 0 })
    }

    const doomed = orphanedIdentityFiles(
      (files ?? []).map((f) => f.name),
      [p.id_document_url, p.selfie_url, p.ownership_doc_url, ...pathsFromHistory(hist)],
      Date.now()
    )
    const plan = planIdentityCleanup(doomed, identityDeletionEnabled(process.env.EB_ALLOW_IDENTITY_FILE_DELETION))
    if (plan.paused) {
      return json({ ok: true, removed: 0, paused: true, candidates: plan.candidates })
    }
    if (plan.remove.length > 0) {
      const { error: rmErr } = await admin.storage.from(BUCKET).remove(plan.remove.map((n) => `${u.user.id}/${n}`))
      if (rmErr) return json({ error: 'Could not remove old files.' }, 500)
    }
    return json({ ok: true, removed: plan.remove.length })
  } catch {
    console.error('verification cleanup failed')
    return json({ error: 'Could not remove old files.' }, 500)
  }
}
