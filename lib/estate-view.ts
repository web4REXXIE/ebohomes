// Pure helpers (no imports) for the tenant building view. They decide what each tile says and how tiles are grouped.
// Tenants see "to let" or "not available". Tenant names and reasons are never part of this data.

export type ViewUnit = {
  id: string
  unit_label: string
  floor_no: number | null
  group_label: string | null
  status: string
  listing_id: string | null
}

export type TileState = 'to_let' | 'unavailable'

export type UnitGroup = { key: string; title: string; floor: number | null; units: ViewUnit[] }

function floorWord(n: number): string {
  if (n === 0) return 'Ground'
  const mod100 = n % 100
  const mod10 = n % 10
  const suffix = mod100 >= 11 && mod100 <= 13 ? 'th' : mod10 === 1 ? 'st' : mod10 === 2 ? 'nd' : mod10 === 3 ? 'rd' : 'th'
  return `${n}${suffix}`
}

// A unit is "to let" only when it is marked available AND its listing is live (approved).
export function unitState(u: ViewUnit, liveListingIds: ReadonlySet<string>): TileState {
  if (u.status === 'available' && u.listing_id && liveListingIds.has(u.listing_id)) return 'to_let'
  return 'unavailable'
}

export function naturalSort(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}

// Blocks (units with floors): one group per floor, top floor first.
// Estates and hostels (no floors): one group per street or phase, in natural order. No label means one plain group.
export function groupUnits(units: ViewUnit[]): UnitGroup[] {
  const hasFloors = units.some((u) => u.floor_no !== null)
  if (hasFloors) {
    const byFloor = new Map<number, ViewUnit[]>()
    for (const u of units) {
      const f = u.floor_no ?? 0
      byFloor.set(f, [...(byFloor.get(f) ?? []), u])
    }
    return [...byFloor.keys()]
      .sort((a, b) => b - a)
      .map((f) => ({
        key: `floor-${f}`,
        title: `${floorWord(f)} floor`,
        floor: f,
        units: (byFloor.get(f) ?? []).sort((a, b) => naturalSort(a.unit_label, b.unit_label)),
      }))
  }
  const byGroup = new Map<string, ViewUnit[]>()
  for (const u of units) {
    const g = (u.group_label ?? '').trim()
    byGroup.set(g, [...(byGroup.get(g) ?? []), u])
  }
  return [...byGroup.keys()]
    .sort((a, b) => naturalSort(a, b))
    .map((g, i) => ({
      key: `group-${i}`,
      title: g || 'Units',
      floor: null,
      units: (byGroup.get(g) ?? []).sort((a, b) => naturalSort(a.unit_label, b.unit_label)),
    }))
}

export function countToLet(units: ViewUnit[], liveListingIds: ReadonlySet<string>): number {
  return units.filter((u) => unitState(u, liveListingIds) === 'to_let').length
}
