// Pure helpers (no imports) that turn "what is this place?" into a list of numbered units.
// The database function create_estate_with_units re-checks every rule. This only builds the preview.

export type EstateKind = 'single_house' | 'block' | 'estate' | 'hostel'

export type UnitDraft = { unit_label: string; floor_no: number | null; group_label: string | null }

export type NumberingInput = {
  kind: EstateKind
  floors?: number // block: number of floors ABOVE the ground floor
  groundCount?: number // block: flats on the ground floor (0 or empty means none). Numbered GA, GB, GC...
  perFloor?: number // block: flats on each floor (used when floorCounts is empty)
  floorCounts?: number[] // block: flats on floor 1, 2, 3... (overrides perFloor)
  count?: number // estate or hostel: how many
  groupLabel?: string // estate: street or phase, applied to all
}

export const MAX_UNITS = 300
export const MAX_FLOORS = 60
export const GROUND_PREFIX = 'G'
export const MAX_PER_FLOOR = 26 // A to Z

export function floorWord(n: number): string {
  if (n === 0) return 'Ground'
  const mod100 = n % 100
  const mod10 = n % 10
  const suffix = mod100 >= 11 && mod100 <= 13 ? 'th' : mod10 === 1 ? 'st' : mod10 === 2 ? 'nd' : mod10 === 3 ? 'rd' : 'th'
  return `${n}${suffix}`
}

export function letterFor(index: number): string {
  return String.fromCharCode(65 + index) // 0 -> A
}

function whole(n: unknown): number | null {
  return typeof n === 'number' && Number.isInteger(n) ? n : null
}

// Returns { units } when valid, or { error } with a plain sentence the landlord can act on.
export function buildUnits(input: NumberingInput): { units: UnitDraft[]; error: null } | { units: []; error: string } {
  const fail = (error: string) => ({ units: [] as [], error })

  if (input.kind === 'single_house') {
    return { units: [{ unit_label: '1', floor_no: null, group_label: null }], error: null }
  }

  if (input.kind === 'block') {
    const ground = input.groundCount === undefined ? 0 : whole(input.groundCount)
    if (ground === null || ground < 0) return fail('Enter how many flats are on the ground floor, or leave it empty.')
    if (ground > MAX_PER_FLOOR) return fail(`A floor can have up to ${MAX_PER_FLOOR} flats here.`)
    // With ground-floor flats, the floors above can be left empty (a ground-floor-only building).
    const floors = input.floors === undefined && ground > 0 ? 0 : whole(input.floors)
    if (floors === null || (floors < 1 && ground < 1)) return fail('Enter how many floors the building has.')
    if (floors > MAX_FLOORS) return fail(`A building can have up to ${MAX_FLOORS} floors here.`)
    const custom = input.floorCounts && input.floorCounts.length > 0 ? input.floorCounts : null
    const counts: number[] = []
    for (let f = 1; f <= floors; f++) {
      const raw = custom ? custom[f - 1] : input.perFloor
      const c = whole(raw)
      if (c === null || c < 1) return fail(custom ? `Enter how many flats are on floor ${f}.` : 'Enter how many flats are on each floor.')
      if (c > MAX_PER_FLOOR) return fail(`A floor can have up to ${MAX_PER_FLOOR} flats here.`)
      counts.push(c)
    }
    const total = counts.reduce((a, b) => a + b, 0) + ground
    if (total > MAX_UNITS) return fail(`That is ${total} units. You can create up to ${MAX_UNITS} at a time.`)
    const units: UnitDraft[] = []
    // Top floor first, so the preview reads like the building.
    for (let f = floors; f >= 1; f--) {
      for (let i = 0; i < counts[f - 1]; i++) {
        units.push({ unit_label: `${f}${letterFor(i)}`, floor_no: f, group_label: null })
      }
    }
    // Ground floor last, like the real building. The database accepts floor 0.
    for (let i = 0; i < ground; i++) {
      units.push({ unit_label: `${GROUND_PREFIX}${letterFor(i)}`, floor_no: 0, group_label: null })
    }
    return { units, error: null }
  }

  // estate of houses or hostel rooms: numbered 1 to N
  const count = whole(input.count)
  if (count === null || count < 1) return fail(input.kind === 'hostel' ? 'Enter how many rooms there are.' : 'Enter how many houses there are.')
  if (count > MAX_UNITS) return fail(`You can create up to ${MAX_UNITS} at a time.`)
  const group = (input.groupLabel ?? '').trim().slice(0, 60)
  const units: UnitDraft[] = []
  for (let n = 1; n <= count; n++) {
    units.push({ unit_label: String(n), floor_no: null, group_label: group || null })
  }
  return { units, error: null }
}
