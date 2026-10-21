'use client'

import { useParams } from 'next/navigation'
import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { RentalJourney } from '@/components/rental-journey'

export default function TenantRentalJourneyPage() {
  const params = useParams()
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1">
        <RentalJourney applicationId={String(params?.applicationId ?? '')} />
      </main>
      <Footer />
    </div>
  )
}