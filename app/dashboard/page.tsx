'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import {
  Home,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Bell,
  Plus,
  List,
  CreditCard,
  CalendarClock,
  FileText,
  KeyRound,
  ArrowRight,
  ShieldCheck,
  XCircle,
  Circle,
  HelpCircle,
  Building2,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { displayTitle } from '@/lib/property-display'
import { groupListings, isNewlyApproved } from '@/lib/listing-status'
import { OWNER_LISTING_COLUMNS } from '@/lib/listing-columns'
import { landlordVerificationDisplay, type VerificationDisplayState } from '@/lib/landlord-verification'
import { MetricCard, ToneChip } from '@/components/dashboard-ui'
import { StillAvailableCard } from '@/components/still-available-card'
import { NeedsYou } from '@/components/needs-you'
import { buildNeedsYou } from '@/lib/needs-you'
import { pickListingToConfirm } from '@/lib/availability-check'

const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

const VERIFY_ICON: Record<VerificationDisplayState, typeof ShieldCheck> = {
  verified: CheckCircle2,
  submitted: Clock,
  rejected: XCircle,
  not_submitted: Circle,
  unknown: HelpCircle,
}

export default function DashboardOverview() {
  const [profile, setProfile] = useState<any>(null)
  const [profileFailed, setProfileFailed] = useState(false)
  const [listings, setListings] = useState<any[]>([])
  const [activity, setActivity] = useState<any[]>([])
  const [activityFailed, setActivityFailed] = useState(false)
  // null = could not be loaded. Shown as a dash, never as zero.
  const [openApplications, setOpenApplications] = useState<number | null>(null)
  // Offers waiting for this landlord to confirm. null = could not be loaded. Shown as "could not check", never as "none".
  const [offers, setOffers] = useState<{ id: string; listing_id: string; expires_at: string | null }[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  const load = async () => {
    setLoading(true)
    setFailed(false)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setLoading(false)
      return
    }

    const [pRes, lRes, nRes, aRes, oRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('listings').select(`${OWNER_LISTING_COLUMNS}, properties(public_id)`).eq('landlord_id', user.id).order('created_at', { ascending: false }),
      supabase.from('notifications').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(5),
      // Applications on this landlord's properties that nobody has decided yet. Same filter family as the sidebar badge, read only.
      supabase.from('applications').select('*', { count: 'exact', head: true }).eq('landlord_id', user.id).in('status', ['pending', 'info_requested']),
      // Offers EboHomes issued that differ from the listing. The tenant cannot see them until this landlord confirms.
      supabase.from('rental_offers').select('id, listing_id, expires_at').eq('landlord_id', user.id).eq('status', 'offered').eq('offered_by_role', 'admin').is('landlord_confirmed_at', null),
    ])
    if (lRes.error) setFailed(true)
    setProfileFailed(Boolean(pRes.error) || !pRes.data)
    setProfile(pRes.data)
    setListings(lRes.data ?? [])
    setActivityFailed(Boolean(nRes.error))
    setActivity(nRes.data ?? [])
    setOpenApplications(aRes.error ? null : aRes.count ?? 0)
    setOffers(oRes.error ? null : ((oRes.data ?? []) as { id: string; listing_id: string; expires_at: string | null }[]))
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const groups = useMemo(() => groupListings(listings), [listings])
  const justApproved = useMemo(() => listings.filter((l) => isNewlyApproved(l, Date.now() - SEVEN_DAYS)), [listings])
  const rentedCount = useMemo(() => listings.filter((l) => l.status === 'rented').length, [listings])
  const verification = useMemo(() => landlordVerificationDisplay(profileFailed ? null : profile), [profile, profileFailed])
  // Properties the "Still available?" card should ask about: 4 days or less left, or already paused by the check. The reminder starts at day 10.
  const dueListings = useMemo(
    () => listings.filter((l) => { const p = pickListingToConfirm([l]); return !!p && p.daysLeft <= 4 }),
    [listings]
  )

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8" aria-busy="true" aria-label="Loading your dashboard">
        <div className="mb-6 h-32 animate-pulse rounded-card bg-secondary" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-card border border-border bg-card" />
          ))}
        </div>
      </div>
    )
  }

  const firstName = (profile?.full_name ?? profile?.name ?? '').split(' ')[0] || 'there'
  // When listings failed to load, counts from them are unknown. They are shown as dashes, not zeros.
  const count = (n: number) => (failed ? null : n)

  const METRICS = [
    { label: 'All properties', hint: 'Everything you submitted', value: count(listings.length), icon: Home, tone: 'neutral' as const, href: '/dashboard/listings' },
    { label: 'Approved and live', hint: 'Tenants can see these', value: count(groups.live.length), icon: CheckCircle2, tone: 'success' as const, href: '/dashboard/listings#group-live' },
    { label: 'Rented', hint: 'Payment verified, keys handed over', value: count(rentedCount), icon: KeyRound, tone: 'info' as const, href: '/dashboard/listings#group-other' },
    { label: 'Under review', hint: 'EboHomes is checking', value: count(groups.review.length), icon: Clock, tone: 'warning' as const, href: '/dashboard/listings#group-review' },
    { label: 'Needs your attention', hint: 'Not approved or hidden', value: count(groups.attention.length), icon: AlertTriangle, tone: 'danger' as const, href: '/dashboard/listings#group-attention' },
    { label: 'Open applications', hint: 'Not yet decided', value: openApplications, icon: FileText, tone: 'neutral' as const, href: '/dashboard/applications' },
  ]

  // One list of everything that needs the landlord. See lib/needs-you.ts for the order and the rules.
  const needs = buildNeedsYou({
    now: Date.now(),
    listingsLoaded: !failed,
    listingCount: listings.length,
    attention: groups.attention.map((l) => ({
      id: l.id,
      title: displayTitle(l as any),
      status: l.status,
      reason: l.status === 'suspended' ? l.suspension_reason ?? null : l.rejection_reason ?? null,
    })),
    offers: offers === null ? null : offers.map((o) => ({ id: o.id, title: displayTitle(listings.find((l) => l.id === o.listing_id) as any), expires_at: o.expires_at })),
    verification: { needsAction: verification.needsAction, rejected: verification.state === 'rejected', detail: verification.detail, actionLabel: verification.actionLabel },
    openApplications,
  })

  const QUICK_ACTIONS = [
    { label: 'Add new property', sub: 'List a property', icon: Plus, href: '/list-property' },
    { label: 'My properties', sub: 'Status of each one', icon: List, href: '/dashboard/listings' },
    { label: 'Viewings', sub: 'Appointments for your properties', icon: CalendarClock, href: '/dashboard/viewings' },
    { label: 'Applications', sub: 'Tenants who applied', icon: FileText, href: '/dashboard/applications' },
    { label: 'Tenancies', sub: 'Terms, rent and handover', icon: KeyRound, href: '/dashboard/tenancies' },
    { label: 'Payments', sub: 'Recorded and verified', icon: CreditCard, href: '/dashboard/payments' },
  ]

  const VerifyIcon = VERIFY_ICON[verification.state]

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <section className="mb-6 rounded-card bg-forest-gradient p-5 text-white shadow-rest sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="mb-1 text-2xl font-bold">{greeting()}, {firstName}</h1>
            <p className="text-sm text-white/85">Here is where each of your properties stands.</p>
          </div>
          <Link
            href="/list-property"
            className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-5 text-sm font-bold text-forest"
          >
            <Plus size={16} aria-hidden /> Add new property
          </Link>
        </div>
      </section>

      {failed && (
        <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-danger/40 bg-danger-soft p-3 text-sm font-medium text-danger">
          <span>We could not load your properties, so property numbers are hidden instead of guessed.</span>
          <button onClick={load} className="focus-ring min-h-11 rounded-full border border-danger/40 px-4 text-xs font-bold">
            Try again
          </button>
        </div>
      )}

      {justApproved.length > 0 && (
        <div className="mb-6 rounded-xl border-2 border-emerald-400 bg-emerald-50 p-4">
          <p className="flex items-center gap-2 text-base font-bold text-emerald-900">
            <CheckCircle2 size={20} aria-hidden />
            {justApproved.length === 1
              ? 'One of your properties was approved and is now live'
              : `${justApproved.length} of your properties were approved and are now live`}
          </p>
          <p className="mt-1 text-sm text-emerald-900">EboHomes checked them. Tenants can now find them, request viewings and apply.</p>
          <Link href="/dashboard/listings#group-live" className="focus-ring mt-3 inline-flex min-h-11 items-center gap-1 rounded-full bg-primary px-4 text-xs font-bold text-primary-foreground">
            See them in My Properties <ArrowRight size={12} aria-hidden />
          </Link>
        </div>
      )}

      <NeedsYou items={needs.items} partial={needs.partial} dueCount={failed ? 0 : dueListings.length} onRetry={load}>
        {!failed && (
          <StillAvailableCard
            listings={dueListings}
            onChanged={async () => {
              // Quiet refresh of the listings only, so the card's thank-you message stays on screen.
              const { data: { user } } = await supabase.auth.getUser()
              if (!user) return
              const { data } = await supabase.from('listings').select(`${OWNER_LISTING_COLUMNS}, properties(public_id)`).eq('landlord_id', user.id).order('created_at', { ascending: false })
              if (data) setListings(data)
            }}
          />
        )}
      </NeedsYou>

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-3">
        {METRICS.map((m) => (
          <MetricCard key={m.label} {...m} />
        ))}
      </div>

      <section aria-labelledby="verification-heading" className="mb-8 rounded-card border border-border bg-card p-4 shadow-rest sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 id="verification-heading" className="flex items-center gap-2 text-lg font-bold text-foreground">
            <ShieldCheck size={18} className="text-primary" aria-hidden /> Landlord verification
          </h2>
          <ToneChip tone={verification.tone}>
            <VerifyIcon size={12} aria-hidden /> {verification.label}
          </ToneChip>
        </div>
        <p className="text-sm text-foreground">{verification.detail}</p>
        {verification.state === 'rejected' && profile?.rejection_reason && (
          <p className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
            <span className="font-semibold">Reason from EboHomes:</span> {profile.rejection_reason}
          </p>
        )}
        <p className="mt-3 flex items-start gap-1.5 text-xs text-muted-foreground">
          <Building2 size={14} className="mt-0.5 shrink-0" aria-hidden />
          Verification covers your landlord account. Ownership or authority for each property is checked separately on My Properties.
        </p>
        <Link href="/dashboard/verify" className="focus-ring mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border px-4 text-xs font-bold text-foreground hover:bg-secondary">
          {verification.actionLabel} <ArrowRight size={12} aria-hidden />
        </Link>
      </section>

      <div className="mb-8">
        <h2 className="mb-3 text-lg font-bold text-foreground">Go to</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {QUICK_ACTIONS.map((a) => (
            <Link
              key={a.label}
              href={a.href}
              className="focus-ring rounded-card border border-border bg-card p-4 text-left shadow-rest transition-colors hover:border-primary/50"
            >
              <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                <a.icon size={16} aria-hidden />
              </div>
              <p className="text-sm font-semibold text-foreground">{a.label}</p>
              <p className="text-xs text-muted-foreground">{a.sub}</p>
            </Link>
          ))}
        </div>
      </div>

      <div className="rounded-card border border-border bg-card p-5 shadow-rest">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-bold text-foreground">Recent updates</h2>
          <Link href="/notifications" className="focus-ring inline-flex min-h-11 items-center text-xs font-semibold text-primary">View all</Link>
        </div>
        {activityFailed ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Updates could not be loaded right now.</p>
        ) : activity.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No updates yet.</p>
        ) : (
          <ul className="space-y-4">
            {activity.map((a) => (
              <li key={a.id} className="flex items-start gap-3">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <Bell size={14} className="text-primary" aria-hidden />
                </div>
                <div className="min-w-0">
                  <p className="text-sm text-foreground">{a.title ?? a.message ?? 'Update'}</p>
                  <p className="text-xs text-muted-foreground">{new Date(a.created_at).toLocaleString('en-NG')}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
      }
