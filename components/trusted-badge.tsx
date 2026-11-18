import { ShieldCheck } from 'lucide-react'

// The earned Trusted label. It is shown only when the database says the landlord has earned it.
// Forest green on purpose: gold is kept for Featured listings.
export function TrustedBadge({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-chip bg-primary px-2 py-0.5 text-xs font-bold text-primary-foreground ${className}`}
    >
      <ShieldCheck size={12} aria-hidden />
      Trusted
    </span>
  )
}
