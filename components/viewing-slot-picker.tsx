'use client'

import { useMemo, useState } from 'react'
import { SLOT_TIMES, slotDays, slotIsOpen, slotLabel, slotValue, splitSlot } from '@/lib/viewing-slots'

// Day buttons, then time buttons. The value is "YYYY-MM-DDTHH:mm", so callers can keep using toIso().
// "Need another day?" falls back to the normal date and time box for anything beyond the next 7 days.
export function ViewingSlotPicker({
  value,
  onChange,
  fieldClass,
}: {
  value: string
  onChange: (next: string) => void
  fieldClass: string
}) {
  const days = useMemo(() => slotDays(), [])
  const picked = splitSlot(value)
  const onButtons = picked !== null && days.some((d) => d.date === picked.date) && (SLOT_TIMES as readonly string[]).includes(picked.time)
  const [custom, setCustom] = useState(value !== '' && !onButtons)
  const [day, setDay] = useState<string>(picked && days.some((d) => d.date === picked.date) ? picked.date : '')

  const pickDay = (date: string) => {
    setDay(date)
    // Keep the time if it is still open on the new day, otherwise clear it.
    if (picked && slotIsOpen(date, picked.time)) onChange(slotValue(date, picked.time))
    else onChange('')
  }

  if (custom) {
    return (
      <div className="space-y-2">
        <label className="block text-xs font-semibold text-foreground">Preferred date and time
          <input type="datetime-local" value={value} onChange={(e) => onChange(e.target.value)} className={`${fieldClass} mt-1`} />
        </label>
        <button type="button" onClick={() => { setCustom(false); onChange('') }} className="min-h-11 text-xs font-semibold text-primary underline">
          Pick from the next 7 days instead
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="mb-1 text-xs font-semibold text-foreground">Day</p>
        <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Choose a day">
          {days.map((d) => (
            <button
              key={d.date}
              type="button"
              aria-pressed={day === d.date}
              onClick={() => pickDay(d.date)}
              className={`focus-ring flex min-h-14 min-w-14 shrink-0 flex-col items-center justify-center rounded-button border px-2 text-xs ${day === d.date ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-foreground'}`}
            >
              <span>{d.weekday}</span>
              <span className="text-base font-bold">{d.dayNumber}</span>
            </button>
          ))}
        </div>
      </div>

      {day !== '' && (
        <div>
          <p className="mb-1 text-xs font-semibold text-foreground">Time</p>
          <div className="grid grid-cols-3 gap-2" role="group" aria-label="Choose a time">
            {SLOT_TIMES.map((t) => {
              const open = slotIsOpen(day, t)
              const selected = value === slotValue(day, t)
              return (
                <button
                  key={t}
                  type="button"
                  disabled={!open}
                  aria-pressed={selected}
                  onClick={() => onChange(slotValue(day, t))}
                  className={`focus-ring min-h-11 rounded-button border text-sm font-semibold disabled:opacity-40 ${selected ? 'border-primary bg-secondary text-primary' : 'border-border bg-card text-foreground'}`}
                >
                  {slotLabel(t)}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <button type="button" onClick={() => { setCustom(true); onChange('') }} className="min-h-11 text-xs font-semibold text-primary underline">
        Need another day?
      </button>
    </div>
  )
}
