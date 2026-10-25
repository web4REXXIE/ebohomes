'use client'

import { Info } from 'lucide-react'
import { useOtherApplicationInProgress } from '@/lib/use-listing-activity'
import { availabilityKind, availabilityNote } from '@/lib/availability'

// One wording for "another application is in progress", used on property cards and the property page.
// Nothing is shown for a normal available property. It never shows a name, a number or any applicant detail.
//   compact: one short line for cards.   full: heading and explanation for the property page.
export function AvailabilityNote({ listingId, listingStatus = 'approved', variant = 'full', className = '' }: {
  listingId: string
  listingStatus?: string | null
  variant?: 'compact' | 'full'
  className?: string
}) {
  const other = useOtherApplicationInProgress(listingStatus === 'approved' ? listingId : null)
  const note = availabilityNote(availabilityKind(listingStatus, other))
  if (!note || note.kind !== 'other_application') return null

  if (variant === 'compact') {
    return (
      <p role="note" className={`mt-2 flex items-start gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-[11px] font-medium leading-snug text-amber-950 ${className}`}>
        <Info size={13} className="mt-0.5 shrink-0" aria-hidden />
        <span>{note.short}</span>
      </p>
    )
  }
  return (
    <div role="note" className={`flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 ${className}`}>
      <Info size={16} className="mt-0.5 shrink-0" aria-hidden />
      <div>
        <p className="font-bold">{note.title}</p>
        <p className="mt-0.5">{note.text}</p>
      </div>
    </div>
  )
}