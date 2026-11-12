'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Check, Home as HomeIcon, Loader2, User } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { safeNextPath } from '@/lib/tenant-verification'
import { AuthShell } from '@/components/auth/auth-shell'
import { Button } from '@/components/ui/button'

// Where Google sign-in lands. It waits for the sign-in to finish, then sends the person on.
// - A person who already has a profile goes straight to the page they came from (?next=) or their starting page.
// - A brand new Google account is first asked "How will you use EboHomes?" (tenant or landlord).
//   No profile is created until they choose, so leaving the page and coming back asks again.
// - After the choice, the same rules as the password sign-up apply: a landlord goes to Verification,
//   a new tenant is offered ID verification (they can skip it).
// Only paths inside EboHomes are accepted for ?next=.
// Only EboHomes can mark an account verified, so new profiles always start unverified.

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

type Role = 'tenant' | 'landlord'
type GoogleUser = { id: string; user_metadata?: Record<string, any> }

const ROLES: { value: Role; label: string; desc: string; next: string; icon: typeof User }[] = [
  {
    value: 'tenant',
    label: "I'm a tenant",
    desc: 'Find and rent a home',
    next: 'Before you apply for a property, EboHomes asks for a photo of your ID and a selfie, so every landlord knows tenants are real people.',
    icon: User,
  },
  {
    value: 'landlord',
    label: "I'm a landlord",
    desc: 'List properties for rent',
    next: 'Send your ID and a selfie. EboHomes reviews them before you can list a property.',
    icon: HomeIcon,
  },
]

function Continue() {
  const router = useRouter()
  const params = useSearchParams()
  const [failed, setFailed] = useState('')
  const [stage, setStage] = useState<'loading' | 'choose'>('loading')
  const [role, setRole] = useState<Role | ''>('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const userRef = useRef<GoogleUser | null>(null)
  const nextRef = useRef<string | null>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const goNextRef = useRef<(userId: string, justCreated: boolean) => Promise<void>>(async () => {})

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      // Google can send back an error (for example the person cancelled).
      if (params.get('error') || params.get('error_description')) {
        setFailed('Google sign-in was not completed. Please try again or log in with your email.')
        return
      }

      // The sign-in finishes in the background. Give it a few seconds.
      let user: GoogleUser | null = null
      for (let i = 0; i < 12 && !cancelled; i++) {
        const { data } = await supabase.auth.getUser()
        if (data?.user) {
          user = data.user
          break
        }
        await wait(500)
      }
      if (cancelled) return
      if (!user) {
        setFailed('We could not finish signing you in. Please try again.')
        return
      }
      userRef.current = user

      const rawNext = safeNextPath(params.get('next'))
      nextRef.current = rawNext && !rawNext.startsWith('/login') && !rawNext.startsWith('/auth/') ? rawNext : null

      // Is there already a profile? If not, this is a brand new account and needs an account type.
      const { data: existing } = await supabase.from('profiles').select('id').eq('id', user.id).maybeSingle()
      if (cancelled) return

      if (!existing) {
        setStage('choose')
        return
      }
      await goNext(user.id, false)
    }

    // Sends the person to the right page for their profile.
    const goNext = async (userId: string, justCreated: boolean) => {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role, verification_status')
        .eq('id', userId)
        .maybeSingle()
      if (cancelled) return

      if (profile?.role === 'landlord') {
        const verified = ['verified', 'approved'].includes(profile.verification_status ?? '')
        router.replace(verified ? (nextRef.current ?? '/dashboard') : '/dashboard/verify')
        return
      }
      if (justCreated) {
        router.replace(`/verify-account?next=${encodeURIComponent(nextRef.current ?? '/search')}`)
        return
      }
      router.replace(nextRef.current ?? '/')
    }

    goNextRef.current = goNext

    run().catch(() => {
      if (!cancelled) setFailed('Something went wrong while signing you in. Please try again.')
    })
    return () => {
      cancelled = true
    }
  }, [params, router])

  // When the choice screen opens, move focus to its heading so screen readers announce it.
  useEffect(() => {
    if (stage === 'choose') headingRef.current?.focus()
  }, [stage])

  const confirmRole = async () => {
    const user = userRef.current
    if (!user || !role || saving) return
    setSaving(true)
    setSaveError('')

    const meta = user.user_metadata ?? {}
    const { error } = await supabase.from('profiles').upsert(
      {
        id: user.id,
        full_name: meta.full_name ?? meta.name ?? null,
        role,
        phone: null,
        verified: false,
        verification_status: null,
      },
      { onConflict: 'id', ignoreDuplicates: true },
    )

    if (error) {
      console.error('Could not create profile:', error.message)
      setSaveError('We could not save your choice. Please check your connection and try again.')
      setSaving(false)
      return
    }

    // If a profile appeared in the meantime (for example from another tab), the one that exists is used.
    await goNextRef.current(user.id, true)
  }

  if (failed) {
    return (
      <div role="alert" className="text-center">
        <h1 className="mb-2 text-h2 font-bold text-foreground">Sign-in did not finish</h1>
        <p className="mb-6 text-body text-muted-foreground">{failed}</p>
        <Link
          href="/login"
          className="focus-ring inline-flex min-h-12 w-full items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"
        >
          Back to log in
        </Link>
      </div>
    )
  }

  if (stage === 'choose') {
    const selected = ROLES.find((r) => r.value === role)
    return (
      <div>
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="mb-1 text-h3 font-semibold text-foreground outline-none"
        >
          How will you use EboHomes?
        </h1>
        <p className="mb-4 text-body text-muted-foreground">
          This decides your next step. Pick the one that fits you best.
        </p>

        <div role="radiogroup" aria-label="Account type" className="mb-4 space-y-3">
          {ROLES.map((r) => {
            const on = role === r.value
            return (
              <button
                key={r.value}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => {
                  setRole(r.value)
                  setSaveError('')
                }}
                className={`flex min-h-[4.5rem] w-full items-center gap-4 rounded-card border-2 p-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                  on ? 'border-primary bg-primary/5' : 'border-border bg-card hover:bg-secondary'
                }`}
              >
                <span
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg ${
                    on ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
                  }`}
                >
                  <r.icon size={22} aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-body font-semibold text-foreground">{r.label}</span>
                  <span className="block text-caption text-muted-foreground">{r.desc}</span>
                </span>
                <span
                  aria-hidden
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${
                    on ? 'border-primary bg-primary text-primary-foreground' : 'border-border'
                  }`}
                >
                  {on && <Check size={14} />}
                </span>
              </button>
            )
          })}
        </div>

        {selected && (
          <p className="mb-4 rounded-control bg-cream px-3 py-2.5 text-caption text-cream-foreground" role="status">
            <span className="font-semibold">What happens next: </span>
            {selected.next}
          </p>
        )}

        {saveError && (
          <p role="alert" className="mb-4 rounded-control border border-destructive/30 px-3 py-2.5 text-caption font-medium text-destructive">
            {saveError}
          </p>
        )}

        <Button type="button" size="lg" onClick={confirmRole} disabled={!role || saving} loading={saving} className="w-full">
          {saving ? 'Please wait...' : 'Continue'}
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center py-10 text-center" role="status">
      <Loader2 size={28} className="mb-4 animate-spin text-primary" aria-hidden />
      <p className="text-body font-semibold text-foreground">Signing you in...</p>
      <p className="text-sm text-muted-foreground">This only takes a moment.</p>
    </div>
  )
}

export default function AuthContinuePage() {
  return (
    <AuthShell>
      <Suspense fallback={null}>
        <Continue />
      </Suspense>
    </AuthShell>
  )
}
