'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { unitState, type ViewUnit } from '@/lib/estate-view'

const Building3D = dynamic(() => import('@/components/building-3d'), {
  ssr: false,
  loading: () => <div className="h-[260px] animate-pulse rounded-xl bg-secondary" />,
})

export default function Building3DPreview({ estateId, listingId }: { estateId: string; listingId: string }) {
  const [units, setUnits] = useState<ViewUnit[] | null>(null)
  const [liveIds, setLiveIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    let off = false
    ;(async () => {
      const { data, error } = await supabase
        .from('estates')
        .select('units(id, unit_label, floor_no, group_label, status, listing_id)')
        .eq('id', estateId)
        .maybeSingle()
      if (off || error || !data) return
      const us = ((data as unknown as { units: ViewUnit[] | null }).units ?? [])
      const ids = us.map((u) => u.listing_id).filter((x): x is string => !!x)
      let live = new Set<string>()
      if (ids.length > 0) {
        const { data: ls } = await supabase.from('listings').select('id').in('id', ids).eq('status', 'approved')
        live = new Set(((ls ?? []) as { id: string }[]).map((l) => l.id))
      }
      if (!off) {
        setLiveIds(live)
        setUnits(us)
      }
    })()
    return () => { off = true }
  }, [estateId])

  if (units === null) return <div className="h-[260px] animate-pulse rounded-xl bg-secondary" />
  if (units.length === 0) return null

  const current = units.find((u) => u.listing_id === listingId) ?? null
  const key = current ? (current.group_label ?? '').trim() || 'Other' : null
  const shown = key ? units.filter((u) => ((u.group_label ?? '').trim() || 'Other') === key) : units

  return (
    <div className="space-y-2">
      <Building3D
        preview
        height={260}
        units={shown}
        toneOf={(u) => (unitState(u, liveIds) === 'to_let' ? 'to_let' : 'taken')}
        selectedId={current?.id ?? null}
      />
      <Link href={`/estate/${estateId}`} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-semibold text-foreground hover:bg-secondary">
        Explore the building in 3D <ArrowRight size={15} aria-hidden />
      </Link>
    </div>
  )
}
