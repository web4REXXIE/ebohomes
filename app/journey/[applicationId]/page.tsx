'use client'

import { useParams } from 'next/navigation'
import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { RentalJourney } from '@/components/rental-journey'
import { RentalOfferPanel } from '@/components/rental-offer-panel'

export default function TenantRentalJourneyPage() {
  const params = useParams()
  const applicationId = String(params?.applicationId ?? '')
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1">
        {/* Phase 11.7: appears only when EboHomes has sent this tenant a rental offer. */}
        <div className="mx-auto w-full max-w-4xl px-4 pt-6 empty:hidden">
          <RentalOfferPanel applicationId={applicationId} mode="tenant" />
        </div>
        <RentalJourney applicationId={applicationId} />
      </main>
      <Footer />
    </div>
  )
}
