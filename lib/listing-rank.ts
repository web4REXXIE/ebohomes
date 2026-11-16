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

// ---------------------------------------------------------------------------------------------
// Rank breakdown: the same points as rankScore, shown line by line so a landlord can see them.
// It reads the same facts and adds nothing new. Keep it in step with rankScore above.
// ---------------------------------------------------------------------------------------------
export type RankLine = {
  key: 'inspected' | 'confirmed' | 'photos' | 'video' | 'description' | 'new'
  label: string
  earned: number
  max: number
  detail: string
  // What the landlord can do. null when there is nothing to do (full points, or it cannot be changed).
  tip: string | null
}

export function rankBreakdown(input: RankInput, now: number = Date.now()): { total: number; lines: RankLine[] } {
  const confirmed = ageDays(input.confirmedAt, now)
  let confirmedPts = 0
  if (confirmed !== null) {
    if (confirmed <= 3) confirmedPts = 25
    else if (confirmed <= 7) confirmedPts = 15
    else if (confirmed <= 14) confirmedPts = 5
  }

  const photos = Number.isFinite(input.photoCount) ? Math.max(0, input.photoCount) : 0
  const photoPts = Math.min(photos, 5) * 2

  const created = ageDays(input.createdAt, now)
  let newPts = 0
  if (created !== null) {
    if (created <= 7) newPts = 15
    else if (created <= 30) newPts = 8
  }

  const lines: RankLine[] = [
    {
      key: 'inspected',
      label: 'Inspected by EboHomes',
      earned: input.inspected ? 40 : 0,
      max: 40,
      detail: input.inspected ? 'Yes. Inspected listings always come first.' : 'Not yet.',
      tip: input.inspected ? null : 'Ask EboHomes to inspect the property. Inspected listings always come first.',
    },
    {
      key: 'confirmed',
      label: 'Confirmed still available',
      earned: confirmedPts,
      max: 25,
      detail:
        confirmed === null
          ? 'Not confirmed yet.'
          : confirmed <= 3
            ? 'Confirmed in the last 3 days.'
            : `Last confirmed ${Math.floor(confirmed)} days ago.`,
      tip: confirmedPts === 25 ? null : 'Tap "Yes, still available" only when it is. Within 3 days gives all 25 points.',
    },
    {
      key: 'photos',
      label: 'Real photos',
      earned: photoPts,
      max: 10,
      detail: `${Math.min(photos, 5)} of 5 counted.`,
      tip: photos >= 5 ? null : `Add ${5 - photos} more real ${5 - photos === 1 ? 'photo' : 'photos'} of this property. Each gives 2 points.`,
    },
    {
      key: 'video',
      label: 'Walkthrough video',
      earned: input.hasVideo ? 5 : 0,
      max: 5,
      detail: input.hasVideo ? 'Added.' : 'Not added.',
      tip: input.hasVideo ? null : 'Add a 20 to 90 second walkthrough video.',
    },
    {
      key: 'description',
      label: 'Description',
      earned: input.hasDescription ? 5 : 0,
      max: 5,
      detail: input.hasDescription ? 'Written.' : 'Missing.',
      tip: input.hasDescription ? null : 'Write a short description: size, condition and nearby landmarks.',
    },
    {
      key: 'new',
      label: 'Newly listed',
      earned: newPts,
      max: 15,
      detail: newPts === 15 ? 'Listed in the last 7 days.' : newPts === 8 ? 'Listed in the last 30 days.' : 'Listed more than 30 days ago.',
      tip: null, // Cannot be changed. Refreshing a listing does not bring it back.
    },
  ]
  return { total: lines.reduce((sum, l) => sum + l.earned, 0), lines }
}
