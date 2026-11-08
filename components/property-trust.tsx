'use client'

import { useId, useState, type ComponentType } from 'react'
import {
  ShieldCheck,
  ShieldQuestion,
  FileCheck2,
  FileQuestion,
  ClipboardCheck,
  ClipboardList,
  Info,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  AlertTriangle,
  Route,
  Droplet,
  Zap,
  Wifi,
  Lock,
  Building2,
  Leaf,
  Home,
} from 'lucide-react'
import {
  identityState,
  inspectionState,
  inspectionDetails,
  formatInspectionDate,
  nearbyText,
  type RowState,
  type IconKey,
} from '@/lib/property-trust'
import { authorityState, PUBLIC_INDICATOR_TEXT } from '@/lib/listing-authority'

const DETAIL_ICONS: Record<IconKey, ComponentType<{ size?: number; className?: string }>> = {
  route: Route,
  droplet: Droplet,
  zap: Zap,
  wifi: Wifi,
  lock: Lock,
  building: Building2,
  leaf: Leaf,
  home: Home,
}

// One line in the block: an icon, a short title and a plain explanation.
function Row({
  state,
  YesIcon,
  NoIcon,
  yesTitle,
  noTitle,
  yesText,
  noText,
  children,
}: {
  state: RowState
  YesIcon: ComponentType<{ size?: number; className?: string }>
  NoIcon: ComponentType<{ size?: number; className?: string }>
  yesTitle: string
  noTitle: string
  yesText: string
  noText: string
  children?: React.ReactNode
}) {
  const yes = state === 'yes'
  const unavailable = state === 'unavailable'
  const Icon = yes ? YesIcon : NoIcon
  const title = yes ? yesTitle : unavailable ? 'Not available right now' : noTitle
  const body = yes ? yesText : unavailable ? 'We could not load this information. Please refresh the page.' : noText

  return (
    <li className="flex items-start gap-3">
      <span
        className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
          yes ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
        }`}
        aria-hidden
      >
        <Icon size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-body font-semibold text-foreground">{title}</p>
        <p className="text-caption text-muted-foreground">{body}</p>
        {children}
      </div>
    </li>
  )
}

function DetailList({ items, bold }: { items: ReturnType<typeof inspectionDetails>['facts']; bold: boolean }) {
  return (
    <>
      {items.map(({ key, label, icon, value, match }) => {
        const Icon = DETAIL_ICONS[icon]
        return (
          <div key={key} className="flex items-start gap-2">
            <Icon size={16} className="mt-0.5 shrink-0 text-primary" />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-caption font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
                {match === true && <CheckCircle2 size={12} className="shrink-0 text-primary" aria-label="Matches the listing" />}
                {match === false && <AlertTriangle size={12} className="shrink-0 text-destructive" aria-label="Differs from the listing" />}
              </div>
              <p className={`text-body text-foreground ${bold ? 'font-medium' : ''}`}>{value}</p>
              {match === false && <p className="mt-0.5 text-caption text-destructive">Differs from listing description</p>}
            </div>
          </div>
        )
      })}
    </>
  )
}

// Trust and verification for one listing.
// trust = the existing listing_trust record. inspection = the existing public inspection record.
// Failed flags mean the data could not be loaded, which is different from "not checked".
export function PropertyTrust({
  trust,
  trustFailed = false,
  authorityReviewed,
  authorityFailed = false,
  inspection,
  inspectionFailed = false,
  className = '',
}: {
  trust: unknown
  trustFailed?: boolean
  authorityReviewed: boolean | null
  authorityFailed?: boolean
  inspection: unknown
  inspectionFailed?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const panelId = useId()

  const identity = identityState(trust, trustFailed)
  const authority = authorityState(authorityReviewed ? 'accepted' : null, authorityFailed || authorityReviewed === null)
  const inspected = inspectionState(inspection, inspectionFailed)

  const date = inspected === 'yes' ? formatInspectionDate((inspection as { inspected_at?: unknown }).inspected_at) : ''
  const { facts, notes } = inspectionDetails(inspection)
  const nearby = nearbyText(inspection)
  const hasDetails = facts.length + notes.length + nearby.length > 0

  return (
    <section
      id="trust"
      aria-labelledby="trust-heading"
      className={`scroll-mt-24 rounded-card border border-border bg-card p-card shadow-rest ${className}`}
    >
      <h2 id="trust-heading" className="mb-1 flex items-center gap-2 text-h3 font-semibold text-foreground">
        <ShieldCheck size={18} className="text-primary" aria-hidden />
        Trust and verification
      </h2>
      <p className="mb-4 text-caption text-muted-foreground">
        This shows what EboHomes has actually checked. Anything not marked as checked has not been confirmed.
      </p>

      <ul className="space-y-4">
        <Row
          state={identity}
          YesIcon={ShieldCheck}
          NoIcon={ShieldQuestion}
          yesTitle="Landlord identity checked"
          noTitle="Landlord identity not yet checked"
          yesText="EboHomes reviewed the identity document this landlord submitted."
          noText="EboHomes has not confirmed who this landlord is."
        />

        <Row
          state={authority}
          YesIcon={FileCheck2}
          NoIcon={FileQuestion}
          yesTitle={PUBLIC_INDICATOR_TEXT.authority.title}
          noTitle="Authority not yet reviewed"
          yesText={PUBLIC_INDICATOR_TEXT.authority.meaning}
          noText="EboHomes has not reviewed evidence that the lister may rent out this property."
        />

        <Row
          state={inspected}
          YesIcon={ClipboardCheck}
          NoIcon={ClipboardList}
          yesTitle={date ? `Inspected by EboHomes on ${date}` : 'Inspected by EboHomes'}
          noTitle="Not inspected yet"
          yesText="An EboHomes inspector visited this property and EboHomes reviewed the report."
          noText="EboHomes has no current inspection of this property on record."
        >
          {inspected === 'yes' && hasDetails && (
            <button
              type="button"
              onClick={() => setOpen((value) => !value)}
              aria-expanded={open}
              aria-controls={panelId}
              className="mt-2 inline-flex items-center gap-1 text-caption font-semibold text-primary hover:underline"
            >
              {open ? 'Hide inspection details' : 'See inspection details'}
              {open ? <ChevronUp size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />}
            </button>
          )}
        </Row>
      </ul>

      {inspected === 'yes' && hasDetails && open && (
        <div id={panelId} className="mt-4 overflow-hidden rounded-control border border-border bg-cream">
          {facts.length > 0 && (
            <div className="grid grid-cols-1 gap-4 px-4 py-4 sm:grid-cols-2 lg:grid-cols-3">
              <DetailList items={facts} bold />
            </div>
          )}
          {notes.length > 0 && (
            <div className={`space-y-3 px-4 py-4 ${facts.length > 0 ? 'border-t border-border' : ''}`}>
              <DetailList items={notes} bold={false} />
            </div>
          )}
          {nearby !== '' && (
            <p className="border-t border-border px-4 py-3 text-body text-foreground">
              <span className="font-semibold">Nearby: </span>
              {nearby}
            </p>
          )}
        </div>
      )}

      <div className="mt-4 flex items-start gap-2 rounded-control bg-cream px-3 py-3">
        <Info size={16} className="mt-0.5 shrink-0 text-primary" aria-hidden />
        <div className="space-y-1.5 text-caption text-cream-foreground">
          <p>
            Checking a landlord&apos;s identity does not prove that they own, or are allowed to rent out, this
            specific property. {PUBLIC_INDICATOR_TEXT.authority.limit}
          </p>
          <p>
            An inspection looks at the physical property only. It does not confirm ownership, the right to rent it out,
            the rental terms or availability. Check the property and the documents yourself before you pay.
          </p>
          <p>
            These checks help you decide, but they cannot guarantee that a listing is free from fraud. Never pay
            outside EboHomes.
          </p>
        </div>
      </div>
    </section>
  )
}
