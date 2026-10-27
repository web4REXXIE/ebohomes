import { TenancyList } from '@/components/tenancy-list'

// The landlord's list of tenancies. The dashboard layout supplies the navigation and the landlord check.
// Each row links to /dashboard/tenancies/[id], which checks that the tenancy belongs to this landlord.
export default function LandlordTenanciesPage() {
  return <TenancyList role="landlord" />
}