'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { ArrowRight, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { TenancyHub } from '@/components/tenancy-hub'
import { RenewalPanel } from '@/components/renewal-panel'

type Access = 'checking' | 'owner' | 'other'

// The landlord's view of one tenancy. The record link and the renewal panel (which can send a renewal
// offer) are shown only when the signed-in user is the landlord on this tenancy. Otherwise only the hub
// is shown. The hub does its own check and says "not found" or "this is on your tenant side".
export default function LandlordTenancyPage() {
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
      const { data } = await supabase.from('tenancies').select('landlord_id').eq('id', id).maybeSingle()
      const row = data as { landlord_id: string | null } | null
      if (!alive) return
      setAccess(row && row.landlord_id === uid ? 'owner' : 'other')
    })()
    return () => { alive = false }
  }, [id, router])

  if (access === 'checking') {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="animate-spin text-primary" size={26} aria-label="Opening the tenancy" />
      </div>
    )
  }

  if (access === 'other') {
    return <TenancyHub role="landlord" tenancyId={String(params?.id ?? '')} />
  }

  return (
    <>
      <div className="mx-auto max-w-3xl px-4 pt-4">
        <Link href={`/dashboard/tenancies/${id}/record`} className="flex min-h-12 items-center justify-between rounded-xl border border-border bg-card px-4 text-sm font-semibold text-foreground hover:bg-secondary">
          See the full tenancy record
          <ArrowRight size={16} aria-hidden />
        </Link>
      </div>
      <TenancyHub role="landlord" tenancyId={String(params?.id ?? '')} />
      <RenewalPanel role="landlord" tenancyId={String(params?.id ?? '')} />
    </>
  )
}