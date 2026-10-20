'use client'

import { useParams } from 'next/navigation'
import { TenancyHub } from '@/components/tenancy-hub'

export default function TenantTenancyPage() {
  const params = useParams()
  return <TenancyHub role="tenant" tenancyId={String(params?.id ?? '')} />
}