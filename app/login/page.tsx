'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Mail, Lock, Phone, User, Home as HomeIcon, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'
import { getSiteUrl } from '@/lib/site-url'
import { safeNextPath } from '@/lib/tenant-verification'
import { VerifyEmail } from '@/components/auth/verify-email'
import { AuthShell } from '@/components/auth/auth-shell'
import { AuthField, PasswordField, AuthAlert, AuthStepper } from '@/components/auth/auth-fields'
import { PasswordChecklist } from '@/components/auth/password-checklist'

// Sign-up and login.
// New: the ?redirect= link is honoured (it was ignored before), so people return to the page they came from.
// New: new tenants are no longer saved as "approved". Verification is decided by EboHomes.
// New: after a new tenant confirms their email they are offered ID verification (they can skip it).
// Same as before: Supabase sign-up, email code, profile creation and the landlord verification redirect.

const ROLES = [
  {
    value: 'tenant',
    label: "I'm a tenant",
    desc: 'Find and rent a home',
    next: 'Confirm your email. Before you apply for a property, EboHomes asks for a photo of your ID and a selfie, so every landlord knows tenants are real people.',
    icon: User,
  },
  {
    value: 'landlord',
    label: "I'm a landlord",
    desc: 'List properties for rent',
    next: 'Confirm your email, then send your ID and a selfie. EboHomes reviews them before you can list a property.',
    icon: HomeIcon,
  },
]

export default function LoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [isSignup, setIsSignup] = useState(searchParams.get('mode') === 'signup')
  const [signupStep, setSignupStep] = useState(1) // 1: Account, 2: Role (3 is the email code screen)

  // Account fields
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  // Role
  const [role, setRole] = useState('')

  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  // Email verification step (OTP). null = not verifying.
  const [verifyEmail, setVerifyEmail] = useState<{ email: string; justCreated: boolean } | null>(null)

  const roleHeadingRef = useRef<HTMLHeadingElement>(null)

  // Where to send the person after they log in. Only paths inside EboHomes are accepted.
  const rawNext = safeNextPath(searchParams.get('redirect'))
  const nextPath = rawNext && !rawNext.startsWith('/login') ? rawNext : null

  useEffect(() => {
    setIsSignup(searchParams.get('mode') === 'signup')
  }, [searchParams])

  // When the role step opens, move focus to its heading so screen readers announce it.
  useEffect(() => {
    if (signupStep === 2) roleHeadingRef.current?.focus()
  }, [signupStep])

  // Password validation
  const passwordChecks = {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
  }
  const passwordValid = Object.values(passwordChecks).every(Boolean)
  const passwordsMatch = password.length > 0 && password === confirmPassword

  // Step 1 -> Step 2
  const handleStep1Continue = (e: React.FormEvent) => {
    e.preventDefault()
    setMessage('')
    if (!fullName.trim() || !phone.trim() || !email.trim() || !password || !confirmPassword) {
      setMessage('Please fill in all fields.')
      return
    }
    if (phone.replace(/\D/g, '').length < 10) {
      setMessage('Please enter a valid phone number, for example 0801 234 5678.')
      return
    }
    if (!passwordValid) {
      setMessage('Please meet all password requirements.')
      return
    }
    if (!passwordsMatch) {
      setMessage('Passwords do not match.')
      return
    }
    setSignupStep(2)
  }

  // Step 2 -> create account (documents are submitted later, on the verification pages)
  const handleStep2Continue = () => {
    if (!role) {
      setMessage('Please choose how you will use EboHomes.')
      return
    }
    setMessage('')
    completeSignup()
  }

  // Creates the profile row from the auth metadata. Safe to call repeatedly:
  // an existing profile is never overwritten.
  // Tenants start with no verification result. Only EboHomes can mark an account verified.
  const ensureProfile = async (user: { id: string; user_metadata?: Record<string, any> }) => {
    const meta = user.user_metadata ?? {}
    const userRole = meta.role === 'landlord' ? 'landlord' : 'tenant'
    await supabase.from('profiles').upsert(
      {
        id: user.id,
        full_name: meta.full_name ?? null,
        role: userRole,
        phone: meta.phone ?? null,
        verified: false,
        verification_status: null,
      },
      { onConflict: 'id', ignoreDuplicates: true }
    )
  }

  const redirectAfterAuth = async (userId: string, justCreated = false) => {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, verification_status')
      .eq('id', userId)
      .single()

    if (profile?.role === 'landlord') {
      const verified = ['verified', 'approved'].includes(profile.verification_status ?? '')
      router.push(verified ? (nextPath ?? '/dashboard') : '/dashboard/verify')
      return
    }

    // A brand new tenant is offered ID verification straight away. They can skip it there.
    if (justCreated) {
      router.push(`/verify-account?next=${encodeURIComponent(nextPath ?? '/search')}`)
      return
    }
    router.push(nextPath ?? '/')
  }

  const completeSignup = async () => {
    setLoading(true)
    setMessage('')
    const cleanEmail = email.trim().toLowerCase()
    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: { data: { full_name: fullName.trim(), role, phone: phone.trim() } },
    })
    setLoading(false)

    if (error) {
      setMessage(error.message)
      return
    }
    // Supabase hides duplicate emails by returning a user with no identities
    if (data.user && data.user.identities?.length === 0) {
      setMessage('An account with this email already exists. Please log in instead.')
      return
    }
    setVerifyEmail({ email: cleanEmail, justCreated: true })
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')
    const cleanEmail = email.trim().toLowerCase()
    const { data, error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password })
    if (error) {
      if (error.code === 'email_not_confirmed' || /not confirmed/i.test(error.message)) {
        setVerifyEmail({ email: cleanEmail, justCreated: false })
      } else {
        setMessage(
          /invalid login/i.test(error.message) ? 'Incorrect email or password.' : error.message
        )
      }
      setLoading(false)
      return
    }
    // Covers users who verified their email but never got a profile row
    await ensureProfile(data.user)
    await redirectAfterAuth(data.user.id)
    setLoading(false)
  }

  const handleGoogleAuth = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${getSiteUrl()}/` },
    })
  }

  // Switching between log in and sign up keeps the page the person came from.
  const switchMode = (toSignup: boolean) => {
    const q = nextPath ? `redirect=${encodeURIComponent(nextPath)}` : ''
    if (toSignup) router.push(`/login?mode=signup${q ? `&${q}` : ''}`)
    else router.push(q ? `/login?${q}` : '/login')
    setSignupStep(1)
    setMessage('')
  }

  const SIGNUP_STEPS = ['Account', 'Role', 'Verify email']
  const isSuccessMessage = message.includes('created')
  const selectedRole = ROLES.find((r) => r.value === role)

  return (
    <AuthShell>
      {verifyEmail ? (
        <>
          {isSignup && verifyEmail.justCreated && <AuthStepper steps={SIGNUP_STEPS} current={3} />}
          <VerifyEmail
            email={verifyEmail.email}
            justCreated={verifyEmail.justCreated}
            nextStep={
              role === 'landlord'
                ? 'Next: you will be asked for your ID and a selfie so EboHomes can review your identity.'
                : role === 'tenant'
                  ? 'Next: you can verify your ID so you are ready to apply. You can also do that later.'
                  : undefined
            }
            onVerified={async () => {
              const { data } = await supabase.auth.getUser()
              if (data.user) await ensureProfile(data.user)
            }}
            onContinue={async () => {
              const { data } = await supabase.auth.getUser()
              if (data.user) await redirectAfterAuth(data.user.id, verifyEmail.justCreated)
              else router.push('/')
            }}
            onBack={() => {
              setVerifyEmail(null)
              setSignupStep(1)
              setMessage('')
            }}
          />
        </>
      ) : isSignup ? (
        <>
          <h1 className="mb-1 text-h2 font-bold text-foreground">Create your account</h1>
          <p className="mb-6 text-body text-muted-foreground">Three short steps. Takes about two minutes.</p>

          <AuthStepper steps={SIGNUP_STEPS} current={signupStep} />

          {/* STEP 1: account details */}
          {signupStep === 1 && (
            <form onSubmit={handleStep1Continue} className="space-y-4" noValidate>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <AuthField
                  label="Full name"
                  icon={User}
                  name="name"
                  autoComplete="name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Your full name"
                  hint="Use the name on your ID."
                  required
                />
                <AuthField
                  label="Phone number"
                  icon={Phone}
                  type="tel"
                  name="tel"
                  autoComplete="tel"
                  inputMode="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="0801 234 5678"
                  required
                />
              </div>

              <AuthField
                label="Email address"
                icon={Mail}
                type="email"
                name="email"
                autoComplete="email"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                hint="We will send a 6-digit code to this address."
                required
              />

              <div>
                <PasswordField
                  label="Password"
                  icon={Lock}
                  name="new-password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Create a password"
                  required
                />
                <div className="mt-2" aria-live="polite">
                  <PasswordChecklist password={password} />
                </div>
              </div>

              <PasswordField
                label="Confirm password"
                icon={Lock}
                name="confirm-password"
                autoComplete="new-password"
                noun="confirmed password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Type the password again"
                error={confirmPassword.length > 0 && !passwordsMatch ? 'Passwords do not match.' : undefined}
                required
              />

              {message && <AuthAlert>{message}</AuthAlert>}

              <Button type="submit" size="lg" className="w-full">
                Continue
              </Button>
            </form>
          )}

          {/* STEP 2: account type */}
          {signupStep === 2 && (
            <div>
              <h2
                ref={roleHeadingRef}
                tabIndex={-1}
                className="mb-1 text-h3 font-semibold text-foreground outline-none"
              >
                How will you use EboHomes?
              </h2>
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
                        setMessage('')
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

              {selectedRole && (
                <p className="mb-4 rounded-control bg-cream px-3 py-2.5 text-caption text-cream-foreground" role="status">
                  <span className="font-semibold">What happens next: </span>
                  {selectedRole.next}
                </p>
              )}

              {message && <AuthAlert tone={isSuccessMessage ? 'success' : 'error'} className="mb-4">{message}</AuthAlert>}

              <div className="flex gap-3">
                <Button type="button" variant="outline" size="lg" onClick={() => { setSignupStep(1); setMessage('') }} className="flex-1">
                  Back
                </Button>
                <Button type="button" size="lg" onClick={handleStep2Continue} disabled={loading} loading={loading} className="flex-1">
                  {loading ? 'Please wait...' : 'Create account'}
                </Button>
              </div>
            </div>
          )}

          <p className="mt-6 text-center text-body text-muted-foreground">
            Already have an account?{' '}
            <button type="button" onClick={() => switchMode(false)} className="inline-flex min-h-11 items-center font-semibold text-primary hover:underline focus-ring">
              Log in
            </button>
          </p>
        </>
      ) : (
        <>
          {/* LOGIN */}
          <h1 className="mb-1 text-h2 font-bold text-foreground">Welcome back</h1>
          <p className="mb-6 text-body text-muted-foreground">Log in to continue to EboHomes.</p>

          <form onSubmit={handleLogin} className="space-y-4">
            <AuthField
              label="Email address"
              icon={Mail}
              type="email"
              name="email"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />

            <div>
              <PasswordField
                label="Password"
                icon={Lock}
                name="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
              />
              <div className="mt-1 text-right">
                <Link href="/forgot-password" className="inline-flex min-h-11 items-center text-body font-semibold text-primary hover:underline focus-ring">
                  Forgot password?
                </Link>
              </div>
            </div>

            {message && <AuthAlert>{message}</AuthAlert>}

            <Button type="submit" size="lg" disabled={loading} loading={loading} className="w-full">
              {loading ? 'Please wait...' : 'Log in'}
            </Button>

            <div className="flex items-center gap-3" aria-hidden>
              <div className="h-px flex-1 bg-border" />
              <span className="text-caption text-muted-foreground">or</span>
              <div className="h-px flex-1 bg-border" />
            </div>

            <button
              type="button"
              onClick={handleGoogleAuth}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-button border border-border bg-background text-label font-semibold text-foreground transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84c-.21 1.12-.84 2.07-1.8 2.71v2.26h2.9c1.7-1.57 2.68-3.87 2.68-6.61z"/><path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.83.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.96v2.33C2.44 15.98 5.48 18 9 18z"/><path fill="#FBBC05" d="M3.95 10.7c-.18-.54-.28-1.11-.28-1.7s.1-1.16.28-1.7V4.97H.96C.35 6.17 0 7.55 0 9s.35 2.83.96 4.03l2.99-2.33z"/><path fill="#EA4335" d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0 5.48 0 2.44 2.02.96 4.97l2.99 2.33C4.66 5.17 6.65 3.58 9 3.58z"/></svg>
              Continue with Google
            </button>
          </form>

          <p className="mt-6 text-center text-body text-muted-foreground">
            New to EboHomes?{' '}
            <button type="button" onClick={() => switchMode(true)} className="inline-flex min-h-11 items-center font-semibold text-primary hover:underline focus-ring">
              Create an account
            </button>
          </p>
        </>
      )}
    </AuthShell>
  )
    }
