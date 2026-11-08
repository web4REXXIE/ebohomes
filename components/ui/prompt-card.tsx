'use client'

import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * The floating card used for app-install and notification prompts.
 * Cream surface, subtle border, one gold hairline on top. No gradients, no fixed hex colours.
 * Position the wrapper yourself (each prompt sits somewhere different); this is only the card.
 */
export function PromptCard({
  icon,
  title,
  children,
  onDismiss,
  actions,
  className,
}: {
  icon: React.ReactNode
  title: string
  children: React.ReactNode
  onDismiss: () => void
  /** Buttons shown under the text, usually a primary action and a "Not now" ghost button. */
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-modal border border-border-subtle bg-surface-elevated p-card shadow-dropdown',
        className,
      )}
    >
      <span className="absolute inset-x-0 top-0 h-0.5 bg-featured" aria-hidden="true" />
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="focus-ring absolute right-1.5 top-2 flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <X size={16} aria-hidden="true" />
      </button>
      <div className="flex items-start gap-3 pr-7">
        <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-card bg-forest text-featured">
          {icon}
        </span>
        <div className="min-w-0">
          <p className="text-base font-bold leading-tight text-foreground">{title}</p>
          <p className="mt-1 text-body-sm leading-snug text-foreground-secondary">{children}</p>
        </div>
      </div>
      {actions && <div className="mt-4 flex items-center gap-2">{actions}</div>}
    </div>
  )
}
