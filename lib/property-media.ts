// Cleans property media links before they are shown.
// Only real http(s) links are kept. Blanks, nulls, duplicates, relative paths,
// storage paths and things like javascript: links are dropped.

export function safeMediaUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    return trimmed
  } catch {
    return null
  }
}

export function cleanMediaUrls(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const result: string[] = []
  for (const item of value) {
    const url = safeMediaUrl(item)
    if (url && !seen.has(url)) {
      seen.add(url)
      result.push(url)
    }
  }
  return result
}
