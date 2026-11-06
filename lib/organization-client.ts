// BROWSER helper for the company page (Phase 10.3). Uploads one file in three steps:
//   1. ask the server for a one-time upload slot   2. send the file straight to private storage   3. ask the server to register it
// The server decides everything that matters (which company, real file type, fingerprint). Nothing here verifies a company.
import { supabase } from '@/lib/supabase'
import { ORG_BUCKET, validateOrgFileMeta, validateOrgLogoMeta, type OrgDocType } from '@/lib/organization-evidence'

export async function orgPost(path: string, body: unknown): Promise<{ ok: boolean; j: any }> {
  const t = (await supabase.auth.getSession()).data.session?.access_token ?? ''
  const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` }, body: JSON.stringify(body) })
  const j = await res.json().catch(() => null)
  return { ok: res.ok, j }
}

// Returns null on success, or a plain message to show the person. pending = a new logo is waiting for admin review.
export async function uploadOrganizationFile(
  file: File,
  kind: 'document' | 'logo',
  docType?: OrgDocType,
): Promise<{ error: string | null; pending?: boolean }> {
  const bad = kind === 'logo' ? validateOrgLogoMeta(file.type, file.size) : validateOrgFileMeta(file.type, file.size)
  if (bad) return { error: bad }
  if (kind === 'document' && !docType) return { error: 'Choose what kind of document this is first.' }

  const p = await orgPost('/api/organization/prepare', { kind, mime: file.type, bytes: file.size })
  if (!p.ok) return { error: p.j?.error ?? 'Could not prepare the upload.' }

  const up = await supabase.storage.from(ORG_BUCKET).uploadToSignedUrl(p.j.path, p.j.token, file, { contentType: file.type })
  if (up.error) return { error: 'The upload failed. Check your connection and try again.' }

  const r = await orgPost('/api/organization/documents', { kind, path: p.j.path, name: file.name, doc_type: docType })
  if (!r.ok) return { error: r.j?.error ?? 'Could not save your file.' }
  return { error: null, pending: Boolean(r.j?.pending) }
}
