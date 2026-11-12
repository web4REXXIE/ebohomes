'use client'

import { useState } from 'react'
import Link from 'next/link'
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

type BarState = 'idle' | 'saving' | 'saved' | 'exists' | 'error'

// Saves the current search as an alert. When a matching property is approved, EboHomes sends an
// in-app notification, and also an email unless the person switched email off in their
// notification settings. There is no WhatsApp, Daily or Weekly delivery, so none is promised.
export function SearchAlertBar({ label, filters }: { label: string; filters: Filters }) {
  const router = useRouter()
  const [state, setState] = useState<BarState>('idle')

  const save = async () => {
    const { data } = await supabase.auth.getUser()
    if (!data?.user) {
      router.push('/login?redirect=/search')
      return
    }
    setState('saving')

    const row = {
      location: filters.location || null,
      property_type: filters.propertyType || null,
      min_price: filters.minPrice ?? null,
      max_price: filters.maxPrice ?? null,
      bedrooms: filters.bedrooms ?? null,
    }

    // Do not save the same alert twice.
    let q = supabase.from('property_alerts').select('id').eq('user_id', data.user.id)
    for (const [key, value] of Object.entries(row)) {
      q = value === null ? q.is(key, null) : q.eq(key, value)
    }
    const { data: existing } = await q.limit(1)
    if (existing && existing.length > 0) {
      setState('exists')
      return
    }

    const { error } = await supabase.from('property_alerts').insert({
      user_id: data.user.id,
      label,
      ...row,
    })
    setState(error ? 'error' : 'saved')
  }

  const done = state === 'saved' || state === 'exists'

  return (
    <div className="mb-5 flex items-center gap-3 rounded-xl border border-border bg-card p-4">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        {done ? <Check size={20} aria-hidden /> : <Bell size={20} aria-hidden />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-foreground">Get alerts for this search</p>
        <p className="text-xs text-muted-foreground" role="status">
          {state === 'saved'
            ? 'Alert saved. When a matching property is approved, you get a notification in EboHomes and an email.'
            : state === 'exists'
              ? 'You already have an alert for this search.'
              : state === 'error'
                ? 'Could not save the alert. Please try again.'
                : `${label}. You are notified in EboHomes and by email when a matching property is approved.`}
        </p>
        {done && (
          <>
            <Link href="/alerts" className="focus-ring mt-1 inline-flex min-h-11 items-center text-xs font-semibold text-primary">
              Manage my alerts
            </Link>
            <Link
              href="/notifications/preferences"
              className="focus-ring ml-4 mt-1 inline-flex min-h-11 items-center text-xs font-semibold text-primary"
            >
              Email settings
            </Link>
          </>
        )}
      </div>
      {!done && (
        <button
          type="button"
          onClick={save}
          disabled={state === 'saving'}
          className="min-h-11 shrink-0 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {state === 'saving' ? 'Saving...' : 'Set alert'}
        </button>
      )}
    </div>
  )
}
