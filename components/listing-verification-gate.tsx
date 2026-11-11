'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ShieldCheck, Clock, XCircle, HelpCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { landlordVerificationDisplay, type VerificationDisplay } from '@/lib/landlord-verification'

// Reads the landlord's verification state using the same helper as the Get Verified page.
// Fails closed: if the profile cannot be read, the state is "unknown" and listing is blocked.
export function useListingVerification() {
  const [display, setDisplay] = useState<VerificationDisplay | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data: auth } = await supabase.auth.getUser()
      if (!auth?.user) {
        if (alive) setDisplay(landlordVerificationDisplay(null))
        return
      }
      const { data } = await supabase
        .from('profiles')
        .select(
          'account_type, business_name, business_address, cac_number, representative_name, representative_role, id_document_type, id_document_url, selfie_url, ownership_doc_url, verification_status, verified, rejection_reason',
        )
        .eq('id', auth.user.id)
        .maybeSingle()
      if (alive) setDisplay(landlordVerificationDisplay(data))
    })()
    return () => {
      alive = false
    }
  }, [])

  return {
    loading: display === null,
    canList: display?.state === 'verified',
    display,
  }
}

export function VerificationGate({
  display,
  onBack,
}: {
  display: VerificationDisplay
  onBack: () => void
}) {
  const state = display.state

  const Icon = state === 'submitted' ? Clock : state === 'rejected' ? XCircle : state === 'unknown' ? HelpCircle : ShieldCheck
  const iconCls = state === 'submitted' ? 'text-warning' : state === 'rejected' ? 'text-destructive' : 'text-primary'

  const title =
    state === 'submitted'
      ? 'Your verification is being reviewed'
      : state === 'rejected'
        ? 'Your verification was not approved'
        : state === 'unknown'
          ? 'We cannot confirm your verification'
          : 'Verify your account to list a property'

  const body =
    state === 'not_submitted'
      ? 'To protect tenants, EboHomes only lists properties from verified accounts. It takes a few minutes: your details, a government ID and a selfie holding it. You can continue listing as soon as EboHomes approves you.'
      : display.detail

  const href = state === 'unknown' ? '/contact' : '/dashboard/verify'
  const label =
    state === 'submitted'
      ? 'View verification status'
      : state === 'rejected'
        ? 'Update my details'
        : state === 'unknown'
          ? 'Contact EboHomes'
          : 'Verify my account'

  return (
    <section
      role="alert"
      className="rounded-card border border-border bg-card p-6 text-center shadow-rest"
      aria-labelledby="gate-heading"
    >
      <Icon size={40} className={`mx-auto mb-3 ${iconCls}`} aria-hidden />
      <h2 id="gate-heading" className="mb-2 text-xl font-bold text-foreground">
        {title}
      </h2>
      <p className="mb-5 text-sm leading-relaxed text-muted-foreground">{body}</p>
      <Link
        href={href}
        className="inline-flex min-h-12 w-full items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        {label}
      </Link>
      <button
        type="button"
        onClick={onBack}
        className="mt-2 inline-flex min-h-11 w-full items-center justify-center text-sm font-semibold text-muted-foreground"
      >
        Back to the form
      </button>
    </section>
  )
}
