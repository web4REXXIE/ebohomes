'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { ArrowRight, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { TenancyHub } from '@/components/tenancy-hub'
import { RenewalPanel } from '@/components/renewal-panel'
import { RentNoticeCard } from '@/components/rent-notice-card'

type Access = 'checking' | 'owner' | 'other'

// The tenant's view of one tenancy.
// A tenant who owns the tenancy is sent on to the rental journey of its application. The address parameters are kept,
// because Paystack returns to this route with ?reference=... If there is no application to go to, the tenancy page is
// shown here instead.
// The record link, the rent notice card and the renewal panel are shown only when the signed-in user is the tenant on
// this tenancy. Otherwise only the hub is shown. The hub does its own check and says "not found" or
// "this is on your landlord side".
export default function TenantTenancyPage() {
  const params = useParams()
  const router = useRouter()
  const id = String(params?.id ?? '')
  const [access, setAccess] = useState<Access>('checking')

  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data: auth } = await supabase.auth.getUser()
      const uid = auth.user?.id
      if (!uid) {
        if (alive) router.push('/login')
        return
      }
      const { data } = await supabase.from('tenancies').select('tenant_id, application_id').eq('id', id).maybeSingle()
      const row = data as { tenant_id: string | null; application_id: string | null } | null
      if (!alive) return
      if (row && row.tenant_id === uid) {
        if (row.application_id) {
          router.replace(`/journey/${row.application_id}${window.location.search}`)
          return
        }
        setAccess('owner')
        return
      }
      setAccess('other')
    })()
    return () => { alive = false }
  }, [id, router])

  if (access === 'checking') {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="animate-spin text-primary" size={26} aria-label="Opening your tenancy" />
      </div>
    )
  }

  if (access === 'other') {
    return <TenancyHub role="tenant" tenancyId={String(params?.id ?? '')} />
  }

  return (
    <>
      <div className="mx-auto max-w-3xl px-4 pt-4">
        <Link href={`/tenancies/${id}/record`} className="flex min-h-12 items-center justify-between rounded-xl border border-border bg-card px-4 text-sm font-semibold text-foreground hover:bg-secondary">
          See the full tenancy record
          <ArrowRight size={16} aria-hidden />
        </Link>
      </div>
      <div className="mx-auto max-w-3xl px-4 pt-3 empty:hidden">
        <RentNoticeCard role="tenant" tenancyId={id} />
      </div>
      <TenancyHub role="tenant" tenancyId={String(params?.id ?? '')} />
      <RenewalPanel role="tenant" tenancyId={String(params?.id ?? '')} />
    </>
  )
}
