'use client'

import { useId, useState, type ComponentType, type InputHTMLAttributes, type ReactNode } from 'react'
import { AlertCircle, CheckCircle2, Eye, EyeOff, Info } from 'lucide-react'

// Building blocks for the sign-in and onboarding screens. Presentation only:
// no authentication, no Supabase, no navigation. Every value and handler is passed in.

type IconType = ComponentType<{ size?: number; className?: string }>

const inputBase =
  'h-12 w-full rounded-control border bg-background text-base text-foreground placeholder:text-muted-foreground outline-none transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-60'

type AuthFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> & {
  label: string
  icon?: IconType
  /** Helper text shown under the field */
  hint?: string
  /** Error text for this field. Shown in red and announced to screen readers. */
  error?: string
  /** Shows "(optional)" after the label */
  optional?: boolean
  /** Button or other control placed inside the right edge of the field */
  trailing?: ReactNode
}

export function AuthField({ label, icon: Icon, hint, error, optional, trailing, id, ...input }: AuthFieldProps) {
  const autoId = useId()
  const fieldId = id ?? autoId
  const hintId = `${fieldId}-hint`
  const errorId = `${fieldId}-error`
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined

  return (
    <div>
      <label htmlFor={fieldId} className="mb-1.5 block text-label font-semibold text-foreground">
        {label}
        {optional && <span className="ml-1 font-normal text-muted-foreground">(optional)</span>}
      </label>
      <div className="relative">
        {Icon && (
          <Icon
            size={18}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
        )}
        <input
          id={fieldId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          {...input}
          className={`${inputBase} ${Icon ? 'pl-11' : 'pl-3.5'} ${trailing ? 'pr-12' : 'pr-3.5'} ${
            error ? 'border-destructive' : 'border-border'
          }`}
        />
        {trailing && <div className="absolute right-1 top-1/2 -translate-y-1/2">{trailing}</div>}
      </div>
      {hint && !error && (
        <p id={hintId} className="mt-1.5 text-caption text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="mt-1.5 flex items-start gap-1.5 text-caption font-medium text-destructive">
          <AlertCircle size={14} className="mt-0.5 shrink-0" aria-hidden />
          {error}
        </p>
      )}
    </div>
  )
}

type PasswordFieldProps = Omit<AuthFieldProps, 'type' | 'trailing' | 'icon'> & {
  icon?: IconType
  /** Word used in the toggle label, e.g. "password" or "new password" */
  noun?: string
}

// A password field with a show/hide button that is at least 44px and labelled for screen readers.
export function PasswordField({ icon, noun = 'password', ...rest }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false)
  return (
    <AuthField
      {...rest}
      icon={icon}
      type={visible ? 'text' : 'password'}
      trailing={
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? `Hide ${noun}` : `Show ${noun}`}
          aria-pressed={visible}
          className="flex h-11 w-11 items-center justify-center rounded-control text-muted-foreground transition hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
        >
          {visible ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
        </button>
      }
    />
  )
}

// A message box. Errors interrupt screen readers (alert); success and info are polite (status).
export function AuthAlert({
  tone = 'error',
  children,
  className = '',
}: {
  tone?: 'error' | 'success' | 'info'
  children: ReactNode
  className?: string
}) {
  const styles = {
    error: 'border-destructive/30 bg-destructive/10 text-destructive',
    success: 'border-success/30 bg-success-soft text-success',
    info: 'border-info/30 bg-info-soft text-info',
  }[tone]
  const Icon = tone === 'error' ? AlertCircle : tone === 'success' ? CheckCircle2 : Info
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`flex items-start gap-2 rounded-control border p-3 text-body ${styles} ${className}`}
    >
      <Icon size={16} className="mt-0.5 shrink-0" aria-hidden />
      <div className="min-w-0">{children}</div>
    </div>
  )
}

// "Step 2 of 3" progress. Labels stay visible on phones.
export function AuthStepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <nav aria-label={`Sign-up progress, step ${current} of ${steps.length}`} className="mb-6">
      <ol className="flex items-start">
        {steps.map((label, i) => {
          const n = i + 1
          const done = current > n
          const active = current === n
          return (
            <li
              key={label}
              aria-current={active ? 'step' : undefined}
              className={`flex flex-1 flex-col items-center text-center ${i > 0 ? 'relative' : ''}`}
            >
              {i > 0 && (
                <span
                  aria-hidden
                  className={`absolute right-1/2 top-4 h-0.5 w-full -translate-y-1/2 ${current >= n ? 'bg-primary' : 'bg-border'}`}
                />
              )}
              <span
                className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full text-label font-bold ${
                  done || active ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
                }`}
              >
                {done ? <CheckCircle2 size={16} aria-hidden /> : n}
              </span>
              <span
                className={`mt-1.5 text-caption ${active ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}
              >
                {label}
                <span className="sr-only">{done ? ' (done)' : active ? ' (current step)' : ''}</span>
              </span>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
