'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CheckCircle2, KeyRound, Lock, Mail } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useCountdown } from '@/lib/use-countdown'
import { OtpInput } from '@/components/auth/otp-input'
import { AuthShell } from '@/components/auth/auth-shell'
import { AuthField, PasswordField, AuthAlert, AuthStepper } from '@/components/auth/auth-fields'
import { Button } from '@/components/ui/button'

const RESEND_SECONDS = 60
type Step = 'email' | 'code' | 'password' | 'done'

export default function ForgotPasswordPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const { seconds, start } = useCountdown(0)

  // Step 1: send the reset code
  const sendCode = async (isResend = false) => {
    const clean = email.trim().toLowerCase()
    if (!/^\S+@\S+\.\S+$/.test(clean)) {
      setError('Enter a valid email address.')
      return
    }
    setLoading(true)
    setError('')
    setInfo('')
    const { error } = await supabase.auth.resetPasswordForEmail(clean)
    setLoading(false)
    if (error && /rate|seconds|too many/i.test(error.message)) {
      setError('Please wait a moment before requesting another code.')
      start(RESEND_SECONDS)
      return
    }
    setEmail(clean)
    start(RESEND_SECONDS)
    setStep('code')
    if (isResend) setInfo('If that email has an account, a new code is on its way.')
  }

  // Step 2: verify the code
  const verifyCode = async () => {
    if (code.length !== 6 || loading) return
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.verifyOtp({ email, token: code, type: 'recovery' })
    setLoading(false)
    if (error) {
      setError('That code is incorrect or has expired. Check it, or request a new one.')
      setCode('')
      return
    }
    setStep('password')
  }

  // Step 3: set the new password, then sign out
  const savePassword = async () => {
    if (password.length < 8) {
      setError('Use at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('The two passwords do not match.')
      return
    }
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setLoading(false)
      setError(
        /different|same/i.test(error.message)
          ? 'Choose a password you have not used before.'
          : "We couldn't change your password. Please try again."
      )
      return
    }
    await supabase.auth.signOut()
    setLoading(false)
    setStep('done')
  }

  const RESET_STEPS = ['Email', 'Code', 'New password']
  const stepNumber = step === 'email' ? 1 : step === 'code' ? 2 : 3
  const iconWrap = 'mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10'

  return (
    <AuthShell>
      {step !== 'done' && <AuthStepper steps={RESET_STEPS} current={stepNumber} />}

      {step === 'email' && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            sendCode()
          }}
          className="space-y-4"
        >
          <div className="text-center">
            <div className={iconWrap}>
              <KeyRound size={30} className="text-primary" aria-hidden />
            </div>
            <h1 className="mb-1 text-h2 font-bold text-foreground">Reset your password</h1>
            <p className="text-body text-muted-foreground">Enter your email and we will send you a 6-digit code.</p>
          </div>

          <AuthField
            label="Email address"
            icon={Mail}
            type="email"
            name="email"
            inputMode="email"
            autoComplete="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />

          {error && <AuthAlert>{error}</AuthAlert>}

          <Button type="submit" size="lg" disabled={loading || !email} loading={loading} className="w-full">
            {loading ? 'Sending...' : 'Send reset code'}
          </Button>
        </form>
      )}

      {step === 'code' && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            verifyCode()
          }}
          className="text-center"
        >
          <div className={iconWrap}>
            <Mail size={30} className="text-primary" aria-hidden />
          </div>
          <h1 className="mb-1 text-h2 font-bold text-foreground">Check your email</h1>
          <p className="mb-1 text-body text-muted-foreground">If an account exists, we sent a 6-digit code to</p>
          <p className="mb-6 break-all text-body font-semibold text-foreground">{email}</p>

          <OtpInput value={code} onChange={setCode} disabled={loading} error={!!error} autoFocus />

          <div className="mt-3 min-h-[44px]" aria-live="polite">
            {error && <p role="alert" className="text-body text-destructive">{error}</p>}
            {!error && info && <p className="text-body text-primary">{info}</p>}
          </div>

          <Button type="submit" size="lg" disabled={code.length !== 6 || loading} loading={loading} className="mt-2 w-full">
            {loading ? 'Verifying...' : 'Verify code'}
          </Button>

          <p className="mt-5 text-body text-muted-foreground">
            Didn&apos;t get it? Check your spam folder.{' '}
            {seconds > 0 ? (
              <span>Resend in {seconds}s</span>
            ) : (
              <button
                type="button"
                onClick={() => sendCode(true)}
                disabled={loading}
                className="inline-flex min-h-11 items-center font-semibold text-primary hover:underline focus-ring disabled:opacity-60"
              >
                Resend code
              </button>
            )}
          </p>
          <button
            type="button"
            onClick={() => {
              setStep('email')
              setCode('')
              setError('')
              setInfo('')
            }}
            className="mt-1 inline-flex min-h-11 items-center text-body text-muted-foreground hover:text-foreground focus-ring"
          >
            Use a different email
          </button>
        </form>
      )}

      {step === 'password' && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            savePassword()
          }}
          className="space-y-4"
        >
          <div className="text-center">
            <div className={iconWrap}>
              <KeyRound size={30} className="text-primary" aria-hidden />
            </div>
            <h1 className="mb-1 text-h2 font-bold text-foreground">Create a new password</h1>
            <p className="text-body text-muted-foreground">Your code was accepted. Choose a new password.</p>
          </div>

          <PasswordField
            label="New password"
            noun="new password"
            icon={Lock}
            name="new-password"
            autoComplete="new-password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="New password"
            hint="Use at least 8 characters."
          />
          <PasswordField
            label="Confirm new password"
            noun="confirmed password"
            icon={Lock}
            name="confirm-password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Type it again"
            error={confirm.length > 0 && password !== confirm ? 'The two passwords do not match.' : undefined}
          />

          {error && <AuthAlert>{error}</AuthAlert>}

          <Button type="submit" size="lg" disabled={loading || !password || !confirm} loading={loading} className="w-full">
            {loading ? 'Saving...' : 'Change password'}
          </Button>
        </form>
      )}

      {step === 'done' && (
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-success-soft">
            <CheckCircle2 size={36} className="text-success" aria-hidden />
          </div>
          <h1 className="mb-1 text-h2 font-bold text-foreground">Password changed</h1>
          <p className="mb-6 text-body text-muted-foreground">Log in with your new password.</p>
          <Button onClick={() => router.push('/login')} size="lg" className="w-full">
            Back to login
          </Button>
        </div>
      )}

      {step !== 'done' && (
        <p className="mt-6 text-center text-body text-muted-foreground">
          Remembered it?{' '}
          <Link href="/login" className="inline-flex min-h-11 items-center font-semibold text-primary hover:underline focus-ring">
            Log in
          </Link>
        </p>
      )}
    </AuthShell>
  )
}
