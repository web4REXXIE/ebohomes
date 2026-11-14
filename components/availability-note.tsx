'use client'

import { useEffect, useState } from 'react'
import { Info, CalendarCheck } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { isValidListingId } from '@/lib/listing-id'
import { useOtherApplicationInProgress } from '@/lib/use-listing-activity'
import { availabilityKind, availabilityNote } from '@/lib/availability'

// Reads the date the landlord last said "still available". null if it cannot be read (the line is then simply not shown).
function useConfirmedDate(listingId: string | null): string | null {
  const [date, setDate] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!listingId || !isValidListingId(listingId)) return
      try {
        const { data, error } = await supabase
          .from('listings')
          .select('availability_confirmed_at')
          .eq('id', listingId)
          .maybeSingle()
        if (cancelled || error || !data) return
        const raw = (data as { availability_confirmed_at: string | null }).availability_confirmed_at
        const d = raw ? new Date(raw) : null
        if (!d || Number.isNaN(d.getTime())) return
        setDate(d.toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' }))
      } catch {
        // Quietly skip: the page works without this line.
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [listingId])
  return date
}

// One wording for "another application is in progress", used on property cards and the property page.
// Nothing is shown for a normal available property, except on the property page (variant full), which also shows
// the date the landlord last confirmed the property is still available.
// It never shows a name, a number or any applicant detail.
//   compact: one short line for cards.   full: heading and explanation for the property page.
export function AvailabilityNote({ listingId, listingStatus = 'approved', variant = 'full', className = '' }: {
  listingId: string
  listingStatus?: string | null
  variant?: 'compact' | 'full'
  className?: string
}) {
  const other = useOtherApplicationInProgress(listingStatus === 'approved' ? listingId : null)
  const confirmedOn = useConfirmedDate(variant === 'full' && listingStatus === 'approved' ? listingId : null)
  const note = availabilityNote(availabilityKind(listingStatus, other))
  const showOther = !!note && note.kind === 'other_application'

  if (variant === 'compact') {
    if (!showOther || !note) return null
    return (
      <p role="note" className={`mt-2 flex items-start gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-[11px] font-medium leading-snug text-amber-950 ${className}`}>
        <Info size={13} className="mt-0.5 shrink-0" aria-hidden />
        <span>{note.short}</span>
      </p>
    )
  }

  if (!showOther && !confirmedOn) return null

  return (
    <div className={`space-y-2 ${className}`}>
      {confirmedOn && (
        <p className="flex items-start gap-2 text-sm text-foreground">
          <CalendarCheck size={16} className="mt-0.5 shrink-0 text-success" aria-hidden />
          <span>Landlord confirmed this is still available on {confirmedOn}.</span>
        </p>
      )}
      {showOther && note && (
        <div role="note" className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
          <Info size={16} className="mt-0.5 shrink-0" aria-hidden />
          <div>
            <p className="font-bold">{note.title}</p>
            <p className="mt-0.5">{note.text}</p>
          </div>
        </div>
      )}
    </div>
  )
}
