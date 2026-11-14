// Pure helpers for the "Light dey?" card. No imports, so they can be unit tested.
// Only reads what estate_light_status returns. Never guesses: no report in 6 hours means "No update yet".

export type LightState = 'on' | 'off' | 'unknown'
export type LightInfo = { status: LightState; on: number; off: number; updatedAt: string | null }

export const EMPTY_LIGHT: LightInfo = { status: 'unknown', on: 0, off: 0, updatedAt: null }

const count = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0)

export function parseLight(raw: unknown): LightInfo {
  if (typeof raw !== 'object' || raw === null) return EMPTY_LIGHT
  const r = raw as Record<string, unknown>
  const status: LightState = r.status === 'on' || r.status === 'off' ? r.status : 'unknown'
  const updatedAt = typeof r.updated_at === 'string' && !Number.isNaN(new Date(r.updated_at).getTime()) ? r.updated_at : null
  return { status, on: count(r.on), off: count(r.off), updatedAt }
}

export function lightHeadline(status: LightState): string {
  if (status === 'on') return 'Light dey'
  if (status === 'off') return 'No light'
  return 'No update yet'
}

export function timeAgo(iso: string | null, now: number = Date.now()): string {
  if (!iso) return ''
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return ''
  const mins = Math.max(0, Math.round((now - t) / 60000))
  if (mins < 2) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.round(mins / 60)
  return `${hrs} h ago`
}

export function reportsLine(info: LightInfo): string {
  const n = info.on + info.off
  if (n === 0) return 'No neighbour has reported in the last 6 hours.'
  return `${n} ${n === 1 ? 'neighbour' : 'neighbours'} reported. Names are never shown.`
}
