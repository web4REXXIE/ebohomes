'use client'

import { Check, FileText, CreditCard, Vote, Plane, IdCard, Lightbulb, Mail, ShieldCheck, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'

// Verification screen building blocks. Presentation only: no data access, no new requirements.
//
// Honesty rule: EboHomes records "submitted" and a final decision. It does not record that a
// reviewer has opened a file, so nothing here says "under review" or "being checked".

export type TrackerStage = 'submit' | 'waiting' | 'decision'
export type TrackerOutcome = 'none' | 'verified' | 'rejected'

const STEPS: { key: TrackerStage; title: string; hint: string }[] = [
  { key: 'submit', title: 'Submit', hint: 'Details and ID' },
  { key: 'waiting', title: 'EboHomes review', hint: 'Waiting for a decision' },
  { key: 'decision', title: 'Decision', hint: 'You are notified' },
]

// current = the step the landlord is on now.
// outcome = only used when current is 'decision', to colour the last step honestly.
export function VerificationTracker({
  current,
  outcome = 'none',
}: {
  current: TrackerStage
  outcome?: TrackerOutcome
}) {
  const currentIndex = STEPS.findIndex((s) => s.key === current)

  return (
    <ol className="flex items-start" aria-label="Verification progress">
      {STEPS.map((step, i) => {
        const isDone = i < currentIndex || (i === currentIndex && step.key === 'decision' && outcome === 'verified')
        const isRejected = i === currentIndex && step.key === 'decision' && outcome === 'rejected'
        const isCurrent = i === currentIndex && !isDone && !isRejected
        const state = isRejected ? 'Not approved' : isDone ? 'Done' : isCurrent ? 'Current step' : 'Not reached yet'

        return (
          <li key={step.key} className="relative flex flex-1 flex-col items-center text-center" aria-current={isCurrent ? 'step' : undefined}>
            {i > 0 && (
              <span
                aria-hidden
                className={cn(
                  'absolute left-[-50%] top-4 h-0.5 w-full',
                  i <= currentIndex ? 'bg-primary' : 'bg-border',
                )}
              />
            )}
            <span
              className={cn(
                'relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-bold',
                isDone && 'border-success bg-success text-white',
                isRejected && 'border-danger bg-danger-soft text-danger',
                isCurrent && 'border-primary bg-card text-primary',
                !isDone && !isRejected && !isCurrent && 'border-border bg-card text-muted-foreground',
              )}
            >
              {isDone ? <Check size={16} aria-hidden /> : isRejected ? '!' : i + 1}
            </span>
            <span className="mt-2 text-xs font-bold text-foreground">{step.title}</span>
            <span className="px-1 text-[11px] leading-tight text-muted-foreground">{step.hint}</span>
            <span className="sr-only">{state}</span>
          </li>
        )
      })}
    </ol>
  )
}

// Big tappable cards instead of a dropdown. The values match the existing id_document_type values,
// so nothing changes in the database or in validation.
export const ID_OPTIONS: { value: string; label: string; note: string; icon: typeof IdCard }[] = [
  { value: 'nin', label: 'NIN slip / card', note: 'National Identification Number', icon: IdCard },
  { value: 'drivers_licence', label: "Driver's licence", note: 'Must not be expired', icon: CreditCard },
  { value: 'voters_card', label: "Voter's card", note: 'Permanent voter\'s card (PVC)', icon: Vote },
  { value: 'intl_passport', label: 'International passport', note: 'Photo page', icon: Plane },
]

export function IdTypePicker({
  value,
  onChange,
}: {
  value: string
  onChange: (next: string) => void
}) {
  return (
    <fieldset>
      <legend className="mb-1 block text-sm font-semibold text-foreground">Government ID type *</legend>
      <p className="mb-3 text-sm text-muted-foreground">Choose the ID you will photograph.</p>
      <div className="space-y-2">
        {ID_OPTIONS.map((opt) => {
          const selected = value === opt.value
          const Icon = opt.icon
          return (
            <label
              key={opt.value}
              className={cn(
                'flex min-h-14 cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors focus-within:ring-2 focus-within:ring-primary',
                selected ? 'border-primary bg-primary/5' : 'border-border bg-card hover:bg-secondary',
              )}
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
                <Icon size={18} aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-foreground">{opt.label}</span>
                <span className="block text-xs text-muted-foreground">{opt.note}</span>
              </span>
              <input
                type="radio"
                name="id-type"
                value={opt.value}
                checked={selected}
                onChange={() => onChange(opt.value)}
                className="h-5 w-5 shrink-0 accent-primary"
              />
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}

// Plain-language photo tips. Text only: no fake sample images.
export function UploadTips() {
  const tips = [
    'Use daylight or a bright room',
    'The ID must not be expired',
    'All four corners must be in the photo',
    'No glare, no blur, no fingers over the text',
    'Name, photo and ID number must be readable',
  ]
  return (
    <section className="rounded-lg border border-border bg-secondary p-4" aria-label="Tips for a good photo">
      <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
        <Lightbulb size={16} className="text-primary" aria-hidden /> Tips for a photo we can accept
      </p>
      <ul className="space-y-1.5">
        {tips.map((t) => (
          <li key={t} className="flex items-start gap-2 text-sm text-muted-foreground">
            <Check size={14} className="mt-1 shrink-0 text-success" aria-hidden />
            <span>{t}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 flex items-start gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
        <ShieldCheck size={14} className="mt-0.5 shrink-0 text-primary" aria-hidden />
        <span>Your ID and selfie are used only to verify your identity.</span>
      </p>
    </section>
  )
}

// Shown after submitting. Only says what the system really does.
export function WhatHappensNext() {
  return (
    <section className="rounded-card border border-border bg-card p-4 shadow-rest" aria-label="What happens next">
      <h2 className="mb-3 font-bold text-foreground">What happens next?</h2>
      <ul className="space-y-3 text-sm text-muted-foreground">
        <li className="flex items-start gap-3">
          <Mail size={18} className="mt-0.5 shrink-0 text-primary" aria-hidden />
          <span>EboHomes will notify you when a decision is recorded.</span>
        </li>
        <li className="flex items-start gap-3">
          <FileText size={18} className="mt-0.5 shrink-0 text-primary" aria-hidden />
          <span>If something is wrong, you will see the reason here and can submit again.</span>
        </li>
        <li className="flex items-start gap-3">
          <Clock size={18} className="mt-0.5 shrink-0 text-primary" aria-hidden />
          <span>
            You can add your payout account while you wait. The account must be in your own name.
          </span>
        </li>
      </ul>
    </section>
  )
}
