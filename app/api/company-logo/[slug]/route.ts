import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { ORG_BUCKET, ORG_FOLDER, ORG_LOGO_MAX_BYTES } from '@/lib/organization-evidence'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TYPES: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }
const none = (status = 404) => new Response(null, { status, headers: { 'Cache-Control': 'no-store' } })

// GET /api/company-logo/<slug> -> the logo image of an APPROVED company. Public, nothing else is ever served here.
// The slug is looked up in the database. A suspended, rejected or unapproved company returns 404, so its logo disappears.
// Only files in the company logo folder with a logo- name are served. The private documents are never reachable from here.
export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params
  if (typeof slug !== 'string' || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(slug)) return none()

  const db = getSupabaseAdmin()
  const { data: path, error } = await db.rpc('eb_public_company_logo_path', { p_slug: slug })
  if (error || typeof path !== 'string' || !path) return none()

  const parts = path.split('/')
  const ext = (parts[3] ?? '').split('.').pop()?.toLowerCase() ?? ''
  if (parts.length !== 4 || parts[0] !== ORG_FOLDER || !parts[3].startsWith('logo-') || !TYPES[ext]) return none()

  const { data: blob, error: dlErr } = await db.storage.from(ORG_BUCKET).download(path)
  if (dlErr || !blob || blob.size > ORG_LOGO_MAX_BYTES) return none()

  return new Response(await blob.arrayBuffer(), {
    status: 200,
    headers: {
      'Content-Type': TYPES[ext],
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
      // Short cache, so a suspension or a new approved logo shows within minutes.
      'Cache-Control': 'public, max-age=300, s-maxage=300',
    },
  })
}
