'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

// Batched lookup of "Unit 8B, Estate name" for listing cards. Same pattern as use-inspected-ids:
// many cards ask at once, one query answers them. One-unit homes (single houses) return nothing.
export type CardUnitInfo = { unit: string; estateName: string }

const TTL_MS = 60_000
const known = new Map<string, { info: CardUnitInfo | null; at: number }>()
const queue = new Set<string>()
const listeners = new Set<() => void>()
let timer: ReturnType<typeof setTimeout> | null = null

function fresh(id: string) {
  const hit = known.get(id)
  return !!hit && Date.now() - hit.at < TTL_MS
}

async function flush() {
  timer = null
  const ids = Array.from(queue)
  queue.clear()
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100)
    const { data, error } = await supabase
      .from('units')
      .select('unit_label, listing_id, estates(name, kind)')
      .in('listing_id', chunk)
    if (error) {
      console.error('Could not load unit info:', error.message)
      continue
    }
    const found = new Map<string, CardUnitInfo>()
    for (const row of (data ?? []) as any[]) {
      const estate = Array.isArray(row.estates) ? row.estates[0] : row.estates
      if (!row.listing_id || !estate || estate.kind === 'single_house') continue
      found.set(row.listing_id as string, { unit: String(row.unit_label), estateName: String(estate.name) })
    }
    const now = Date.now()
    chunk.forEach((id) => known.set(id, { info: found.get(id) ?? null, at: now }))
  }
  listeners.forEach((notify) => notify())
}

export function useUnitInfo(listingId: string): CardUnitInfo | null {
  const [, bump] = useState(0)

  useEffect(() => {
    if (!listingId) return
    const notify = () => bump((n) => n + 1)
    listeners.add(notify)
    if (!fresh(listingId)) {
      queue.add(listingId)
      if (!timer) timer = setTimeout(flush, 30)
    }
    return () => {
      listeners.delete(notify)
    }
  }, [listingId])

  return known.get(listingId)?.info ?? null
}
