'use client'

import { useParams } from 'next/navigation'
import { Check } from 'lucide-react'
import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { JourneyApply } from '@/components/journey-apply'
import { STEP_ORDER, STEP_TITLE } from '@/lib/rental-journey'

// "My Rental Journey" before an application exists. Stage 1 is the application form.
// The later stages stay locked until the saved application status allows them.
export default function JourneyApplyPage() {
  const params = useParams()
  const listingId = String(params?.listingId ?? '')
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <main className="flex-1">
        <div className="mx-auto w-full max-w-5xl space-y-5 px-4 py-5 sm:px-6 sm:py-8">
          <div>
            <h1 className="text-2xl font-bold text-foreground">My Rental Journey</h1>
            <p className="text-sm text-muted-foreground">Start here. Your application is Stage 1. The next stages open as EboHomes and the landlord complete their part.</p>
          </div>
          <ol className="flex items-start gap-1" aria-label="Journey progress">
            {STEP_ORDER.map((key, i) => (
              <li key={key} className="flex min-w-0 flex-1 flex-col items-center gap-1 text-center" aria-current={i === 0 ? 'step' : undefined}>
                <span className={`flex h-9 w-9 items-center justify-center rounded-full border-2 text-sm font-bold ${i === 0 ? 'border-primary bg-card text-primary ring-4 ring-primary/25' : 'border-border bg-card text-muted-foreground'}`}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className={`text-[11px] leading-tight ${i === 0 ? 'font-bold text-primary' : 'text-muted-foreground'}`}>{STEP_TITLE[key]}</span>
              </li>
            ))}
          </ol>
          <p className="flex items-center gap-2 text-xs font-semibold text-muted-foreground"><Check size={14} className="text-primary" aria-hidden /> You are here: Stage 01, Application. Nothing is charged to apply.</p>
          <JourneyApply listingId={listingId} />
        </div>
      </main>
      <Footer />
    </div>
  )
}