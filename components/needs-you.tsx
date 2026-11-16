'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { ArrowRight, CheckCircle2 } from 'lucide-react'
import type { NeedsItem } from '@/lib/needs-you'

// The landlord's one list of things that need them. Rows come from lib/needs-you.ts.
// `children` is the "Still available?" card. It sits after the deadline rows (priority under 20) and before the rest.
// `dueCount` is how many properties that card is asking about, so an empty list is never shown while it has a question.
export function NeedsYou({
  items,
  partial,
  dueCount,
  onRetry,
  children,
}: {
  items: NeedsItem[]
  partial: boolean
  dueCount: number
  onRetry: () => void
  children?: ReactNode
}) {
  const urgent = items.filter((i) => i.priority < 20)
  const rest = items.filter((i) => i.priority >= 20)
  const total = items.length + (dueCount > 0 ? 1 : 0)

  const row = (i: NeedsItem, strong: boolean) => (
    <li
      key={i.key}
      className={`rounded-card border border-border border-l-4 bg-card p-4 shadow-rest ${strong ? 'border-l-warning' : 'border-l-primary'}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="min-w-0 text-base font-bold text-foreground">{i.title}</h3>
        {i.optional && (
          <span className="rounded-full border border-border px-2 py-0.5 text-xs font-semibold text-muted-foreground">Optional</span>
        )}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{i.text}</p>
      <Link
        href={i.href}
        className="focus-ring mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
      >
        {i.cta} <ArrowRight size={14} aria-hidden />
      </Link>
    </li>
  )

  return (
    <section aria-labelledby="needs-you" className="mb-6">
      <div className="mb-3 flex items-center gap-2">
        <h2 id="needs-you" className="text-lg font-bold text-foreground">Needs you</h2>
        {total > 0 && (
          <span className="rounded-full bg-primary px-2.5 py-0.5 text-xs font-bold text-primary-foreground" aria-label={`${total} things need you`}>
            {total}
          </span>
        )}
      </div>

      <ul className="space-y-3">{urgent.map((i) => row(i, true))}</ul>
      {children}
      <ul className="space-y-3">{rest.map((i) => row(i, false))}</ul>

      {items.length === 0 && dueCount === 0 && !partial && (
        <div className="rounded-card border border-dashed border-border bg-card p-5 text-center">
          <p className="flex items-center justify-center gap-2 text-sm font-semibold text-foreground">
            <CheckCircle2 size={16} className="text-primary" aria-hidden /> You are up to date
          </p>
          <p className="mt-1 text-sm text-muted-foreground">Nothing needs your action right now.</p>
          <Link href="/dashboard/listings" className="focus-ring mt-3 inline-flex min-h-11 items-center gap-1 text-xs font-semibold text-primary">
            View my properties <ArrowRight size={12} aria-hidden />
          </Link>
        </div>
      )}

      {partial && (
        <div role="status" className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-secondary p-3 text-sm text-muted-foreground">
          <span>Some items could not be checked, so this list may be incomplete.</span>
          <button onClick={onRetry} className="focus-ring min-h-11 rounded-full border border-border px-4 text-xs font-bold text-foreground">
            Try again
          </button>
        </div>
      )}
    </section>
  )
}
