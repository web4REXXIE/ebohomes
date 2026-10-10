'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Eye, EyeOff, KeyRound, Loader2, Mail } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useCountdown } from '@/lib/use-countdown'
import { OtpInput } from '@/components/auth/otp-input'
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
  const [showPassword, setShowPassword] = useState(false)
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

  const iconWrap = 'w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-5'
  const inputCls =
    'w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/40'

  return (
    <main className="min-h-[70vh] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md text-center">
        {step === 'email' && (
          <>
            <div className={iconWrap}>
              <KeyRound size={36} className="text-primary" />
            </div>
            <h1 className="text-2xl font-bold text-foreground mb-2">Reset your password</h1>
            <p className="text-sm text-muted-foreground mb-6">
              Enter your email and we&apos;ll send you a 6-digit code.
            </p>
            <div className="relative mb-2 text-left">
              <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendCode()}
                placeholder="Enter your email address"
                className={`${inputCls} pl-11`}
              />
            </div>
            <div className="min-h-[28px]" aria-live="polite">
              {error && <p className="text-sm text-destructive text-left">{error}</p>}
            </div>
            <Button onClick={() => sendCode()} disabled={loading || !email} className="w-full py-2.5 font-semibold">
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> Sending...
                </>
              ) : (
                'Send reset code'
              )}
            </Button>
          </>
        )}

        {step === 'code' && (
          <>
            <div className={iconWrap}>
              <Mail size={36} className="text-primary" />
            </div>
            <h1 className="text-2xl font-bold text-foreground mb-2">Check your email</h1>
            <p className="text-sm text-muted-foreground mb-1">If an account exists, we sent a 6-digit code to</p>
            <p className="text-sm font-medium text-foreground mb-6 break-all">{email}</p>
            <OtpInput value={code} onChange={setCode} disabled={loading} error={!!error} autoFocus />
            <div className="min-h-[44px] mt-3" aria-live="polite">
              {error && <p className="text-sm text-destructive">{error}</p>}
              {!error && info && <p className="text-sm text-primary">{info}</p>}
            </div>
            <Button onClick={verifyCode} disabled={code.length !== 6 || loading} className="w-full py-2.5 font-semibold mt-2">
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> Verifying...
                </>
              ) : (
                'Verify code'
              )}
            </Button>
            <p className="text-sm text-muted-foreground mt-5">
              Didn&apos;t get it?{' '}
              {seconds > 0 ? (
                <span>Resend in {seconds}s</span>
              ) : (
                <button
                  type="button"
                  onClick={() => sendCode(true)}
                  disabled={loading}
                  className="text-primary font-semibold hover:underline disabled:opacity-60"
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
              className="text-xs text-muted-foreground hover:text-foreground mt-3"
            >
              Use a different email
            </button>
          </>
        )}

        {step === 'password' && (
          <>
            <div className={iconWrap}>
              <KeyRound size={36} className="text-primary" />
            </div>
            <h1 className="text-2xl font-bold text-foreground mb-2">Create a new password</h1>
            <p className="text-sm text-muted-foreground mb-6">Use at least 8 characters.</p>
            <div className="relative mb-3">
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="New password"
                className={`${inputCls} pr-12`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            <input
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && savePassword()}
              placeholder="Confirm new password"
              className={inputCls}
            />
            <div className="min-h-[28px] mt-2" aria-live="polite">
              {error && <p className="text-sm text-destructive text-left">{error}</p>}
            </div>
            <Button onClick={savePassword} disabled={loading || !password || !confirm} className="w-full py-2.5 font-semibold">
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> Saving...
                </>
              ) : (
                'Change password'
              )}
            </Button>
          </>
        )}

        {step === 'done' && (
          <>
            <div className={iconWrap}>
              <CheckCircle2 size={44} className="text-primary" />
            </div>
            <h1 className="text-2xl font-bold text-foreground mb-2">Password changed</h1>
            <p className="text-sm text-muted-foreground mb-8">Log in with your new password.</p>
            <Button onClick={() => router.push('/login')} className="w-full py-2.5 font-semibold">
              Back to login
            </Button>
          </>
        )}

        {step !== 'done' && (
          <p className="text-sm text-muted-foreground mt-8">
            Remembered it?{' '}
            <Link href="/login" className="text-primary font-semibold hover:underline">
              Log in
            </Link>
          </p>
        )}
      </div>
    </main>
  )
}