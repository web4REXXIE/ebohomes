// Pure helpers for the step-by-step application form. No imports, so they can be unit tested.
// They only decide which fields belong to which step and which quick-pick buttons to show.
// The fields, the validation and what is saved are unchanged (see lib/application-form.ts).

export type PartKey = 'about' | 'move' | 'note'
export type FieldKey = 'fullName' | 'phone' | 'occupation' | 'moveInDate' | 'occupants' | 'message'

export type Part = { key: PartKey; title: string; why: string; fields: FieldKey[] }

export const PARTS: Part[] = [
  {
    key: 'about',
    title: 'About you',
    why: 'So EboHomes knows who is applying and how to reach you.',
    fields: ['fullName', 'phone', 'occupation'],
  },
  {
    key: 'move',
    title: 'Your move',
    why: 'So the landlord and EboHomes can plan around your date and the size of your household.',
    fields: ['moveInDate', 'occupants'],
  },
  {
    key: 'note',
    title: 'Anything else?',
    why: 'Optional. Anything that helps your application.',
    fields: ['message'],
  },
]

export function partIndexOfField(field: string): number {
  const i = PARTS.findIndex((p) => (p.fields as string[]).includes(field))
  return i === -1 ? 0 : i
}

// Keeps only the errors that belong to one step, so a person is never blocked by a field they have not seen yet.
export function errorsForPart<T extends Record<string, string | undefined>>(all: T, partIndex: number): Partial<T> {
  const part = PARTS[partIndex]
  const out: Partial<T> = {}
  if (!part) return out
  for (const f of part.fields) {
    const key = f as keyof T
    if (all[key]) out[key] = all[key]
  }
  return out
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

export function addDaysIso(now: Date, days: number): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export type MoveInChoice = { label: string; date: string }

// Quick picks for the move-in date. "Pick a date" (the normal date box) is always available as well.
export function moveInChoices(now: Date = new Date()): MoveInChoice[] {
  return [
    { label: 'In a week', date: addDaysIso(now, 7) },
    { label: 'In 2 weeks', date: addDaysIso(now, 14) },
    { label: 'In a month', date: addDaysIso(now, 30) },
  ]
}

export const OCCUPANT_CHIPS = [1, 2, 3, 4] as const

// "chip" when the saved value is one of the quick buttons, "more" for 5 or more (shows a number box).
export function occupantsMode(value: string): 'chip' | 'more' {
  const n = Number(value)
  if (value.trim() === '') return 'chip'
  return Number.isInteger(n) && (OCCUPANT_CHIPS as readonly number[]).includes(n) ? 'chip' : 'more'
}
