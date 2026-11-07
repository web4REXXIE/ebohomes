'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ClipboardCheck } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { decideEntry, isOpen, type RequestRow } from '@/lib/remote-inspection'

// A small card on the property page. It is separate from Apply and Request a viewing, which are unchanged.
// It is also separate from the "Inspected by EboHomes" badge, which only EboHomes verification can give.
export function RemoteInspectionEntry({
  listingId,
  listingStatus,
  userId,
  isOwner,
  onHold,
  className = '',
}: {
  listingId: string
  listingStatus: string | null | undefined
  userId: string | null
  isOwner: boolean
  onHold: boolean
  className?: string
}) {
  const [open, setOpen] = useState<{ id: string; status: string } | null>(null)

  useEffect(() => {
    if (!userId || isOwner) return
    let cancelled = false
    ;(async () => {
      const { data } = await supabase.rpc('my_remote_inspection_requests')
      const rows: RequestRow[] = Array.isArray(data) ? data : []
      const mine = rows.find((r) => r.listing_id === listingId && isOpen(r.status))
      if (!cancelled) setOpen(mine ? { id: mine.id, status: mine.status } : null)
    })()
    return () => {
      cancelled = true
    }
  }, [listingId, userId, isOwner])

  const entry = decideEntry({ listingId, listingStatus, signedIn: !!userId, isOwner, onHold, openRequest: open })
  if (entry.kind === 'hidden') return null

  return (
    <div className={`rounded-xl border border-border bg-card p-4 ${className}`}>
      <div className="flex items-start gap-3">
        <ClipboardCheck size={20} className="mt-0.5 shrink-0 text-primary" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-extrabold text-foreground">Can&apos;t visit yourself?</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            Ask for a free remote inspection. An EboHomes inspector checks the property and you get a private report. The owner must allow access first.
          </p>

          {entry.kind === 'link' ? (
            <Link href={entry.href} className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-border bg-background px-3 text-sm font-semibold text-foreground hover:bg-secondary sm:w-auto">
              {entry.label}
            </Link>
          ) : (
            <button type="button" disabled aria-disabled="true" className="mt-3 inline-flex min-h-11 w-full cursor-not-allowed items-center justify-center rounded-lg border border-border px-3 text-sm font-semibold opacity-50 sm:w-auto">
              {entry.label}
            </button>
          )}

          {entry.line && <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">{entry.line}</p>}
        </div>
      </div>
    </div>
  )
}
