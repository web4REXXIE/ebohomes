'use client'

import type { ViewUnit, UnitGroup } from '@/lib/estate-view'
import type { LightState } from '@/lib/light-status'

// The 2D picture of a building (block of flats) or a compound (estate of houses or duplexes, or a hostel).
// It only draws what the page already knows. Tenant names are never part of this data.
// When neighbours report "Light dey", the lived-in windows glow. No report means nothing glows.

export type TileTone = 'to_let' | 'taken' | 'mine' | 'neighbour'
export type SceneGroup = UnitGroup & { shown: ViewUnit[] }

const NOTE: Record<TileTone, string> = { to_let: 'To let', taken: 'Taken', mine: 'You', neighbour: 'Neighbour' }

type SceneProps = {
  name: string
  groups: SceneGroup[]
  toneOf: (u: ViewUnit) => TileTone
  selectedId: string | null
  onSelect: (id: string) => void
  light: LightState
}

function livedIn(tone: TileTone): boolean {
  return tone === 'mine' || tone === 'neighbour'
}

function LightBadge({ tone, light }: { tone: TileTone; light: LightState }) {
  if (!livedIn(tone) || light === 'unknown') return null
  return (
    <span aria-hidden className="absolute -right-1 -top-2 text-sm leading-none">
      {light === 'on' ? '💡' : '🕯️'}
    </span>
  )
}

function Window({ unit, tone, selected, light, onSelect }: { unit: ViewUnit; tone: TileTone; selected: boolean; light: LightState; onSelect: (id: string) => void }) {
  const lit = livedIn(tone) && light === 'on'
  const dim = livedIn(tone) && light === 'off'
  const toneClass =
    tone === 'to_let'
      ? 'border-success bg-card text-success'
      : tone === 'mine'
        ? 'border-primary bg-primary text-primary-foreground'
        : tone === 'neighbour'
          ? lit
            ? 'border-featured/60 bg-featured/25 text-foreground'
            : 'border-primary/40 bg-secondary text-foreground'
          : 'border-transparent bg-muted text-muted-foreground'
  return (
    <button
      type="button"
      onClick={() => onSelect(unit.id)}
      aria-pressed={selected}
      aria-label={`Unit ${unit.unit_label}, ${NOTE[tone].toLowerCase()}`}
      className={`focus-ring relative flex min-h-14 min-w-16 flex-col items-center justify-center rounded-b-sm rounded-t-xl border-2 px-3 py-1 text-sm font-bold transition ${toneClass} ${dim ? 'opacity-70' : ''} ${selected ? 'ring-2 ring-primary ring-offset-2' : ''}`}
    >
      <LightBadge tone={tone} light={light} />
      {unit.unit_label}
      <span className="text-[11px] font-normal leading-tight">{NOTE[tone]}</span>
    </button>
  )
}

function House({ unit, tone, selected, light, onSelect }: { unit: ViewUnit; tone: TileTone; selected: boolean; light: LightState; onSelect: (id: string) => void }) {
  const lit = livedIn(tone) && light === 'on'
  const dim = livedIn(tone) && light === 'off'
  const roof =
    tone === 'to_let' ? 'bg-success' : tone === 'mine' ? 'bg-primary' : tone === 'neighbour' ? (lit ? 'bg-featured' : 'bg-primary/50') : 'bg-muted-foreground/40'
  const body =
    tone === 'to_let'
      ? 'border-success bg-card text-success'
      : tone === 'mine'
        ? 'border-primary bg-primary text-primary-foreground'
        : tone === 'neighbour'
          ? lit
            ? 'border-featured/60 bg-featured/25 text-foreground'
            : 'border-primary/40 bg-secondary text-foreground'
          : 'border-transparent bg-muted text-muted-foreground'
  return (
    <button
      type="button"
      onClick={() => onSelect(unit.id)}
      aria-pressed={selected}
      aria-label={`Unit ${unit.unit_label}, ${NOTE[tone].toLowerCase()}`}
      className={`focus-ring relative flex min-h-16 flex-col items-stretch rounded-md transition ${dim ? 'opacity-70' : ''} ${selected ? 'ring-2 ring-primary ring-offset-2' : ''}`}
    >
      <LightBadge tone={tone} light={light} />
      <span aria-hidden className={`h-3 w-full ${roof}`} style={{ clipPath: 'polygon(50% 0, 100% 100%, 0 100%)' }} />
      <span className={`flex flex-1 flex-col items-center justify-center rounded-b-md border-2 border-t-0 px-1 py-1 text-sm font-bold ${body}`}>
        {unit.unit_label}
        <span className="text-[11px] font-normal leading-tight">{NOTE[tone]}</span>
      </span>
    </button>
  )
}

// A building (flats). Roof, name board, floors top first, ground and gate.
export function BlockScene({ name, groups, toneOf, selectedId, onSelect, light }: SceneProps) {
  return (
    <div className="mx-auto mt-3 max-w-md" aria-label={`${name} building`}>
      <div className="mx-auto mb-1 w-fit max-w-full rounded-md bg-primary px-4 py-1.5 text-center text-sm font-bold text-primary-foreground shadow-sm">{name}</div>
      <div aria-hidden className="mx-3 h-8 bg-primary" style={{ clipPath: 'polygon(8% 0, 92% 0, 100% 100%, 0 100%)' }} />
      <div className="space-y-1.5 border-x-4 border-primary/30 bg-secondary px-2 py-2">
        {groups.map((g) => (
          <section key={g.key} id={g.key} aria-label={g.title} className="flex scroll-mt-24 items-stretch gap-2 rounded-md border border-border bg-card p-2">
            <div className="flex w-9 shrink-0 flex-col items-center justify-center rounded-md bg-secondary text-sm font-bold text-foreground" title={g.title}>
              {g.floor === 0 ? 'G' : g.floor}
            </div>
            <div className="flex flex-wrap gap-2 pt-2">
              {g.shown.map((x) => (
                <Window key={x.id} unit={x} tone={toneOf(x)} selected={x.id === selectedId} light={light} onSelect={onSelect} />
              ))}
            </div>
          </section>
        ))}
      </div>
      <div aria-hidden className="flex h-6 items-end justify-center border-x-4 border-primary/30 bg-primary/80">
        <span className="h-4 w-9 rounded-t-md bg-primary-foreground/40" />
      </div>
    </div>
  )
}

// An estate or compound. Gate with the name, then one street or phase at a time, with the houses along a road.
export function CompoundScene({ name, groups, toneOf, selectedId, onSelect, light }: SceneProps) {
  return (
    <div className="mt-3 space-y-3" aria-label={`${name} compound`}>
      <div className="mx-auto flex w-fit max-w-full flex-col items-center">
        <div className="rounded-md bg-primary px-4 py-1.5 text-center text-sm font-bold text-primary-foreground shadow-sm">{name}</div>
        <div aria-hidden className="flex w-40 justify-between">
          <span className="h-4 w-2 bg-primary/70" />
          <span className="h-4 w-2 bg-primary/70" />
        </div>
      </div>
      {groups.map((g) => (
        <section key={g.key} id={g.key} aria-label={g.title} className="scroll-mt-24 rounded-card border border-border bg-card p-3">
          <h2 className="mb-3 w-fit rounded-chip bg-secondary px-3 py-1 text-sm font-semibold text-foreground">{g.title}</h2>
          <div className="grid grid-cols-4 gap-x-2 gap-y-3 sm:grid-cols-6">
            {g.shown.map((x) => (
              <House key={x.id} unit={x} tone={toneOf(x)} selected={x.id === selectedId} light={light} onSelect={onSelect} />
            ))}
          </div>
          <div aria-hidden className="mt-3 h-2 rounded-full border-y border-dashed border-muted-foreground/40 bg-muted" />
        </section>
      ))}
    </div>
  )
}
