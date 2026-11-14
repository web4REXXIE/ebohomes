'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

// Asks the server one yes/no question: "is someone completing a reservation for this property?"
// If the database function is missing or the call fails, the answer stays false and the page behaves as before.
// The database still refuses applications on a reserved property either way.
export function useListingReserved(listingId: string | null | undefined): boolean {
  const [reserved, setReserved] = useState(false)
  useEffect(() => {
    let cancelled = false
    setReserved(false)
    if (!listingId) return
    supabase
      .rpc('listing_reserved', { p_listing: listingId })
      .then(({ data, error }) => {
        if (!cancelled && !error) setReserved(data === true)
      })
    return () => {
      cancelled = true
    }
  }, [listingId])
  return reserved
}
