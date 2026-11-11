'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Check, Info, Loader2 } from 'lucide-react'
import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { JourneyApply } from '@/components/journey-apply'
import { STEP_ORDER, STEP_TITLE } from '@/lib/rental-journey'
import { supabase } from '@/lib/supabase'
import { tenantVerificationState, type TenantVerificationState } from '@/lib/tenant-verification'

type Gate = 'checking' | 'open' | Exclude<TenantVerificationState, 'verified'>

// "My Rental Journey" before an application exists. Stage 1 is the application form.
// The later stages stay locked until the saved application status allows them.
// A tenant must be verified before the form opens. Everyone else sees the page as before.
export default function JourneyApplyPage() {
  const params = useParams()
  const router = useRouter()
  const listingId = String(params?.listingId ?? '')
  const [gate, setGate] = useState<Gate>('checking')

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const { data: auth } = await supabase.auth.getUser()
        // Signed out: the form itself already sends people to log in.
        if (!auth?.user) {
          if (alive) setGate('open')
          return
        }
        const { data } = await supabase
          .from('profiles')
          .select('role, id_document_type, id_document_url, selfie_url, verification_status, verified')
          .eq('id', auth.user.id)
          .maybeSingle()
        if (!alive) return
        if (data?.role && data.role !== 'tenant') {
          setGate('open')
          return
        }
        const s = tenantVerificationState(data)
        setGate(s === 'verified' ? 'open' : s)
      } catch {
        // Fail closed for tenants: show the verify message rather than an open form.
        if (alive) setGate('not_submitted')
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  const verifyHref = `/verify-account?next=${encodeURIComponent(`/journey/apply/${listingId}`)}`

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <main className="flex-1">
        <div className="mx-auto w-full max-w-5xl space-y-5 px-4 py-5 sm:px-6 sm:py-8">
          {gate === 'checking' && (
            <div className="flex items-center justify-center gap-2 py-24 text-sm text-muted-foreground" role="status">
              <Loader2 size={18} className="animate-spin text-primary" aria-hidden /> Checking your account...
            </div>
          )}

          {gate !== 'checking' && gate !== 'open' && (
            <div className="mx-auto mt-10 w-full max-w-sm rounded-2xl border border-border bg-card p-6 text-center shadow-xl" role="alert">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                <Info size={28} className="text-primary" aria-hidden />
              </div>
              <p className="mb-6 text-sm leading-relaxed text-foreground">
                {gate === 'submitted'
                  ? 'Your verification is being reviewed. You can apply as soon as EboHomes approves your account.'
                  : gate === 'rejected'
                    ? 'Your last verification was not approved. Please update your details and submit again.'
                    : 'This feature requires you to be verified. Please verify your account to continue.'}
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => router.push(`/listing/${listingId}`)}
                  className="inline-flex min-h-12 flex-1 items-center justify-center rounded-lg border border-border bg-background text-sm font-semibold text-foreground hover:bg-secondary"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => router.push(verifyHref)}
                  className="inline-flex min-h-12 flex-1 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary/90"
                >
                  {gate === 'submitted' ? 'View status' : gate === 'rejected' ? 'Update details' : 'Verify'}
                </button>
              </div>
            </div>
          )}

          {gate === 'open' && (
            <>
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
            </>
          )}
        </div>
      </main>
      <Footer />
    </div>
  )
}
