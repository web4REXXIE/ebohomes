import { TenancyList } from '@/components/tenancy-list'
import { LandlordTenancySetup } from '@/components/landlord-tenancy-setup'

// The landlord's list of tenancies. The dashboard layout supplies the navigation and the landlord check.
// Above the list, approved applicants who are ready for a tenancy are shown with a "Create tenancy" action.
// Each row links to /dashboard/tenancies/[id], which checks that the tenancy belongs to this landlord.
export default function LandlordTenanciesPage() {
  return (
    <>
      <LandlordTenancySetup />
      <TenancyList role="landlord" />
    </>
  )
}