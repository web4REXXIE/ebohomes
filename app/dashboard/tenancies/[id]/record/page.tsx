'use client'

import { useParams } from 'next/navigation'
import { TenancyRecordView } from '@/components/tenancy-record'

// The landlord's read-only tenancy record. It uses the same record view as the tenant route
// (app/tenancies/[id]/record). The access check is the eb_tenancy_record database function,
// which only returns the record to the tenant, the landlord or an EboHomes admin.
export default function LandlordTenancyRecordPage() {
  const params = useParams()
  return <TenancyRecordView role="landlord" tenancyId={String(params?.id ?? '')} />
}