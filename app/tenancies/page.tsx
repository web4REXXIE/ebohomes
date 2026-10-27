import { TenancyList } from '@/components/tenancy-list'

// The tenant's list of tenancies. The header and footer come from app/tenancies/layout.tsx.
// Each row links to /tenancies/[id], which checks that the tenancy belongs to this tenant.
export default function TenantTenanciesPage() {
  return <TenancyList role="tenant" />
}