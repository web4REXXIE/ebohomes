import type { ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Clock, Info, Inbox, Loader2, MinusCircle, XCircle } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { ToneChip } from '@/components/dashboard-ui'

// Stage 18g: shared admin page patterns. Presentation only: no data access, no business rules.
// Colours come from the status tokens in app/globals.css, so they follow light and dark mode.

// Page title, one line of explanation, and an optional action button on the right.
export function AdminPageHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-bold text-foreground md:text-2xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  )
}

// One fixed colour and one fixed icon per state. The label is always real text, so colour is never the only signal.
export type AdminState = 'success' | 'pending' | 'info' | 'danger' | 'neutral'

const STATE: Record<AdminState, { tone: 'green' | 'blue' | 'amber' | 'red' | 'grey'; icon: LucideIcon }> = {
  success: { tone: 'green', icon: CheckCircle2 },
  pending: { tone: 'amber', icon: Clock },
  info: { tone: 'blue', icon: Info },
  danger: { tone: 'red', icon: XCircle },
  neutral: { tone: 'grey', icon: MinusCircle },
}

export function StatusChip({ state, children }: { state: AdminState; children: ReactNode }) {
  const { tone, icon: Icon } = STATE[state]
  return (
    <ToneChip tone={tone}>
      <Icon size={12} aria-hidden />
      {children}
    </ToneChip>
  )
}

export function LoadingState({ label = 'Loading...' }: { label?: string }) {
  return (
    <p role="status" className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
      <Loader2 size={16} className="animate-spin" aria-hidden /> {label}
    </p>
  )
}

export function EmptyState({ title, text, icon: Icon = Inbox }: { title: string; text?: string; icon?: LucideIcon }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-border p-8 text-center">
      <Icon size={24} className="mb-2 text-muted-foreground" aria-hidden />
      <p className="font-semibold text-foreground">{title}</p>
      {text && <p className="mt-1 text-sm text-muted-foreground">{text}</p>}
    </div>
  )
}

// A failed load. Shows a Try again button when the page can retry.
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-danger/30 bg-danger-soft p-3 text-sm text-danger">
      <span className="flex min-w-0 items-start gap-2">
        <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
        <span className="break-words font-medium">{message}</span>
      </span>
      {onRetry && (
        <button type="button" onClick={onRetry} className="focus-ring min-h-11 rounded-lg border border-danger/40 px-4 font-semibold hover:bg-danger/10">
          Try again
        </button>
      )}
    </div>
  )
}
