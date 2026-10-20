'use client'

import { TenancyList } from '@/components/tenancy-list'
import { TenancyHubLinks } from '@/components/tenancy-hub-links'

export default function TenantTenanciesPage() {
  return (
    <>
      <TenancyHubLinks role="tenant" />
      <TenancyList role="tenant" />
    </>
  )
}