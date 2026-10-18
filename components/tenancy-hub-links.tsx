'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { tenancyPath } from '@/lib/case-status'

// A short list above the existing tenancy list: one button per tenancy that opens its hub.
export function TenancyHubLinks({ role }: { role: 'tenant' | 'landlord' }) {
  const [rows, setRows] = useState<any[]>([])

  useEffect(() => {
    supabase.rpc('my_tenancies', { p_as: role }).then(({ data }) => setRows(data ?? []))
  }, [role])

  if (rows.length === 0) return null
  return (
    <div className="max-w-3xl mx-auto w-full px-4 pt-6">
      <div className="bg-card border border-border rounded-lg p-4">
        <p className="text-sm font-semibold text-foreground">Agreement, handover, repairs, disputes and deposit</p>
        <p className="text-xs text-muted-foreground mb-3">Open a tenancy to manage these.</p>
        <div className="space-y-2">
          {rows.map((t) => (
            <Link key={t.id} href={tenancyPath(role, t.id)} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm hover:bg-secondary">
              <span className="truncate">{t.title ?? 'Property'}{t.tenancy_code ? ` · ${t.tenancy_code}` : ''}</span>
              <ArrowRight size={14} />
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}