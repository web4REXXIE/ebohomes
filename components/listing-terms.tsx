import { FileText } from 'lucide-react'

// The rental terms the landlord set when listing. Read only. Every value comes from the listing row.
// Nothing is shown when the landlord set none of them. A term that was not set says "Not listed", never a guess.

function num(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN
  return Number.isFinite(n) ? n : null
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null
}

export function ListingTerms({
  durationMonths,
  noticeDays,
  paymentSchedule,
  houseRules,
  className = '',
}: {
  durationMonths?: unknown
  noticeDays?: unknown
  paymentSchedule?: unknown
  houseRules?: unknown
  className?: string
}) {
  const months = num(durationMonths)
  const notice = num(noticeDays)
  const schedule = str(paymentSchedule)
  const rules = str(houseRules)

  if (months === null && notice === null && !schedule && !rules) return null

  const row = (label: string, value: string | null) => (
    <div className="flex justify-between gap-3 text-body">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={value === null ? 'font-medium text-muted-foreground' : 'text-right font-semibold text-foreground'}>
        {value ?? 'Not listed'}
      </dd>
    </div>
  )

  return (
    <section aria-label="Rental terms" className={`rounded-card border border-border bg-card p-card shadow-rest ${className}`}>
      <h2 className="mb-3 flex items-center gap-2 text-h3 font-semibold text-foreground">
        <FileText size={18} className="text-primary" aria-hidden /> Rental terms
      </h2>
      <dl className="space-y-2">
        {row('Tenancy length', months === null ? null : `${months} ${months === 1 ? 'month' : 'months'}`)}
        {row('Notice period', notice === null ? null : `${notice} ${notice === 1 ? 'day' : 'days'}`)}
        {row('How rent is paid', schedule)}
      </dl>
      {rules && (
        <div className="mt-3 border-t border-border pt-3">
          <p className="text-caption font-medium uppercase tracking-wide text-muted-foreground">House rules</p>
          <p className="mt-1 whitespace-pre-line text-body text-foreground">{rules}</p>
        </div>
      )}
      <p className="mt-3 text-caption leading-snug text-muted-foreground">
        Set by the landlord. EboHomes confirms the final terms with you before you pay anything.
      </p>
    </section>
  )
}
