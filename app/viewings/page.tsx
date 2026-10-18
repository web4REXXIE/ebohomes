'use client'

import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { ViewingsManager } from '@/components/viewings-manager'

export default function TenantViewingsPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1">
        <ViewingsManager role="tenant" />
      </main>
      <Footer />
    </div>
  )
}