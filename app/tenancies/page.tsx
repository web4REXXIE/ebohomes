'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { ArrowRight, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { TenancyHub } from '@/components/tenancy-hub'
import { RenewalPanel } from '@/components/renewal-panel'

// A tenant's tenancy now lives inside the rental journey (Tenancy Setup and Active Tenancy stages).
// This route keeps old links working: it forwards to the journey of the application the tenancy came from.
// Only a tenancy with no application on record (older data) still shows the classic page below.
export default function TenantTenancyPage() {
  const params = useParams()
  const router = useRouter()
  const id = String(params?.id ?? '')
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data: auth } = await supabase.auth.getUser()
      const uid = auth.user?.id
      if (uid && id) {
        const { data } = await supabase.from('tenancies').select('application_id, tenant_id').eq('id', id).maybeSingle()
        const row = data as { application_id: string | null; tenant_id: string | null } | null
        if (alive && row?.application_id && row.tenant_id === uid) {
          // Keep the address parameters. Paystack returns here with ?reference=..., and the journey needs it to check the payment.
          router.replace(`/journey/${row.application_id}${window.location.search}`)
          return
        }
      }
      if (alive) setChecking(false)
    })()
    return () => { alive = false }
  }, [id, router])

  if (checking) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="animate-spin text-primary" size={26} aria-label="Opening your rental journey" />
      </div>
    )
  }

  return (
    <>
      <div className="mx-auto max-w-3xl px-4 pt-4">
        <Link href={`/tenancies/${id}/record`} className="flex min-h-12 items-center justify-between rounded-xl border border-border bg-card px-4 text-sm font-semibold text-foreground hover:bg-secondary">
          See the full tenancy record
          <ArrowRight size={16} aria-hidden />
        </Link>
      </div>
      <TenancyHub role="tenant" tenancyId={String(params?.id ?? '')} />
      <RenewalPanel role="tenant" tenancyId={String(params?.id ?? '')} />
    </>
  )
}