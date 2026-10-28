'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, Circle, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'

type Step = { key: string; label: string; done: boolean; note: string }

export function TenancyChecklist({ tenancyId }: { tenancyId: string }) {
  const [steps, setSteps] = useState<Step[] | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const [terms, subs, pays, hand] = await Promise.all([
        supabase.from('rental_terms').select('id').eq('tenancy_id', tenancyId).eq('status', 'signed').limit(1),
        supabase.from('payment_submissions').select('id').eq('tenancy_id', tenancyId).eq('status', 'verified').limit(1),
        supabase.from('payments').select('id').eq('tenancy_id', tenancyId).eq('status', 'confirmed').not('verified_by', 'is', null).limit(1),
        supabase.from('tenancy_handovers').select('id').eq('tenancy_id', tenancyId).eq('status', 'completed').limit(1),
      ])
      if (!alive) return

      const signed = (terms.data ?? []).length > 0
      const paid = (subs.data ?? []).length > 0 ? true : (pays.data ?? []).length > 0
      const handed = (hand.data ?? []).length > 0
      const complete = signed && paid && handed

      setSteps([
        {
          key: 'agreement',
          label: 'Agreement recorded',
          done: signed,
          note: signed ? 'The signed agreement is on record.' : 'The rental terms are not signed yet.',
        },
        {
          key: 'payment',
          label: 'Required payment verified',
          done: paid,
          note: paid
            ? 'EboHomes verified the payment.'
            : 'No payment has been verified by EboHomes yet. An uploaded receipt is not proof of payment.',
        },
        {
          key: 'handover',
          label: 'Key handover confirmed',
          done: handed,
          note: handed ? 'Both parties confirmed the handover.' : 'The handover is not complete yet.',
        },
        {
          key: 'complete',
          label: 'Rental completed',
          done: complete,
          note: complete
            ? 'Agreement, verified payment and handover are all in place.'
            : 'Completes only after the three steps above.',
        },
      ])
    })()
    return () => {
      alive = false
    }
  }, [tenancyId])

  if (!steps) {
    return (
      <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 pt-4 text-sm text-muted-foreground">
        <Loader2 size={14} className="animate-spin" aria-hidden /> Checking progress
      </div>
    )
  }

  return (
    <section className="mx-auto max-w-3xl px-4 pt-4" aria-label="Rental checklist">
      <div className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-bold text-foreground">Rental checklist</h2>
        <ul className="space-y-3">
          {steps.map((s) => (
            <li key={s.key} className="flex items-start gap-3">
              {s.done ? (
                <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-600" aria-label="Done" />
              ) : (
                <Circle size={18} className="mt-0.5 shrink-0 text-muted-foreground" aria-label="Not done" />
              )}
              <div>
                <p className="text-sm font-semibold text-foreground">{s.label}</p>
                <p className="text-xs text-muted-foreground">{s.note}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}