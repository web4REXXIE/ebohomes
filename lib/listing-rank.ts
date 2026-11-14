// Pure ranking rule for the "Recommended" order in search. No imports, so it can be unit tested.
// It is a visible rule, not machine learning. Featured listings are handled separately by the search page
// (they stay clearly labelled and first). Money never buys a verified look: this only reads facts.
//
// Order:
//   1. Inspected by EboHomes (valid public inspection) always comes before listings that are not.
//   2. Inside each group, higher score first. Equal scores keep the newest first.
//
// Points (highest possible 100). Inspected still counts here, so the score matches what it did before:
//   Inspected by EboHomes (valid public inspection) .... 40
//   Landlord confirmed "still available" recently ...... up to 25  (3 days 25, 7 days 15, 14 days 5, unknown 0)
//   Listing completeness (photos, video, description) .. up to 20
//   Newly listed ....................................... up to 15  (7 days 15, 30 days 8)
// Confirming availability counts for more than posting date, so refreshing a listing does not climb the list.

export type RankInput = {
  inspected: boolean
  confirmedAt: string | null | undefined
  photoCount: number
  hasVideo: boolean
  hasDescription: boolean
  createdAt: string | null | undefined
}

const DAY = 24 * 60 * 60 * 1000

function ageDays(value: string | null | undefined, now: number): number | null {
  if (!value) return null
  const t = new Date(value).getTime()
  if (!Number.isFinite(t)) return null
  return Math.max(0, (now - t) / DAY)
}

export function rankScore(input: RankInput, now: number = Date.now()): number {
  let score = 0
  if (input.inspected) score += 40

  const confirmed = ageDays(input.confirmedAt, now)
  if (confirmed !== null) {
    if (confirmed <= 3) score += 25
    else if (confirmed <= 7) score += 15
    else if (confirmed <= 14) score += 5
  }

  const photos = Number.isFinite(input.photoCount) ? Math.max(0, input.photoCount) : 0
  score += Math.min(photos, 5) * 2 // up to 10
  if (input.hasVideo) score += 5
  if (input.hasDescription) score += 5

  const created = ageDays(input.createdAt, now)
  if (created !== null) {
    if (created <= 7) score += 15
    else if (created <= 30) score += 8
  }
  return score
}

// Sorts best first: inspected before not inspected, then higher score, then newest.
export function rankListings<T extends { id: string; created_at?: string | null }>(
  rows: T[],
  inputFor: (row: T) => RankInput,
  now: number = Date.now(),
): T[] {
  return rows
    .map((row) => {
      const input = inputFor(row)
      return { row, inspected: input.inspected === true, score: rankScore(input, now) }
    })
    .sort((a, b) => {
      if (a.inspected !== b.inspected) return a.inspected ? -1 : 1
      if (b.score !== a.score) return b.score - a.score
      const ta = a.row.created_at ? new Date(a.row.created_at).getTime() : 0
      const tb = b.row.created_at ? new Date(b.row.created_at).getTime() : 0
      return tb - ta
    })
    .map((x) => x.row)
}
