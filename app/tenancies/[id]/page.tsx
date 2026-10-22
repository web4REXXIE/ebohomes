'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowRight } from 'lucide-react'
import { TenancyHub } from '@/components/tenancy-hub'
import { RenewalPanel } from '@/components/renewal-panel'

export default function TenantTenancyPage() {
  const params = useParams()
  const id = String(params?.id ?? '')
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