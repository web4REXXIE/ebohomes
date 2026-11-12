'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { safeNextPath } from '@/lib/tenant-verification'
import { AuthShell } from '@/components/auth/auth-shell'

// Where Google sign-in lands. It waits for the sign-in to finish, makes sure the person has a profile,
// then sends them to the page they came from (the ?next= path) or to the right starting page.
// Only paths inside EboHomes are accepted for ?next=.
// Same rules as the password login: landlords who are not verified go to Get Verified,
// and a brand new tenant is offered ID verification (they can skip it).

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

function Continue() {
  const router = useRouter()
  const params = useSearchParams()
  const [failed, setFailed] = useState('')

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      // Google can send back an error (for example the person cancelled).
      if (params.get('error') || params.get('error_description')) {
        setFailed('Google sign-in was not completed. Please try again or log in with your email.')
        return
      }

      // The sign-in finishes in the background. Give it a few seconds.
      let user: { id: string; user_metadata?: Record<string, any> } | null = null
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

      const rawNext = safeNextPath(params.get('next'))
      const nextPath = rawNext && !rawNext.startsWith('/login') && !rawNext.startsWith('/auth/') ? rawNext : null

      // Is there already a profile? If not, this is a brand new account.
      const { data: existing } = await supabase.from('profiles').select('id').eq('id', user.id).maybeSingle()
      const justCreated = !existing

      if (justCreated) {
        const meta = user.user_metadata ?? {}
        // Google gives a name but no account type, so a new Google account starts as a tenant.
        // Only EboHomes can mark an account verified.
        await supabase.from('profiles').upsert(
          {
            id: user.id,
            full_name: meta.full_name ?? meta.name ?? null,
            role: 'tenant',
            phone: null,
            verified: false,
            verification_status: null,
          },
          { onConflict: 'id', ignoreDuplicates: true },
        )
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role, verification_status')
        .eq('id', user.id)
        .maybeSingle()
      if (cancelled) return

      if (profile?.role === 'landlord') {
        const verified = ['verified', 'approved'].includes(profile.verification_status ?? '')
        router.replace(verified ? (nextPath ?? '/dashboard') : '/dashboard/verify')
        return
      }
      if (justCreated) {
        router.replace(`/verify-account?next=${encodeURIComponent(nextPath ?? '/search')}`)
        return
      }
      router.replace(nextPath ?? '/')
    }

    run().catch(() => {
      if (!cancelled) setFailed('Something went wrong while signing you in. Please try again.')
    })
    return () => {
      cancelled = true
    }
  }, [params, router])

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
