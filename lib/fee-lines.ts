// Idea 15: the fixed fee lines shown on the Pay screen. Pure helpers, no imports, so tests can load them directly.
// Names come from the approved list (mirrors ALLOWED_CHARGES in lib/rental-offer.ts). Nothing is added at payment time.

export const MAIN_LINES = ['Rent', 'Caution deposit', 'Service charge', 'Agreement fee', 'Legal fee'] as const
export const OTHER_LINES = ['Estate dues', 'Water', 'Electricity', 'Generator', 'Waste disposal'] as const

export type FeeLine = { name: string; amount: number | null; group: 'main' | 'other' }
export type FeeBreakdown = { lines: FeeLine[]; total: number; complete: boolean }

type ChargeLike = { label?: unknown; amount?: unknown }

function num(v: unknown): number {
  const n = typeof v === 'string' ? Number(v.replace(/,/g, '').trim()) : v
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0
}

// rent and deposit come from the signed terms. charges come from the accepted offer.
// expectedTotal is rent + deposit + fees from the signed terms. The total is shown only when the lines add up to it.
// Main lines always appear (an amount, or null = "Not charged"). Other approved charges appear only when charged.
// A name outside the approved list (an older agreement) still appears, under other charges, so the total stays honest.
export function feeLines(rent: unknown, deposit: unknown, charges: unknown, expectedTotal: unknown): FeeBreakdown {
  const list: ChargeLike[] = Array.isArray(charges) ? (charges as ChargeLike[]) : []
  const byName = new Map<string, number>()
  for (const c of list) {
    const name = typeof c?.label === 'string' ? c.label.trim() : ''
    const amount = num(c?.amount)
    if (name !== '' && amount > 0) byName.set(name, (byName.get(name) ?? 0) + amount)
  }

  const lines: FeeLine[] = []
  const r = num(rent)
  const d = num(deposit)
  lines.push({ name: 'Rent', amount: r > 0 ? r : null, group: 'main' })
  lines.push({ name: 'Caution deposit', amount: d > 0 ? d : null, group: 'main' })
  for (const name of MAIN_LINES.slice(2)) lines.push({ name, amount: byName.get(name) ?? null, group: 'main' })

  const known = new Set<string>(MAIN_LINES)
  for (const name of OTHER_LINES) {
    if (byName.has(name)) lines.push({ name, amount: byName.get(name) ?? null, group: 'other' })
    known.add(name)
  }
  for (const [name, amount] of byName) if (!known.has(name)) lines.push({ name, amount, group: 'other' })

  const total = lines.reduce((sum, l) => sum + (l.amount ?? 0), 0)
  const expected = num(expectedTotal)
  const complete = r > 0 && expected > 0 && Math.abs(total - expected) < 0.005
  return { lines, total, complete }
}
