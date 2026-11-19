// EboVille rules in one place. Pure data and small helpers, no imports, so they can be unit tested.
// Points come from the database (eboville_summary). Levels and unlocks are worked out here.
// No randomness, no money, no penalties. You can always see exactly what comes next.

// Lodge points needed to reach each level. Level 1 starts at 0.
export const LEVEL_STEPS = [0, 10, 25, 50, 90, 140, 200, 280, 380, 500]

export type LodgeUnlock = { level: number; label: string }
export const LODGE_UNLOCKS: LodgeUnlock[] = [
  { level: 3, label: 'Garden: extra plants around the plaza' },
  { level: 5, label: 'String lights over the doors' },
  { level: 7, label: 'Upgraded gate with lanterns' },
]

export function levelFor(points: number): number {
  const p = Number.isFinite(points) && points > 0 ? Math.floor(points) : 0
  let level = 1
  for (let i = 0; i < LEVEL_STEPS.length; i++) if (p >= LEVEL_STEPS[i]) level = i + 1
  return level
}

// Points still needed for the next level, or null at the top level.
export function nextStep(points: number): { level: number; at: number; left: number } | null {
  const level = levelFor(points)
  if (level >= LEVEL_STEPS.length) return null
  const at = LEVEL_STEPS[level]
  return { level: level + 1, at, left: Math.max(0, at - Math.max(0, Math.floor(points))) }
}

export function nextLodgeUnlock(level: number): LodgeUnlock | null {
  return LODGE_UNLOCKS.find((u) => u.level > level) ?? null
}

export type RoomItemKey = 'plant' | 'chair' | 'rug' | 'lantern' | 'table' | 'art' | 'tv' | 'water' | 'generator' | 'pot'
export type RoomItem = { key: RoomItemKey; label: string; emoji: string; points: number }

// Your own points unlock these, in this order. They only appear in your own room.
export const ROOM_ITEMS: RoomItem[] = [
  { key: 'plant', label: 'Plant', emoji: '🪴', points: 5 },
  { key: 'chair', label: 'Chair', emoji: '🪑', points: 15 },
  { key: 'rug', label: 'Rug', emoji: '🟫', points: 30 },
  { key: 'lantern', label: 'Lantern', emoji: '🏮', points: 50 },
  { key: 'table', label: 'Small table', emoji: '🪵', points: 75 },
  { key: 'art', label: 'Wall picture', emoji: '🖼️', points: 100 },
  { key: 'tv', label: 'TV', emoji: '📺', points: 140 },
  { key: 'water', label: 'Water container', emoji: '🪣', points: 190 },
  { key: 'generator', label: 'Generator', emoji: '⚡', points: 250 },
  { key: 'pot', label: 'Plant pot', emoji: '🌴', points: 320 },
]

export function unlockedItems(points: number): RoomItem[] {
  const p = Number.isFinite(points) && points > 0 ? points : 0
  return ROOM_ITEMS.filter((i) => p >= i.points)
}

export function nextItem(points: number): RoomItem | null {
  const p = Number.isFinite(points) && points > 0 ? points : 0
  return ROOM_ITEMS.find((i) => p < i.points) ?? null
}

export type Summary = {
  role: 'owner' | 'resident' | null
  lodgePoints: number
  residents: number
  activeResidents: number
  myPoints: number
  myUnitLabel: string | null
}

export const EMPTY_SUMMARY: Summary = { role: null, lodgePoints: 0, residents: 0, activeResidents: 0, myPoints: 0, myUnitLabel: null }

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0)

export function parseSummary(raw: unknown): Summary {
  if (typeof raw !== 'object' || raw === null) return EMPTY_SUMMARY
  const r = raw as Record<string, unknown>
  const role = r.role === 'owner' || r.role === 'resident' ? r.role : null
  if (!role) return EMPTY_SUMMARY
  return {
    role,
    lodgePoints: num(r.lodge_points),
    residents: num(r.residents),
    activeResidents: num(r.active_residents),
    myPoints: num(r.my_points),
    myUnitLabel: typeof r.my_unit_label === 'string' ? r.my_unit_label : null,
  }
}
