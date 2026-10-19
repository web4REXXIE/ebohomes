'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

const TTL_MS = 60_000
const known = new Map<string, { inspected: boolean; at: number }>()
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
      .from('public_listing_inspections')
      .select('listing_id')
      .in('listing_id', chunk)
    if (error) {
      console.error('Could not load inspection status:', error.message)
      continue
    }
    const yes = new Set((data ?? []).map((r: any) => r.listing_id as string))
    const now = Date.now()
    chunk.forEach((id) => known.set(id, { inspected: yes.has(id), at: now }))
  }
  listeners.forEach((notify) => notify())
}

// Returns the set of listing ids that currently have a valid public inspection.
export function useInspectedIds(listingIds: string[]): Set<string> {
  const key = Array.from(new Set(listingIds.filter(Boolean))).sort().join(',')
  const [, bump] = useState(0)

  useEffect(() => {
    const ids = key ? key.split(',') : []
    const notify = () => bump((n) => n + 1)
    listeners.add(notify)
    const missing = ids.filter((id) => !fresh(id))
    if (missing.length > 0) {
      missing.forEach((id) => queue.add(id))
      if (!timer) timer = setTimeout(flush, 30)
    }
    return () => {
      listeners.delete(notify)
    }
  }, [key])

  const result = new Set<string>()
  if (key) {
    key.split(',').forEach((id) => {
      if (known.get(id)?.inspected) result.add(id)
    })
  }
  return result
}