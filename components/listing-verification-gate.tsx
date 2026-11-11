'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Info, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { landlordVerificationDisplay, type VerificationDisplay } from '@/lib/landlord-verification'

// Reads the landlord's verification state with the same helper the Get Verified page uses.
// It fails closed: if the profile cannot be read, the state is "unknown" and listing stays blocked.
export function useListingVerification() {
  const [display, setDisplay] = useState<VerificationDisplay | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
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
      } catch {
        if (alive) setDisplay(landlordVerificationDisplay(null))
      }
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

// The small popup shown when an unverified landlord taps Next.
export function VerificationModal({
  display,
  onClose,
}: {
  display: VerificationDisplay
  onClose: () => void
}) {
  const router = useRouter()
  const state = display.state

  // Keep the latest onClose without re-attaching the key listener on every render.
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const message =
    state === 'not_submitted'
      ? 'This feature requires you to be verified. Please verify your account to continue.'
      : state === 'submitted'
        ? 'Your verification is being reviewed. You can list a property as soon as EboHomes approves your account.'
        : state === 'rejected'
          ? 'Your last verification was not approved. Please update your details and submit again.'
          : 'We could not confirm your verification. Please contact EboHomes.'

  const href = state === 'unknown' ? '/contact' : '/dashboard/verify'
  const label =
    state === 'submitted'
      ? 'View status'
      : state === 'rejected'
        ? 'Update details'
        : state === 'unknown'
          ? 'Contact us'
          : 'Verify'

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 px-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="verify-modal-text"
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-sm rounded-2xl bg-card p-6 text-center shadow-xl"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary"
        >
          <X size={20} aria-hidden />
        </button>

        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
          <Info size={28} className="text-primary" aria-hidden />
        </div>

        <p id="verify-modal-text" className="mb-6 text-sm leading-relaxed text-foreground">
          {message}
        </p>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-12 flex-1 items-center justify-center rounded-lg border border-border bg-background text-sm font-semibold text-foreground hover:bg-secondary"
          >
            Close
          </button>
          <button
            type="button"
            onClick={() => router.push(href)}
            className="inline-flex min-h-12 flex-1 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            {label}
          </button>
        </div>
      </div>
    </div>
  )
}
