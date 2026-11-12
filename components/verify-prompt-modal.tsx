'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Info } from 'lucide-react'

export type ViewerGate = 'not_submitted' | 'submitted' | 'rejected'

const COPY: Record<ViewerGate, { text: string; cta: string }> = {
  not_submitted: {
    text: 'This feature requires you to be verified. Please verify your account to continue.',
    cta: 'Verify',
  },
  submitted: {
    text: 'Your verification is being reviewed. You can apply as soon as EboHomes approves your account.',
    cta: 'View status',
  },
  rejected: {
    text: 'Your last verification was not approved. Please update your details and submit again.',
    cta: 'Update details',
  },
}

// Shown on the listing page when an unverified tenant taps Apply.
// Convenience only. The real check still happens on the apply page.
export function VerifyPromptModal({
  gate,
  listingId,
  onClose,
}: {
  gate: ViewerGate
  listingId: string
  onClose: () => void
}) {
  const router = useRouter()
  const ctaRef = useRef<HTMLButtonElement>(null)
  const copy = COPY[gate]

  useEffect(() => {
    ctaRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Verify your account"
    >
      <div
        className="w-full max-w-sm rounded-modal bg-background p-6 text-center shadow-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
          <Info size={28} className="text-primary" aria-hidden />
        </div>
        <p className="mb-6 text-sm leading-relaxed text-foreground">{copy.text}</p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-12 flex-1 items-center justify-center rounded-lg border border-border bg-background text-sm font-semibold text-foreground hover:bg-secondary"
          >
            Close
          </button>
          <button
            ref={ctaRef}
            type="button"
            onClick={() =>
              router.push(`/verify-account?next=${encodeURIComponent(`/listing/${listingId}`)}`)
            }
            className="inline-flex min-h-12 flex-1 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            {copy.cta}
          </button>
        </div>
      </div>
    </div>
  )
}
