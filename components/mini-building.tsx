import { groupUnits, naturalSort, unitState, type ViewUnit } from '@/lib/estate-view'

// A small picture of one building or compound, for the landlord profile.
// Green outline = to let. Grey = not available. It shows no names and no prices.
const MAX_FLOORS = 4
const MAX_PER_FLOOR = 8
const MAX_HOUSES = 12

export function MiniBuilding({ units, live, kind }: { units: ViewUnit[]; live: ReadonlySet<string>; kind: string }) {
  const toLet = units.filter((u) => unitState(u, live) === 'to_let').length
  const summary = `${units.length} ${units.length === 1 ? 'unit' : 'units'}, ${toLet} to let`
  const groups = groupUnits(units)
  const isBlock = kind === 'block' && groups.some((g) => g.floor !== null)

  const square = (u: ViewUnit) => (
    <span
      key={u.id}
      className={`h-4 w-4 rounded-t-md rounded-b-sm border ${unitState(u, live) === 'to_let' ? 'border-success bg-card' : 'border-transparent bg-muted'}`}
    />
  )

  if (isBlock) {
    const shown = groups.slice(0, MAX_FLOORS)
    const hiddenFloors = groups.length - shown.length
    return (
      <div className="rounded-md bg-secondary p-2" role="img" aria-label={summary}>
        <div aria-hidden className="mx-2 h-3 bg-primary" style={{ clipPath: 'polygon(8% 0, 92% 0, 100% 100%, 0 100%)' }} />
        <div aria-hidden className="space-y-1 border-x-2 border-primary/30 bg-card px-2 py-1.5">
          {shown.map((g) => (
            <div key={g.key} className="flex items-center gap-1.5">
              <span className="w-4 text-center text-[10px] font-bold text-muted-foreground">{g.floor === 0 ? 'G' : g.floor}</span>
              <span className="flex gap-1">{g.units.slice(0, MAX_PER_FLOOR).map(square)}</span>
              {g.units.length > MAX_PER_FLOOR && <span className="text-[10px] text-muted-foreground">+{g.units.length - MAX_PER_FLOOR}</span>}
            </div>
          ))}
          {hiddenFloors > 0 && <p className="text-[10px] text-muted-foreground">+{hiddenFloors} more {hiddenFloors === 1 ? 'floor' : 'floors'}</p>}
        </div>
      </div>
    )
  }

  const sorted = [...units].sort((a, b) => naturalSort(a.unit_label, b.unit_label))
  const shown = sorted.slice(0, MAX_HOUSES)
  const more = sorted.length - shown.length
  return (
    <div className="rounded-md bg-secondary p-2" role="img" aria-label={summary}>
      <div aria-hidden className="flex flex-wrap items-end gap-1.5">
        {shown.map((u) => {
          const open = unitState(u, live) === 'to_let'
          return (
            <span key={u.id} className="flex w-6 flex-col">
              <span className={`h-2 w-full ${open ? 'bg-success' : 'bg-muted-foreground/40'}`} style={{ clipPath: 'polygon(50% 0, 100% 100%, 0 100%)' }} />
              <span className={`h-3.5 w-full rounded-b-sm border border-t-0 ${open ? 'border-success bg-card' : 'border-transparent bg-muted'}`} />
            </span>
          )
        })}
        {more > 0 && <span className="pb-0.5 text-[10px] text-muted-foreground">+{more} more</span>}
      </div>
      <div aria-hidden className="mt-1 h-1 rounded-full border-y border-dashed border-muted-foreground/40 bg-muted" />
    </div>
  )
}
