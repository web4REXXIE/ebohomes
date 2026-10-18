'use client'

import { TenancyList } from '@/components/tenancy-list'
import { TenancyHubLinks } from '@/components/tenancy-hub-links'

export default function LandlordTenanciesPage() {
  return (
    <>
      <TenancyHubLinks role="landlord" />
      <TenancyList role="landlord" />
    </>
  )
}