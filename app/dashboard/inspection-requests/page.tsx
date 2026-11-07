'use client'

import { RemoteInspectionsManager } from '@/components/remote-inspections-manager'

// The landlord answers access requests here. The dashboard layout supplies the frame and the landlord check.
export default function LandlordInspectionRequestsPage() {
  return <RemoteInspectionsManager role="landlord" />
}
