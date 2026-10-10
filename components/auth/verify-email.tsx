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
}

export function VerifyEmail({
  email,
  justCreated,
  onVerified,
  onContinue,
  onBack,
  continueLabel = 'Continue to EboHomes',
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
      <div className="text-center py-4">
        <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-5">
          <CheckCircle2 size={44} className="text-primary" />
        </div>
        <h2 className="text-2xl font-bold text-foreground mb-2">Email verified successfully</h2>
        <p className="text-sm text-muted-foreground mb-8">
          Your account is ready. Welcome to EboHomes.
        </p>
        <Button onClick={onContinue} className="w-full py-2.5 font-semibold">
          {continueLabel}
        </Button>
      </div>
    )
  }

  return (
    <div className="text-center">
      <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-5">
        {justCreated ? (
          <CheckCircle2 size={44} className="text-primary" />
        ) : (
          <Mail size={36} className="text-primary" />
        )}
      </div>
      <h2 className="text-2xl font-bold text-foreground mb-2">
        {justCreated ? 'Account created successfully' : 'Verify your email'}
      </h2>
      <p className="text-sm text-muted-foreground mb-1">
        {justCreated
          ? "We've sent a 6-digit verification code to"
          : 'Your email is not verified yet. Enter the 6-digit code we sent to'}
      </p>
      <p className="text-sm font-medium text-foreground mb-6 break-all">{email}</p>

      <OtpInput value={code} onChange={setCode} disabled={verifying} error={!!error} autoFocus />

      <div className="min-h-[44px] mt-3" aria-live="polite">
        {error && <p className="text-sm text-destructive">{error}</p>}
        {!error && info && <p className="text-sm text-primary">{info}</p>}
      </div>

      <Button
        onClick={verify}
        disabled={code.length !== 6 || verifying}
        className="w-full py-2.5 font-semibold mt-2"
      >
        {verifying ? (
          <>
            <Loader2 size={16} className="animate-spin" /> Verifying...
          </>
        ) : (
          'Verify email'
        )}
      </Button>

      <p className="text-sm text-muted-foreground mt-5">
        Didn&apos;t get the code?{' '}
        {seconds > 0 ? (
          <span>Resend in {seconds}s</span>
        ) : (
          <button
            type="button"
            onClick={() => sendCode()}
            disabled={resending}
            className="text-primary font-semibold hover:underline disabled:opacity-60"
          >
            {resending ? 'Sending...' : 'Resend code'}
          </button>
        )}
      </p>
      <button
        type="button"
        onClick={onBack}
        className="text-xs text-muted-foreground hover:text-foreground mt-3"
      >
        Use a different email
      </button>
    </div>
  )
}