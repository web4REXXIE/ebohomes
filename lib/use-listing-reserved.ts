'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

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
