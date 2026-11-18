'use client'

import type { ReactNode } from 'react'
import type { ViewUnit, UnitGroup } from '@/lib/estate-view'
import type { LightState } from '@/lib/light-status'

// The isometric 3D-look picture of a building (block of flats) or a compound (estate of houses or duplexes, or a hostel).
// The 3D look is plain CSS: the front stays flat so labels read well and taps work, and a side face and a roof are added.
// No 3D library and no images, so it stays light on a cheap phone.
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

// Adds depth to a flat box: a darker side face on the right, and optionally a lighter roof (top face) above.
// Purely decorative (aria-hidden, never takes taps). Angles: side goes up 30 degrees, roof is skewed to match.
function Box3D({ depth = 14, roof = false, children }: { depth?: number; roof?: boolean; children: ReactNode }) {
  const rise = Math.round(depth * 0.577)
  return (
    <div className="relative" style={{ marginRight: depth, marginTop: roof ? rise : 0 }}>
      {children}
      <span
        aria-hidden
        className="pointer-events-none absolute bg-primary/70"
        style={{ left: '100%', top: 0, width: depth, height: '100%', transformOrigin: '0 0', transform: 'skewY(-30deg)' }}
      />
      {roof && (
        <span
          aria-hidden
          className="pointer-events-none absolute bg-primary/35"
          style={{ left: 0, bottom: '100%', width: '100%', height: rise, transformOrigin: '0 100%', transform: 'skewX(-60deg)' }}
        />
      )}
    </div>
  )
}

// A building (flats). Roof, name board, floors top first, ground and gate.
export function BlockScene({ name, groups, toneOf, selectedId, onSelect, light }: SceneProps) {
  return (
    <div className="mx-auto mt-3 max-w-md" aria-label={`${name} building`}>
      <div className="mx-auto mb-2 w-fit max-w-full rounded-md bg-primary px-4 py-1.5 text-center text-sm font-bold text-primary-foreground shadow-sm">{name}</div>
      <Box3D depth={18} roof>
        <div className="border-x-4 border-primary/30 bg-secondary">
          <div aria-hidden className="h-2 bg-primary" />
          <div className="space-y-1.5 px-2 py-2">
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
          <div aria-hidden className="flex h-6 items-end justify-center bg-primary/80">
            <span className="h-4 w-9 rounded-t-md bg-primary-foreground/40" />
          </div>
        </div>
      </Box3D>
      <div aria-hidden className="mx-auto mt-1 h-2 w-4/5 rounded-full bg-black/10 blur-sm" />
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
        <section key={g.key} id={g.key} aria-label={g.title} className="scroll-mt-24">
          <Box3D depth={12} roof>
            <div className="rounded-card border border-border bg-card p-3">
              <h2 className="mb-3 w-fit rounded-chip bg-secondary px-3 py-1 text-sm font-semibold text-foreground">{g.title}</h2>
              <div className="grid grid-cols-4 gap-x-2 gap-y-3 sm:grid-cols-6">
                {g.shown.map((x) => (
                  <House key={x.id} unit={x} tone={toneOf(x)} selected={x.id === selectedId} light={light} onSelect={onSelect} />
                ))}
              </div>
              <div aria-hidden className="mt-3 h-2 rounded-full border-y border-dashed border-muted-foreground/40 bg-muted" />
            </div>
          </Box3D>
        </section>
      ))}
    </div>
  )
}
