'use client'

import { useParams } from 'next/navigation'
import { TenancyHub } from '@/components/tenancy-hub'

export default function LandlordTenancyPage() {
  const params = useParams()
  return <TenancyHub role="landlord" tenancyId={String(params?.id ?? '')} />
}