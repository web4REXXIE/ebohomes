'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { tenancyPath } from '@/lib/case-status'

// A short list above the existing tenancy list: one button per tenancy that opens its hub.
export function TenancyHubLinks({ role }: { role: 'tenant' | 'landlord' }) {
  const [rows, setRows] = useState<any[]>([])
  const [appOf, setAppOf] = useState<Record<string, string>>({})

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data } = await supabase.rpc('my_tenancies', { p_as: role })
      const list = data ?? []
      if (cancelled) return
      setRows(list)
      // Tenants only: find the application each tenancy came from so we can link to its rental journey.
      if (role === 'tenant' && list.length) {
        const { data: t } = await supabase.from('tenancies').select('id, application_id').in('id', list.map((x: any) => x.id))
        if (!cancelled) setAppOf(Object.fromEntries((t ?? []).filter((x: any) => x.application_id).map((x: any) => [x.id, x.application_id])))
      }
    })()
    return () => { cancelled = true }
  }, [role])

  if (rows.length === 0) return null
  return (
    <div className="max-w-3xl mx-auto w-full px-4 pt-6">
      <div className="bg-card border border-border rounded-lg p-4">
        <p className="text-sm font-semibold text-foreground">Agreement, handover, repairs, disputes and deposit</p>
        <p className="text-xs text-muted-foreground mb-3">Open a tenancy to manage these.</p>
        <div className="space-y-2">
          {rows.map((t) => (
            <div key={t.id} className="space-y-1">
              <Link href={tenancyPath(role, t.id)} className="flex min-h-11 items-center justify-between rounded-md border border-border px-3 py-2 text-sm hover:bg-secondary">
                <span className="truncate">{t.title ?? 'Property'}{t.tenancy_code ? ` · ${t.tenancy_code}` : ''}</span>
                <ArrowRight size={14} aria-hidden />
              </Link>
              {role === 'tenant' && appOf[t.id] && (
                <Link href={`/journey/${appOf[t.id]}`} className="inline-flex min-h-11 items-center gap-1 px-1 text-sm font-semibold text-primary hover:underline">
                  See the full rental journey <ArrowRight size={14} aria-hidden />
                </Link>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}