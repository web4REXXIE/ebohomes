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
