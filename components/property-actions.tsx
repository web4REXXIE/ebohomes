'use client'

import Link from 'next/link'
import { Calendar, FileText, Info, MessageCircle } from 'lucide-react'
import type { ActionButton, PropertyActions } from '@/lib/property-actions'

const base =
  'inline-flex w-full items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'
const primary = `${base} min-h-11 bg-primary text-primary-foreground hover:bg-primary/90`
const outline = `${base} min-h-11 border border-border bg-background text-foreground hover:bg-secondary`
const disabledCls = 'cursor-not-allowed opacity-50 hover:bg-transparent'

function ActionLink({
  action,
  kind,
  icon,
  short = false,
  className = '',
}: {
  action: ActionButton
  kind: 'primary' | 'outline'
  icon: React.ReactNode
  short?: boolean
  className?: string
}) {
  const cls = `${kind === 'primary' ? primary : outline} ${className}`
  const text = short ? action.shortLabel : action.label

  if (action.href === null) {
    return (
      <button type="button" disabled aria-disabled="true" className={`${cls} ${disabledCls}`}>
        {icon}
        {text}
      </button>
    )
  }
  return (
    <Link href={action.href} className={cls}>
      {icon}
      {text}
    </Link>
  )
}

// Desktop sidebar. Same decision as the mobile bar below.
export function PropertyActionsSidebar({
  actions,
  onChat,
}: {
  actions: PropertyActions
  onChat: () => void
}) {
  if (actions.ownerMessage) {
    return (
      <div role="note" className="flex items-start gap-2 rounded-lg border border-border bg-secondary p-3 text-sm text-foreground">
        <Info size={16} className="mt-0.5 shrink-0 text-primary" aria-hidden />
        <p>{actions.ownerMessage}</p>
      </div>
    )
  }

  return (
    <div>
      <button type="button" onClick={onChat} className={`${primary} mb-4`}>
        <MessageCircle size={16} aria-hidden />
        Chat with EboHomes
      </button>
      <p className="mb-1 text-caption text-muted-foreground">For general questions about this property.</p>

      <p className="mb-3 mt-4 text-sm font-semibold text-foreground">Interested?</p>

      {actions.note && (
        <p role="note" className="mb-3 rounded-lg border border-warning/25 bg-warning-soft p-3 text-caption leading-snug text-warning">
          {actions.note}
        </p>
      )}

      {actions.apply && (
        <ActionLink action={actions.apply} kind="primary" icon={<FileText size={16} aria-hidden />} />
      )}

      {actions.viewing && (
        <div className="mt-2">
          <ActionLink action={actions.viewing} kind="outline" icon={<Calendar size={16} aria-hidden />} />
          {actions.viewing.statusLine && (
            <p className="mt-1.5 text-caption leading-snug text-muted-foreground">{actions.viewing.statusLine}</p>
          )}
        </div>
      )}

      {actions.helper && (
        <p className="mt-3 text-caption leading-snug text-muted-foreground">{actions.helper}</p>
      )}

      <p className="mt-3 text-caption leading-snug text-muted-foreground">
        Arrange viewings through EboHomes. Inspect the property yourself and confirm the rent, agreement, ownership
        documents and payment arrangements before you pay.
      </p>
    </div>
  )
}

// Mobile and tablet sticky bar. Shows nothing for the listing owner.
export function PropertyActionsBar({
  actions,
  onChat,
  priceText,
}: {
  actions: PropertyActions
  onChat: () => void
  // Monthly rent from the listing, already formatted (for example "₦400,000"). Left out when not listed.
  priceText?: string | null
}) {
  if (actions.ownerMessage) return null

  const line = actions.note ?? actions.viewing?.statusLine ?? null

  return (
    <div
      className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 border-t border-border bg-background/95 px-3 pt-2.5 pb-2.5 shadow-[0_-4px_16px_rgba(10,46,26,0.10)] backdrop-blur md:bottom-0 md:pb-[calc(0.625rem+env(safe-area-inset-bottom))] lg:hidden"
      role="region"
      aria-label="Property actions"
    >
      <div className="mx-auto max-w-xl">
        {priceText && (
          <p className="mb-1.5 text-body font-bold text-foreground">
            {priceText}
            <span className="text-caption font-normal text-muted-foreground"> per month</span>
          </p>
        )}
        {line && <p className="mb-2 text-caption leading-snug text-muted-foreground">{line}</p>}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onChat}
            aria-label="Chat with EboHomes"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-primary transition hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <MessageCircle size={20} aria-hidden />
          </button>

          {actions.viewing && (
            <ActionLink
              action={actions.viewing}
              kind="outline"
              short
              icon={<Calendar size={16} aria-hidden />}
              className="h-11 flex-1 px-2 text-caption"
            />
          )}

          {actions.apply && (
            <ActionLink
              action={actions.apply}
              kind="primary"
              short
              icon={<FileText size={16} aria-hidden />}
              className="h-11 flex-[1.3] px-2"
            />
          )}
        </div>
      </div>
    </div>
  )
}
