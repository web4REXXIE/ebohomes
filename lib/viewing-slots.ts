// Pure helpers for the viewing day-and-time picker. No imports, so they can be unit tested.
// A slot value is "YYYY-MM-DDTHH:mm" in the tenant's own clock, the same shape a datetime-local box gives.
// The database function request_viewing re-checks that the time is in the future.

export const SLOT_TIMES = ['08:00', '10:00', '12:00', '14:00', '16:00', '17:30'] as const
export const SLOT_DAYS = 7
// A slot must start at least this long from now, so nobody requests a time that is basically already here.
export const MIN_LEAD_HOURS = 3

export type SlotDay = { date: string; weekday: string; dayNumber: string }

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

export function localDateString(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// The next 7 days, starting today.
export function slotDays(now: Date = new Date()): SlotDay[] {
  const out: SlotDay[] = []
  for (let i = 0; i < SLOT_DAYS; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i)
    out.push({ date: localDateString(d), weekday: WEEKDAYS[d.getDay()], dayNumber: String(d.getDate()) })
  }
  return out
}

export function slotValue(date: string, time: string): string {
  return `${date}T${time}`
}

// True when the slot is far enough in the future to be requested.
export function slotIsOpen(date: string, time: string, now: Date = new Date()): boolean {
  const t = new Date(slotValue(date, time)).getTime()
  if (!Number.isFinite(t)) return false
  return t - now.getTime() >= MIN_LEAD_HOURS * 60 * 60 * 1000
}

export function slotLabel(time: string): string {
  const [h, m] = time.split(':').map(Number)
  const suffix = h >= 12 ? 'pm' : 'am'
  const hour = h % 12 === 0 ? 12 : h % 12
  return `${hour}:${pad(m)} ${suffix}`
}

// Splits a stored value back into day and time, or nulls when it is empty or not one of the buttons.
export function splitSlot(value: string): { date: string; time: string } | null {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/.exec(value)
  return m ? { date: m[1], time: m[2] } : null
}
