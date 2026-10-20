'use client'

import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { TenancyList } from '@/components/tenancy-list'

export default function TenantTenanciesPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <main className="flex-1">
        <TenancyList role="tenant" />
      </main>
      <Footer />
    </div>
  )
}