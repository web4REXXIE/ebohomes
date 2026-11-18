'use client'

import { useEffect, useId, useState, type ComponentType } from 'react'
import {
  ShieldCheck,
  ShieldQuestion,
  FileCheck2,
  FileQuestion,
  FileSearch,
  ClipboardCheck,
  ClipboardList,
  Info,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  AlertTriangle,
  FileText,
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
  parseCheckDates,
  documentsState,
  withDate,
  isTrusted,
  type CheckDates,
  type RowState,
  type IconKey,
} from '@/lib/property-trust'
import { supabase } from '@/lib/supabase'
import { TrustedBadge } from '@/components/trusted-badge'
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

// What EboHomes has checked for one listing.
// trust = the existing listing_trust record. inspection = the existing public inspection record.
// Failed flags mean the data could not be loaded, which is different from "not checked".
export function PropertyTrust({
  listingId,
  trust,
  trustFailed = false,
  authorityReviewed,
  authorityFailed = false,
  inspection,
  inspectionFailed = false,
  className = '',
}: {
  listingId: string
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

  // Dates for the checks, and the earned Trusted label. Both come from the database and are read-only here.
  const [dates, setDates] = useState<CheckDates | null>(null)
  const [datesFailed, setDatesFailed] = useState(false)
  const [datesLoaded, setDatesLoaded] = useState(false)
  const [trusted, setTrusted] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [datesResult, trustedResult] = await Promise.all([
          supabase.rpc('listing_check_dates', { p_listing: listingId }),
          supabase.rpc('listing_landlord_trusted', { p_listing: listingId }),
        ])
        if (cancelled) return
        const parsed = datesResult.error ? null : parseCheckDates(datesResult.data)
        setDates(parsed)
        setDatesFailed(parsed === null)
        // If the Trusted lookup fails we simply do not show the label. We never guess it.
        setTrusted(!trustedResult.error && isTrusted(trustedResult.data))
      } catch {
        if (!cancelled) {
          setDates(null)
          setDatesFailed(true)
          setTrusted(false)
        }
      } finally {
        if (!cancelled) setDatesLoaded(true)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [listingId])

  const identity = identityState(trust, trustFailed)
  const authority = authorityState(authorityReviewed ? 'accepted' : null, authorityFailed || authorityReviewed === null)
  const inspected = inspectionState(inspection, inspectionFailed)

  const documents = documentsState(dates, datesFailed)

  // The documents row waits until its data has loaded, so it never flashes "could not load".
  const showDocuments = datesLoaded
  const states = showDocuments ? [identity, documents, authority, inspected] : [identity, authority, inspected]
  const checksDone = states.filter((s) => s === 'yes').length
  // Only count when every check could be read. Otherwise "1 of 4" could be wrong.
  const canCount = showDocuments && states.every((s) => s !== 'unavailable')

  const date = inspected === 'yes' ? formatInspectionDate((inspection as { inspected_at?: unknown }).inspected_at) : ''
  const { facts, notes } = inspectionDetails(inspection)
  const nearby = nearbyText(inspection)
  const hasDetails = facts.length + notes.length + nearby.length > 0

  const checks: {
    key: string
    state: RowState
    YesIcon: ComponentType<{ size?: number; className?: string }>
    NoIcon: ComponentType<{ size?: number; className?: string }>
    yesTitle: string
    noTitle: string
    yesText: string
    noText: string
    extra?: React.ReactNode
  }[] = [
    {
      key: 'identity', state: identity, YesIcon: ShieldCheck, NoIcon: ShieldQuestion,
      yesTitle: withDate('Landlord identity checked', dates?.identityAt),
      noTitle: 'Landlord identity not yet checked',
      yesText: 'EboHomes reviewed the identity document this landlord submitted.',
      noText: 'EboHomes has not confirmed who this landlord is.',
    },
    ...(showDocuments
      ? [
          {
            key: 'documents', state: documents, YesIcon: FileSearch, NoIcon: FileSearch,
            yesTitle: withDate('Property documents reviewed', dates?.documentsAt),
            noTitle: 'Property documents not yet reviewed',
            yesText: 'EboHomes looked at the documents submitted for this property and found at least one acceptable.',
            noText: 'EboHomes has not reviewed any document for this property yet.',
          },
        ]
      : []),
    {
      key: 'authority', state: authority, YesIcon: FileCheck2, NoIcon: FileQuestion,
      yesTitle: withDate('Listing authority checked', dates?.authorityAt),
      noTitle: 'Listing authority not yet checked',
      yesText: PUBLIC_INDICATOR_TEXT.authority.meaning,
      noText: 'EboHomes has not reviewed evidence that the lister may rent out this property.',
    },
    {
      key: 'inspection', state: inspected, YesIcon: ClipboardCheck, NoIcon: ClipboardList,
      yesTitle: date ? `Inspected by EboHomes on ${date}` : 'Inspected by EboHomes',
      noTitle: 'Property not inspected yet',
      yesText: 'An EboHomes inspector visited this property and EboHomes reviewed the report.',
      noText: 'EboHomes has no current inspection of this property on record.',
      extra: inspected === 'yes' && hasDetails ? (
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
      ) : null,
    },
  ]

  const renderCheck = (c: (typeof checks)[number]) => (
    <Row
      key={c.key}
      state={c.state}
      YesIcon={c.YesIcon}
      NoIcon={c.NoIcon}
      yesTitle={c.yesTitle}
      noTitle={c.noTitle}
      yesText={c.yesText}
      noText={c.noText}
    >
      {c.extra}
    </Row>
  )

  return (
    <section
      id="trust"
      aria-labelledby="trust-heading"
      className={`scroll-mt-24 rounded-card border border-border bg-card p-card shadow-rest ${className}`}
    >
      <h2 id="trust-heading" className="mb-1 flex items-center gap-2 text-h3 font-semibold text-foreground">
        <ShieldCheck size={18} className="text-primary" aria-hidden />
        What EboHomes checked
      </h2>
      <p className="mb-3 text-caption text-muted-foreground">
        This shows what EboHomes has actually checked. Anything not marked as checked has not been confirmed.
      </p>

      {trusted && (
        <div className="mb-4 flex items-start gap-3 rounded-control border border-primary/30 bg-primary/5 p-3">
          <ShieldCheck size={20} className="mt-0.5 shrink-0 text-primary" aria-hidden />
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-body font-semibold text-foreground">
              Trusted landlord <TrustedBadge />
            </p>
            <p className="mt-0.5 text-caption text-muted-foreground">
              Earned, not bought. This landlord has completed several rentals through EboHomes where both sides confirmed the key
              handover, and has no upheld problems on record. It does not replace the checks below.
            </p>
          </div>
        </div>
      )}

      {canCount && (
        <p className="mb-4 text-caption font-medium text-muted-foreground">
          {checksDone === 0 ? 'EboHomes has not checked anything on this listing yet.' : `${checksDone} of 4 checks on record`}
        </p>
      )}
      {!canCount && <div className="mb-4" />}

      {checks.filter((c) => c.state === 'yes').length > 0 && (
        <div className="mb-4">
          <h3 className="mb-2 text-caption font-semibold uppercase tracking-wide text-primary">Checked by EboHomes</h3>
          <ul className="space-y-4">{checks.filter((c) => c.state === 'yes').map(renderCheck)}</ul>
        </div>
      )}

      {checks.filter((c) => c.state === 'no').length > 0 && (
        <div className="mb-4">
          <h3 className="mb-2 text-caption font-semibold uppercase tracking-wide text-muted-foreground">Not yet checked</h3>
          <p className="mb-2 text-caption text-muted-foreground">EboHomes has not independently confirmed these yet.</p>
          <ul className="space-y-4">{checks.filter((c) => c.state === 'no').map(renderCheck)}</ul>
        </div>
      )}

      {checks.filter((c) => c.state === 'unavailable').length > 0 && (
        <div className="mb-4">
          <h3 className="mb-2 text-caption font-semibold uppercase tracking-wide text-muted-foreground">Could not load</h3>
          <ul className="space-y-4">{checks.filter((c) => c.state === 'unavailable').map(renderCheck)}</ul>
        </div>
      )}

      <div className="mb-4">
        <h3 className="mb-2 text-caption font-semibold uppercase tracking-wide text-muted-foreground">Stated by the landlord</h3>
        <ul>
          <li className="flex items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground" aria-hidden>
              <FileText size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-body font-semibold text-foreground">Rent, description and availability</p>
              <p className="text-caption text-muted-foreground">
                The landlord provided these. EboHomes has not independently confirmed them, except where an inspection above says so.
              </p>
            </div>
          </li>
        </ul>
      </div>

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
