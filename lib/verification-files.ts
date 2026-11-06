// Pure helpers (safe for client and server). No imports.
// Picks identity uploads that no profile column points to any more.
// Only govid-, selfie- and verification- files are ever candidates, so property
// documents ('listing-...') in the same bucket are never touched.

export const IDENTITY_FILE_RE = /^(govid|selfie|verification)-(\d{10,15})-[A-Za-z0-9._-]+$/
export const MIN_ORPHAN_AGE_MS = 6 * 60 * 60 * 1000

export function orphanedIdentityFiles(
  names: string[],
  referencedPaths: (string | null | undefined)[],
  nowMs: number,
  minAgeMs: number = MIN_ORPHAN_AGE_MS
): string[] {
  const keep = new Set(
    referencedPaths.filter((p): p is string => typeof p === 'string' && p !== '').map((p) => p.split('/').pop() as string)
  )
  return names.filter((n) => {
    const m = IDENTITY_FILE_RE.exec(n)
    if (!m || keep.has(n)) return false
    const ts = Number(m[2])
    return Number.isFinite(ts) && nowMs - ts >= minAgeMs
  })
}


// PHASE 9.3: deletion of identity / ownership evidence is paused until the retention policy is approved.
// Deletion runs ONLY when EB_ALLOW_IDENTITY_FILE_DELETION is exactly the string 'true'. Anything else (unset, '', 'TRUE', '1', 'false') = off.
export function identityDeletionEnabled(raw: string | null | undefined): boolean {
  return raw === 'true'
}

// PHASE 9.6: every path an earlier review may have looked at is evidence, so it is never a cleanup candidate.
// Takes rows from landlord_verification_file_history and returns every stored path.
export function pathsFromHistory(
  rows: { id_document_url?: string | null; selfie_url?: string | null; ownership_doc_url?: string | null }[] | null | undefined
): string[] {
  const out: string[] = []
  for (const r of rows ?? []) {
    for (const v of [r.id_document_url, r.selfie_url, r.ownership_doc_url]) {
      if (typeof v === 'string' && v !== '') out.push(v)
    }
  }
  return out
}

export type IdentityCleanupPlan = { remove: string[]; paused: boolean; candidates: number }

export function planIdentityCleanup(candidates: string[], enabled: boolean): IdentityCleanupPlan {
  const n = candidates.length
  if (n > 0 && !enabled) return { remove: [], paused: true, candidates: n }
  return { remove: enabled ? [...candidates] : [], paused: false, candidates: n }
}
