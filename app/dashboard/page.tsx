'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useInspectedIds } from '@/lib/use-inspected-ids'
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
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { PropertySummary, type PropertyLite } from '@/components/property-summary'
import { listingIsLive } from '@/lib/property-display'
import { groupListings, isNewlyApproved, listingStatusInfo } from '@/lib/listing-status'
import { TONE_CLASS } from '@/lib/viewing-status'

const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

export default function DashboardOverview() {
  const [profile, setProfile] = useState<any>(null)
  const [listings, setListings] = useState<any[]>([])
  const [activity, setActivity] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const inspected = useInspectedIds(listings.map((l) => l.id))

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setLoading(false)
        return
      }

      const [pRes, lRes, nRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).single(),
        supabase.from('listings').select('*, properties(public_id)').eq('landlord_id', user.id).order('created_at', { ascending: false }),
        supabase.from('notifications').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(5),
      ])
      if (lRes.error) setFailed(true)
      setProfile(pRes.data)
      setListings(lRes.data ?? [])
      setActivity(nRes.data ?? [])
      setLoading(false)
    }
    load()
  }, [])

  const groups = useMemo(() => groupListings(listings), [listings])
  const justApproved = useMemo(() => listings.filter((l) => isNewlyApproved(l, Date.now() - SEVEN_DAYS)), [listings])

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8" aria-busy="true" aria-label="Loading your dashboard">
        <div className="mb-6 h-8 w-64 animate-pulse rounded bg-secondary" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl border border-border bg-card" />
          ))}
        </div>
      </div>
    )
  }

  const firstName = (profile?.full_name ?? profile?.name ?? '').split(' ')[0] || 'there'

  const CARDS = [
    { label: 'Needs your attention', sub: 'Not approved or hidden', value: groups.attention.length, icon: AlertTriangle, color: 'bg-red-50 text-red-800', href: '/dashboard/listings#group-attention' },
    { label: 'Under review', sub: 'EboHomes is checking', value: groups.review.length, icon: Clock, color: 'bg-amber-50 text-amber-900', href: '/dashboard/listings#group-review' },
    { label: 'Approved and live', sub: 'Tenants can see these', value: groups.live.length, icon: CheckCircle2, color: 'bg-emerald-50 text-emerald-900', href: '/dashboard/listings#group-live' },
    { label: 'All properties', sub: 'Everything you submitted', value: listings.length, icon: Home, color: 'bg-primary/10 text-primary', href: '/dashboard/listings' },
  ]

  const QUICK_ACTIONS = [
    { label: 'Add new property', sub: 'List a property', icon: Plus, href: '/list-property', color: 'bg-emerald-50 text-emerald-900' },
    { label: 'My properties', sub: 'Status of each one', icon: List, href: '/dashboard/listings', color: 'bg-blue-50 text-blue-900' },
    { label: 'Viewings', sub: 'Appointments for your properties', icon: CalendarClock, href: '/dashboard/viewings', color: 'bg-purple-50 text-purple-900' },
    { label: 'Applications', sub: 'Tenants who applied', icon: FileText, href: '/dashboard/applications', color: 'bg-amber-50 text-amber-900' },
    { label: 'Tenancies', sub: 'Terms, rent and handover', icon: KeyRound, href: '/dashboard/tenancies', color: 'bg-primary/10 text-primary' },
    { label: 'Payments', sub: 'Recorded and verified', icon: CreditCard, href: '/dashboard/payments', color: 'bg-primary/10 text-primary' },
  ]

  // The properties that need a decision or a wait, most urgent first.
  const watch = [...groups.attention, ...groups.review].slice(0, 4)

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="mb-1 text-2xl font-bold text-foreground">{greeting()}, {firstName}</h1>
        <p className="text-sm text-muted-foreground">Here is where each of your properties stands.</p>
      </div>

      {failed && (
        <div role="alert" className="mb-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm font-medium text-red-900">
          We could not load your properties, so the numbers below may be wrong. Please refresh the page.
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
          <Link href="/dashboard/listings#group-live" className="mt-3 inline-flex min-h-11 items-center gap-1 rounded-full bg-primary px-4 text-xs font-bold text-primary-foreground">
            See them in My Properties <ArrowRight size={12} aria-hidden />
          </Link>
        </div>
      )}

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {CARDS.map((c) => (
          <Link key={c.label} href={c.href} className="rounded-2xl border border-border bg-card p-4 transition-colors hover:border-primary/40">
            <div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-full ${c.color}`}>
              <c.icon size={16} aria-hidden />
            </div>
            <p className="text-2xl font-extrabold text-foreground">{c.value}</p>
            <p className="text-sm font-semibold text-foreground">{c.label}</p>
            <p className="text-xs text-muted-foreground">{c.sub}</p>
          </Link>
        ))}
      </div>

      <div className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-foreground">What needs your attention</h2>
          <Link href="/dashboard/listings" className="inline-flex min-h-11 items-center gap-1 text-xs font-semibold text-primary">
            All properties <ArrowRight size={12} aria-hidden />
          </Link>
        </div>
        {watch.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
            {listings.length === 0
              ? 'You have not added a property yet.'
              : 'Nothing needs your attention right now. Your other properties are live or paused.'}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {watch.map((l) => {
              const info = listingStatusInfo(l.status)
              return (
                <div key={l.id} className="rounded-2xl border border-border bg-card p-4">
                  <span className={`mb-3 inline-block rounded-full border px-2.5 py-1 text-xs font-bold ${TONE_CLASS[info.tone]}`}>{info.label}</span>
                  <PropertySummary
                    compact
                    listing={l as PropertyLite}
                    inspected={inspected.has(l.id)}
                    href={listingIsLive(l.status) ? `/listing/${l.id}` : undefined}
                  />
                  <p className="mt-3 text-sm text-foreground">{info.meaning}</p>
                  <p className="mt-1 text-sm font-semibold text-foreground">Next: <span className="font-normal">{info.next}</span></p>
                  {l.status === 'rejected' && l.rejection_reason && (
                    <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-900">
                      <span className="font-semibold">Reason from EboHomes:</span> {l.rejection_reason}
                    </p>
                  )}
                  <Link href={`/dashboard/listings#listing-${l.id}`} className="mt-3 inline-flex min-h-11 items-center rounded-full border border-border px-4 text-xs font-bold text-foreground hover:bg-secondary">
                    Open this property
                  </Link>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="mb-8">
        <h2 className="mb-3 text-lg font-bold text-foreground">Go to</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {QUICK_ACTIONS.map((a) => (
            <Link
              key={a.label}
              href={a.href}
              className="rounded-2xl border border-border bg-card p-4 text-left transition-all hover:border-primary/40 hover:shadow-sm"
            >
              <div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-full ${a.color}`}>
                <a.icon size={16} aria-hidden />
              </div>
              <p className="text-sm font-semibold text-foreground">{a.label}</p>
              <p className="text-xs text-muted-foreground">{a.sub}</p>
            </Link>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-bold text-foreground">Recent updates</h2>
          <Link href="/notifications" className="inline-flex min-h-11 items-center text-xs font-semibold text-primary">View all</Link>
        </div>
        {activity.length === 0 ? (
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