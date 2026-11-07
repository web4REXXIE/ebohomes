'use client'

import { PageShell } from '@/components/page-shell'
import { RemoteInspectionsManager } from '@/components/remote-inspections-manager'

// The tenant's own remote inspection requests.
export default function MyInspectionsPage() {
  return (
    <PageShell>
      <RemoteInspectionsManager role="tenant" />
    </PageShell>
  )
}
