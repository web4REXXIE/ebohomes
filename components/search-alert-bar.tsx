'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, Check } from 'lucide-react'
import { supabase } from '@/lib/supabase'

type Filters = {
  location?: string
  propertyType?: string
  minPrice?: number | null
  maxPrice?: number | null
  bedrooms?: number | null
}

export function SearchAlertBar({ label, filters }: { label: string; filters: Filters }) {
  const router = useRouter()
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  const save = async () => {
    const { data } = await supabase.auth.getUser()
    if (!data?.user) {
      router.push('/login')
      return
    }
    setState('saving')
    const { error } = await supabase.from('property_alerts').insert({
      user_id: data.user.id,
      label,
      location: filters.location || null,
      property_type: filters.propertyType || null,
      min_price: filters.minPrice ?? null,
      max_price: filters.maxPrice ?? null,
      bedrooms: filters.bedrooms ?? null,
    })
    setState(error ? 'error' : 'saved')
  }

  return (
    <div className="mb-5 flex items-center gap-3 rounded-xl border border-border bg-card p-4">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        {state === 'saved' ? <Check size={20} /> : <Bell size={20} />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-foreground">Get alerts for this search</p>
        <p className="truncate text-xs text-muted-foreground">
          {state === 'saved'
            ? 'Alert saved. We will tell you when new matches are listed.'
            : state === 'error'
            ? 'Could not save the alert. Please try again.'
            : label}
        </p>
      </div>
      {state !== 'saved' && (
        <button
          type="button"
          onClick={save}
          disabled={state === 'saving'}
          className="shrink-0 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {state === 'saving' ? 'Saving...' : 'Set alert'}
        </button>
      )}
    </div>
  )
}