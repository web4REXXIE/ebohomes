'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

// Stage B4: the buildings, compounds and estates a tenant can browse.
// A place is listed only when at least one flat is available AND its listing is live (approved).
// Everything here is read the same way the building page reads it. If a read fails, we show nothing.
export type PublicBuilding = {
  id: string
  name: string
  kind: string
  address: string | null
  cover: string | null
  toLet: number
  total: number
  fromPrice: number | null
  buildingCount: number
}

type EstateRow = { id: string; name: string; kind: string; address_text: string | null }
type UnitRow = { estate_id: string; status: string; listing_id: string | null; floor_no: number | null; group_label: string | null }
type ListingRow = { id: string; price_monthly: number | null }

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

export function usePublicBuildings(limit?: number): { items: PublicBuilding[]; loading: boolean; failed: boolean } {
  const [items, setItems] = useState<PublicBuilding[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const { data: e, error: eErr } = await supabase
          .from('estates')
          .select('id, name, kind, address_text')
          .neq('kind', 'single_house')
          .order('created_at', { ascending: false })
          .limit(60)
        if (eErr || cancelled) {
          if (eErr) setFailed(true)
          return
        }
        const estates = (e ?? []) as EstateRow[]
        if (estates.length === 0) return
        const estateIds = estates.map((x) => x.id)

        const units: UnitRow[] = []
        for (const part of chunk(estateIds, 40)) {
          const { data: u } = await supabase
            .from('units')
            .select('estate_id, status, listing_id, floor_no, group_label')
            .in('estate_id', part)
            .limit(2000)
          units.push(...((u ?? []) as UnitRow[]))
        }
        if (cancelled) return

        const listingIds = units.map((x) => x.listing_id).filter((x): x is string => !!x)
        const live = new Map<string, number | null>()
        for (const part of chunk(listingIds, 80)) {
          const { data: l } = await supabase.from('listings').select('id, price_monthly').in('id', part).eq('status', 'approved')
          for (const row of (l ?? []) as ListingRow[]) live.set(row.id, row.price_monthly)
        }
        if (cancelled) return

        // The overview photo is read on its own. If it fails, the card just has no picture.
        const covers = new Map<string, string>()
        try {
          const { data: c } = await supabase.from('estates').select('id, cover_photo_url').in('id', estateIds)
          for (const row of (c ?? []) as { id: string; cover_photo_url: string | null }[]) {
            if (typeof row.cover_photo_url === 'string' && row.cover_photo_url.startsWith('https://')) covers.set(row.id, row.cover_photo_url)
          }
        } catch {
          // no photos
        }

        const result: PublicBuilding[] = []
        for (const est of estates) {
          const mine = units.filter((u) => u.estate_id === est.id)
          const toLetUnits = mine.filter((u) => u.status === 'available' && u.listing_id && live.has(u.listing_id))
          if (toLetUnits.length === 0) continue
          const prices = toLetUnits
            .map((u) => (u.listing_id ? live.get(u.listing_id) ?? null : null))
            .filter((p): p is number => typeof p === 'number' && p > 0)
          const names = new Set(
            mine.filter((u) => u.floor_no !== null).map((u) => (u.group_label ?? '').trim()).filter((g) => g !== ''),
          )
          result.push({
            id: est.id,
            name: est.name,
            kind: est.kind,
            address: est.address_text,
            cover: covers.get(est.id) ?? null,
            toLet: toLetUnits.length,
            total: mine.length,
            fromPrice: prices.length > 0 ? Math.min(...prices) : null,
            buildingCount: names.size,
          })
        }
        result.sort((a, b) => b.toLet - a.toLet)
        if (!cancelled) setItems(limit ? result.slice(0, limit) : result)
      } catch {
        if (!cancelled) setFailed(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [limit])

  return { items, loading, failed }
}
