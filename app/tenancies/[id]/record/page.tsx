'use client'

import { useParams } from 'next/navigation'
import { TenancyRecordView } from '@/components/tenancy-record'

export default function TenantTenancyRecordPage() {
  const params = useParams()
  return <TenancyRecordView role="tenant" tenancyId={String(params?.id ?? '')} />
}