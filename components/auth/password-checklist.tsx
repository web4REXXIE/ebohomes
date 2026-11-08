import { Check, Circle } from 'lucide-react'
import { getPasswordChecks } from '@/lib/password'

// Shows the existing password rules. The rules themselves come from lib/password and are unchanged.
export function PasswordChecklist({ password }: { password: string }) {
  const c = getPasswordChecks(password)
  const items = [
    { ok: c.length, label: 'At least 8 characters' },
    { ok: c.number, label: 'One number' },
    { ok: c.uppercase, label: 'One uppercase letter' },
    { ok: c.special, label: 'One special character' },
  ]
  return (
    <ul aria-label="Password requirements" className="grid grid-cols-1 gap-x-4 gap-y-1 min-[360px]:grid-cols-2">
      {items.map((it) => (
        <li
          key={it.label}
          className={`flex items-center gap-1.5 text-caption ${it.ok ? 'font-medium text-success' : 'text-muted-foreground'}`}
        >
          {it.ok ? <Check size={14} aria-hidden /> : <Circle size={14} aria-hidden />}
          {it.label}
          <span className="sr-only">{it.ok ? ' (met)' : ' (not met yet)'}</span>
        </li>
      ))}
    </ul>
  )
}
