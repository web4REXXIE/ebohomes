import { TenancyList } from '@/components/tenancy-list'
import { TenancyProperties } from '@/components/tenancy-properties'
import { LandlordTenancySetup } from '@/components/landlord-tenancy-setup'

export default function LandlordTenanciesPage() {
  return (
    <>
      <LandlordTenancySetup />
      <TenancyProperties role="landlord" />
      <TenancyList role="landlord" />
    </>
  )
}