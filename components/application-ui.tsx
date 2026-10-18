import { Check } from 'lucide-react'
import { describeApplicationData } from '@/lib/application-form'
import { applicationStage, STAGE_HELP, STAGE_LABEL, STAGE_TONE } from '@/lib/application-status'

// Status pill. Text label always accompanies the colour.
export function ApplicationStatusBadge({
status,
className = '',
}: {
status: string
className?: string
}) {
const stage = applicationStage({ status })

return (
<span
title={STAGE_HELP[stage]}
className={"inline-flex items-center whitespace-nowrap text-xs font-semibold px-2.5 py-1 rounded-full border ${STAGE_TONE[stage]} ${className}"}
>
{STAGE_LABEL[stage]}
</span>
)
}

export function StatusHelp({
status,
className = '',
}: {
status: string
className?: string
}) {
return (
<p className={"text-xs text-muted-foreground ${className}"}>
{STAGE_HELP[applicationStage({ status })]}
</p>
)
}

// Applicant facts from application_data. Phone numbers are never displayed here.
export function ApplicantFacts({ data }: { data: unknown }) {
const rows = describeApplicationData(data)

if (rows.length === 0) return null

return (
<dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 rounded-lg bg-secondary/60 p-3">
{rows.map((row) => (
<div key={row.label} className="min-w-0">
<dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
{row.label}
</dt>
<dd className="text-sm font-medium text-foreground break-words">
{row.value}
</dd>
</div>
))}
</dl>
)
}

// Progress indicator for the application flow. current is zero-based.
export function Stepper({
steps,
current,
}: {
steps: string[]
current: number
}) {
return (
<ol className="flex items-center" aria-label="Application progress">
{steps.map((label, index) => {
const done = index < current
const active = index === current

    return (
      <li
        key={label}
        className="flex items-center flex-1 last:flex-none"
        aria-current={active ? 'step' : undefined}
      >
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold border-2 ${
            done
              ? 'bg-primary border-primary text-primary-foreground'
              : active
                ? 'border-primary text-primary bg-card'
                : 'border-border text-muted-foreground bg-card'
          }`}
        >
          {done ? <Check size={14} aria-hidden /> : index + 1}
        </span>

        <span
          className={`ml-2 text-xs sm:text-sm ${
            active
              ? 'font-semibold text-foreground'
              : 'text-muted-foreground'
          }`}
        >
          {label}
          <span className="sr-only">
            {done
              ? ' (completed)'
              : active
                ? ' (current step)'
                : ''}
          </span>
        </span>

        {index < steps.length - 1 && (
          <span
            aria-hidden
            className={`mx-2 sm:mx-3 h-0.5 flex-1 rounded ${
              done ? 'bg-primary' : 'bg-border'
            }`}
          />
        )}
      </li>
    )
  })}
</ol>

)
}