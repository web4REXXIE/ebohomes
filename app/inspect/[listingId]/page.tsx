'use client'

import { use } from 'react'
import { PageShell } from '@/components/page-shell'
import { RemoteInspectionRequest } from '@/components/remote-inspection-request'

// Request a free remote inspection of one property. Not the viewing request.
export default function RequestRemoteInspectionPage({ params }: { params: Promise<{ listingId: string }> }) {
  const { listingId } = use(params)
  return (
    <PageShell>
      <RemoteInspectionRequest listingId={listingId} />
    </PageShell>
  )
}
