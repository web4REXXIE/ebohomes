'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

// Asks the server one yes/no question per property: "does SOMEONE ELSE have an application in progress?"
// It uses the database function listing_application_activity. No counts, names or details come back.
// Many cards on one page are asked for in ONE request. If the function is not installed yet, or the call fails,
// the answer stays "unknown" (null) and the page simply shows nothing extra.

const TTL_MS = 60_000
const cache = new Map<string, { value: boolean; at: number }>()
const listeners = new Set<() => void>()
let queue = new Set<string>()
let timer: ReturnType<typeof setTimeout> | null = null

async function flush() {
  timer = null
  const ids = Array.from(queue)
  queue = new Set()
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100)
    try {
      const { data, error } = await supabase.rpc('listing_application_activity', { p_listing_ids: chunk })
      if (error || !Array.isArray(data)) continue
      const now = Date.now()
      const seen = new Set<string>()
      for (const row of data as { listing_id: string; other_in_progress: boolean }[]) {
        seen.add(row.listing_id)
        cache.set(row.listing_id, { value: row.other_in_progress === true, at: now })
      }
      // A property the server did not return is not open for applications, so there is nothing to say about it.
      for (const id of chunk) if (!seen.has(id)) cache.set(id, { value: false, at: now })
    } catch { /* leave unknown */ }
  }
  listeners.forEach((fn) => fn())
}

function ask(id: string) {
  queue.add(id)
  if (!timer) timer = setTimeout(flush, 30)
}

// true / false once the server answered. null while waiting, or when the answer is not available.
export function useOtherApplicationInProgress(listingId: string | null | undefined): boolean | null {
  const read = () => {
    const hit = listingId ? cache.get(listingId) : undefined
    return hit && Date.now() - hit.at < TTL_MS ? hit.value : null
  }
  const [value, setValue] = useState<boolean | null>(read)
  useEffect(() => {
    if (!listingId) return
    const update = () => setValue(read())
    listeners.add(update)
    if (read() === null) ask(listingId)
    else update()
    return () => { listeners.delete(update) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listingId])
  return value
}