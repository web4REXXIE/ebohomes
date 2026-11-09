import { TenantAccountShell } from '@/components/tenant-account-shell'

// The tenant dashboard frame lives in components/tenant-account-shell.tsx so /tenancies can share it.
export default function HomeLayout({ children }: { children: React.ReactNode }) {
  return <TenantAccountShell>{children}</TenantAccountShell>
}
