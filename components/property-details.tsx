'use client'

import { useState, type ReactNode } from 'react'
import { MapPin, Clock, BedDouble, Bath, Building2, CalendarCheck, Check, Info } from 'lucide-react'
import {
  amenityLabels,
  availabilityInfo,
  bathroomsLabel,
  bedroomsLabel,
  propertyTypeLabel,
  toMoney,
  upfrontTotal,
} from '@/lib/property-display'

// Phase 8.1 building blocks for the property details page.
// Every value comes from the listing row. Nothing here reads or writes Supabase.

function naira(n: number): string {
  return `₦${n.toLocaleString('en-NG')}`
}

function Section({ title, children, className = '' }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-card border border-border bg-card p-card shadow-rest ${className}`}>
      <h2 className="mb-3 text-h3 font-semibold text-foreground">{title}</h2>
      {children}
    </section>
  )
}

/* ---------------- Title, location, ID, dates ---------------- */

export function PropertyHeader({
  title,
  location,
  publicId,
  listedByLabel,
  addedText,
  updatedText,
}: {
  title: string
  location?: string | null
  publicId?: string | null
  listedByLabel?: string | null
  addedText?: string
  updatedText?: string
}) {
  const meta = [publicId ? `Property ID: ${publicId}` : null, listedByLabel ? `Listed by ${listedByLabel}` : null]
    .filter(Boolean)
    .join(' · ')

  return (
    <header className="rounded-card border border-border bg-cream p-card shadow-rest">
      <span aria-hidden className="mb-3 block h-0.5 w-10 rounded-full bg-featured" />

      <h1 className="text-h2 font-bold text-cream-foreground">{title}</h1>

      {location && (
        <p className="mt-2 flex items-start gap-1.5 text-body text-muted-foreground">
          <MapPin size={16} className="mt-0.5 shrink-0 text-primary" aria-hidden />
          <span>{location}</span>
        </p>
      )}

      {(meta || addedText) && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-muted-foreground">
          {meta && <span>{meta}</span>}
          {addedText && (
            <span className="inline-flex items-center gap-1.5">
              <Clock size={12} className="shrink-0" aria-hidden />
              Added {addedText}
              {updatedText ? ` · Updated ${updatedText}` : ''}
            </span>
          )}
        </div>
      )}
    </header>
  )
}

/* ---------------- Type, bedrooms, bathrooms, availability ---------------- */

function Fact({ icon, children, highlight = false }: { icon: ReactNode; children: ReactNode; highlight?: boolean }) {
  return (
    <li
      className={`flex items-center gap-2.5 rounded-card border px-3 py-3 ${
        highlight ? 'border-primary/30 bg-primary/5' : 'border-border bg-card'
      }`}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary" aria-hidden>
        {icon}
      </span>
      <span className="min-w-0 text-body font-medium text-foreground">{children}</span>
    </li>
  )
}

export function PropertyKeyFacts({
  propertyType,
  bedrooms,
  bathrooms,
  availabilityDate,
}: {
  propertyType?: string | null
  bedrooms?: number | string | null
  bathrooms?: number | string | null
  availabilityDate?: string | null
}) {
  const type = propertyTypeLabel(propertyType)
  const beds = bedroomsLabel(bedrooms)
  const baths = bathroomsLabel(bathrooms)
  const availability = availabilityInfo(availabilityDate)

  return (
    <ul aria-label="Key facts" className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-4">
      {type && <Fact icon={<Building2 size={16} />}>{type}</Fact>}
      {beds && <Fact icon={<BedDouble size={16} />}>{beds}</Fact>}
      {baths && <Fact icon={<Bath size={16} />}>{baths}</Fact>}
      <Fact icon={<CalendarCheck size={16} />} highlight={availability.availableNow}>
        {availability.label}
      </Fact>
    </ul>
  )
}

/* ---------------- Rent and payment terms ---------------- */

export function PropertyRentCard({
  priceMonthly,
  serviceCharge,
  cautionDeposit,
  className = '',
}: {
  priceMonthly?: unknown
  serviceCharge?: unknown
  cautionDeposit?: unknown
  className?: string
}) {
  const rent = toMoney(priceMonthly)
  const service = toMoney(serviceCharge)
  const caution = toMoney(cautionDeposit)
  const total = upfrontTotal({ price_monthly: priceMonthly, service_charge: serviceCharge, caution_deposit: cautionDeposit })
  const hasRent = rent !== null && rent > 0

  const line = (label: string, value: number | null) =>
    value === null ? null : (
      <div className="flex justify-between gap-3 text-body">
        <dt className="text-forest-foreground/75">{label}</dt>
        <dd className="font-semibold">{value > 0 ? naira(value) : 'None'}</dd>
      </div>
    )

  const serviceLine = line('Service charge', service)
  const cautionLine = line('Caution deposit', caution)

  return (
    <section aria-label="Rent and payment terms" className={`rounded-card bg-forest p-card text-forest-foreground shadow-raised ${className}`}>
      <p className="text-caption font-medium uppercase tracking-wide text-forest-foreground/70">Monthly rent</p>

      {hasRent ? (
        <p className="mt-1 flex flex-wrap items-baseline gap-x-2">
          <span className="text-h1 font-bold">{naira(rent as number)}</span>
          <span className="text-caption text-forest-foreground/70">per month</span>
        </p>
      ) : (
        <p className="mt-1 text-h3 font-semibold">Rent not listed</p>
      )}

      {(serviceLine || cautionLine) && (
        <dl className="mt-4 space-y-2 border-t border-white/15 pt-4">
          {serviceLine}
          {cautionLine}
        </dl>
      )}

      {total !== null ? (
        <div className="mt-4 rounded-control border border-featured/40 bg-white/5 p-3">
          <p className="text-caption font-medium uppercase tracking-wide text-forest-foreground/70">Estimated upfront total</p>
          <p className="mt-0.5 text-h2 font-bold text-featured">{naira(total)}</p>
          <p className="mt-1 text-caption leading-snug text-forest-foreground/70">
            Monthly rent + service charge + caution deposit, based on the figures listed. Confirm final amounts with EboHomes before paying.
          </p>
        </div>
      ) : (
        hasRent && (
          <p className="mt-4 flex items-start gap-1.5 text-caption leading-snug text-forest-foreground/70">
            <Info size={13} className="mt-0.5 shrink-0" aria-hidden />
            An upfront total is not shown because some amounts are not listed. Ask EboHomes for the full cost before paying.
          </p>
        )
      )}
    </section>
  )
}

/* ---------------- Description ---------------- */

const READ_MORE_AFTER = 420

export function PropertyDescription({ text, className = '' }: { text: string; className?: string }) {
  const [open, setOpen] = useState(false)
  if (!text) return null
  const long = text.length > READ_MORE_AFTER

  return (
    <Section title="About this property" className={className}>
      <p
        className={`whitespace-pre-line text-body leading-relaxed text-muted-foreground ${
          long && !open ? 'line-clamp-6' : ''
        }`}
      >
        {text}
      </p>

      {long && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="mt-2 text-body font-semibold text-primary hover:underline"
        >
          {open ? 'Show less' : 'Read more'}
        </button>
      )}
    </Section>
  )
}

/* ---------------- Amenities and facilities ---------------- */

export function PropertyAmenities({ amenities, className = '' }: { amenities: unknown; className?: string }) {
  const items = amenityLabels(amenities)
  if (items.length === 0) return null

  return (
    <Section title="Amenities and facilities" className={className}>
      <ul className="grid grid-cols-1 gap-x-4 gap-y-2.5 min-[420px]:grid-cols-2 md:grid-cols-3">
        {items.map((label) => (
          <li key={label} className="flex items-center gap-2 text-body text-foreground">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary" aria-hidden>
              <Check size={12} strokeWidth={3} />
            </span>
            {label}
          </li>
        ))}
      </ul>
    </Section>
  )
}

/* ---------------- Location when there is no map pin ---------------- */

export function PropertyLocationFallback({ address, className = '' }: { address?: string | null; className?: string }) {
  if (!address) return null
  return (
    <Section title="Location" className={className}>
      <p className="flex items-start gap-1.5 text-body text-foreground">
        <MapPin size={16} className="mt-0.5 shrink-0 text-primary" aria-hidden />
        {address}
      </p>
      <p className="mt-2 flex items-start gap-1.5 text-caption text-muted-foreground">
        <Info size={13} className="mt-0.5 shrink-0" aria-hidden />
        A map pin has not been added for this property yet.
      </p>
    </Section>
  )
}
