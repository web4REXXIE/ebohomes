
'use client'

import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, Loader2, Mail } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useCountdown } from '@/lib/use-countdown'
import { OtpInput } from '@/components/auth/otp-input'
import { Button } from '@/components/ui/button'

const RESEND_SECONDS = 60

interface VerifyEmailProps {
  email: string
  /** true right after signUp (code already sent); false when an unverified user logs in */
  justCreated: boolean
  /** Runs after the code is verified and a session exists (e.g. create profile). */
  onVerified: () => Promise<void>
  onContinue: () => void
  onBack: () => void
  continueLabel?: string
  /** Optional line shown after verification, explaining what comes next (for example landlord ID review). */
  nextStep?: string
}

export function VerifyEmail({
  email,
  justCreated,
  onVerified,
  onContinue,
  onBack,
  continueLabel = 'Continue to EboHomes',
  nextStep,
}: VerifyEmailProps) {
  const [code, setCode] = useState('')
  const [stage, setStage] = useState<'code' | 'success'>('code')
  const [verifying, setVerifying] = useState(false)
  const [resending, setResending] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const { seconds, start } = useCountdown(justCreated ? RESEND_SECONDS : 0)
  const sentOnMount = useRef(false)

  const sendCode = async (silent = false) => {
    setResending(true)
    setError('')
    setInfo('')
    const { error } = await supabase.auth.resend({ type: 'signup', email })
    setResending(false)
    if (error) {
      const limited = /rate|seconds|too many/i.test(error.message)
      setError(
        limited
          ? 'Please wait a moment before requesting another code.'
          : "We couldn't send the code. Please try again."
      )
      if (limited) start(RESEND_SECONDS)
      return
    }
    start(RESEND_SECONDS)
    if (!silent) setInfo('A new code has been sent. Check your inbox and spam folder.')
  }

  // Unverified user who tried to log in: send a fresh code automatically.
  useEffect(() => {
    if (!justCreated && !sentOnMount.current) {
      sentOnMount.current = true
      sendCode(true).then(() => setInfo('We sent a new code to your email.'))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const verify = async () => {
    if (code.length !== 6 || verifying) return
    setVerifying(true)
    setError('')
    setInfo('')
    const { error } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' })
    if (error) {
      setError(
        /expired|invalid/i.test(error.message)
          ? 'That code is incorrect or has expired. Check it, or request a new one.'
          : "We couldn't verify your code. Please try again."
      )
      setCode('')
      setVerifying(false)
      return
    }
    try {
      await onVerified()
    } catch {
      // Profile creation is retried at login; verification itself succeeded.
    }
    setVerifying(false)
    setStage('success')
  }

  if (stage === 'success') {
    return (
      <div className="py-2 text-center">
        <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-success-soft">
          <CheckCircle2 size={44} className="text-success" aria-hidden />
        </div>
        <h1 className="mb-2 text-h2 font-bold text-foreground">Email verified</h1>
        <p className="mb-2 text-body text-muted-foreground">Your account is ready. Welcome to EboHomes.</p>
        {nextStep && <p className="mb-6 rounded-control bg-cream px-3 py-2.5 text-caption text-cream-foreground">{nextStep}</p>}
        {!nextStep && <div className="mb-6" />}
        <Button onClick={onContinue} size="lg" className="w-full">
          {continueLabel}
        </Button>
      </div>
    )
  }

  return (
    <div className="text-center">
      <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
        {justCreated ? (
          <CheckCircle2 size={36} className="text-primary" aria-hidden />
        ) : (
          <Mail size={30} className="text-primary" aria-hidden />
        )}
      </div>
      <h1 className="mb-2 text-h2 font-bold text-foreground">
        {justCreated ? 'Account created. Check your email' : 'Verify your email'}
      </h1>
      <p className="mb-1 text-body text-muted-foreground">
        {justCreated
          ? "We've sent a 6-digit verification code to"
          : 'Your email is not verified yet. Enter the 6-digit code we sent to'}
      </p>
      <p className="mb-6 break-all text-body font-semibold text-foreground">{email}</p>

      <OtpInput value={code} onChange={setCode} disabled={verifying} error={!!error} autoFocus />

      <div className="min-h-[44px] mt-3" aria-live="polite">
        {error && <p role="alert" className="text-body text-destructive">{error}</p>}
        {!error && info && <p className="text-body text-primary">{info}</p>}
      </div>

      <Button
        onClick={verify}
        disabled={code.length !== 6 || verifying}
        size="lg"
        className="mt-2 w-full"
      >
        {verifying ? (
          <>
            <Loader2 size={16} className="animate-spin" /> Verifying...
          </>
        ) : (
          'Verify email'
        )}
      </Button>

      <p className="mt-5 text-body text-muted-foreground">
        Didn&apos;t get the code? Check your spam folder.{' '}
        {seconds > 0 ? (
          <span>Resend in {seconds}s</span>
        ) : (
          <button
            type="button"
            onClick={() => sendCode()}
            disabled={resending}
            className="inline-flex min-h-11 items-center font-semibold text-primary hover:underline focus-ring disabled:opacity-60"
          >
            {resending ? 'Sending...' : 'Resend code'}
          </button>
        )}
      </p>
      <button
        type="button"
        onClick={onBack}
        className="mt-1 inline-flex min-h-11 items-center text-body text-muted-foreground hover:text-foreground focus-ring"
      >
        Use a different email
      </button>
    </div>
  )
}
