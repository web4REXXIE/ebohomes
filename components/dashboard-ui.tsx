import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

// Stage 16: shared dashboard building blocks. Presentation only, no data access.
// Colours come from the status tokens in app/globals.css so they follow light and dark mode.

export type MetricTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info'

const TONE_ICON: Record<MetricTone, string> = {
  neutral: 'bg-primary/10 text-primary',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  info: 'bg-info-soft text-info',
}

// A number with a label. `value` is null when the number could not be loaded: it then shows a dash,
// never a zero, because "0" would read as a real count.
export function MetricCard({
  icon: Icon,
  label,
  hint,
  value,
  href,
  tone = 'neutral',
}: {
  icon: LucideIcon
  label: string
  hint: string
  value: number | null
  href: string
  tone?: MetricTone
}) {
  return (
    <Link
      href={href}
      className="focus-ring flex min-h-11 flex-col rounded-card border border-border bg-card p-4 shadow-rest transition-colors hover:border-primary/50"
    >
      <span className={cn('mb-3 flex h-9 w-9 items-center justify-center rounded-full', TONE_ICON[tone])}>
        <Icon size={16} aria-hidden />
      </span>
      <span className="text-2xl font-extrabold leading-none text-foreground">
        {value === null ? (
          <>
            <span aria-hidden>—</span>
            <span className="sr-only">Not available</span>
          </>
        ) : (
          value
        )}
      </span>
      <span className="mt-1.5 text-sm font-semibold text-foreground">{label}</span>
      <span className="text-xs text-muted-foreground">{hint}</span>
    </Link>
  )
}

// A status chip that never relies on colour alone: the icon slot is optional but the label is always text.
export function ToneChip({ tone, children }: { tone: 'green' | 'blue' | 'amber' | 'red' | 'grey'; children: React.ReactNode }) {
  const cls = {
    green: 'bg-success-soft text-success border-success/30',
    blue: 'bg-info-soft text-info border-info/30',
    amber: 'bg-warning-soft text-warning border-warning/30',
    red: 'bg-danger-soft text-danger border-danger/30',
    grey: 'bg-unverified-soft text-unverified border-border',
  }[tone]
  return <span className={cn('inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold', cls)}>{children}</span>
}
