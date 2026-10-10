import { Check } from 'lucide-react'
import { getPasswordChecks } from '@/lib/password'

export function PasswordChecklist({ password }: { password: string }) {
  const c = getPasswordChecks(password)
  const items = [
    { ok: c.length, label: 'At least 8 characters' },
    { ok: c.number, label: 'One number' },
    { ok: c.uppercase, label: 'One uppercase letter' },
    { ok: c.special, label: 'One special character' },
  ]
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
      {items.map((it) => (
        <span
          key={it.label}
          className={`flex items-center gap-1 ${it.ok ? 'text-primary' : 'text-muted-foreground'}`}
        >
          <Check size={12} /> {it.label}
        </span>
      ))}
    </div>
  )
}